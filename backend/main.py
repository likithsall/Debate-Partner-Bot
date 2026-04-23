import asyncio
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import json
from database import init_db
from models import TurnRequest
import uuid
import database
from llm_services import stream_opponent_rebuttal, evaluate_argument_json, analyze_debate

app = FastAPI()
# debate_id -> latest live scoring payload (per user message)
LIVE_SCORES: dict = {}
# Keep references so asyncio tasks are not garbage-collected mid-flight
_LIVE_SCORE_TASKS: set = set()

@app.on_event("startup")
def startup_event():
    init_db()
    print("Database initialized successfully!")

# --- CORS Setup (Crucial so React can talk to FastAPI) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class ReportRequest(BaseModel):
    messages: list
    config: dict


class GoalCreate(BaseModel):
    user_id: str
    label: str
    target_metric: str  # evidence_avg | logic_avg | composite
    target_value: float = Field(ge=0.5, le=10.0)

async def _run_live_score_task(debate_id: str, user_argument: str) -> None:
    """Compute scores while the opponent is still streaming (parallel to SSE), not after."""
    try:
        score_data = await evaluate_argument_json(user_argument)
        if not isinstance(score_data, dict):
            raise ValueError("evaluator did not return an object")
        # Never wait for the stream to finish: BackgroundTasks run after the full body is sent,
        # which for SSE is too late. This task is scheduled with asyncio.create_task from process_turn.
        LIVE_SCORES[debate_id] = {
            "evidence_score": int(score_data.get("evidence_score", 0)),
            "persuasiveness_score": int(score_data.get("persuasiveness_score", 0)),
            "logic_score": int(score_data.get("logic_score", 0)),
            "fallacies": score_data.get("fallacies") or [],
            "evidence_flags": score_data.get("evidence_flags") or [],
        }
        print("Live score ready:", debate_id, LIVE_SCORES[debate_id])
    except Exception as e:
        print("Live score failed:", debate_id, e)
        LIVE_SCORES[debate_id] = {
            "evidence_score": 0,
            "persuasiveness_score": 0,
            "logic_score": 0,
            "fallacies": [],
            "evidence_flags": [],
            "scoring_error": str(e)[:200],
        }


def _schedule_live_score(debate_id: str, user_argument: str) -> None:
    t = asyncio.create_task(_run_live_score_task(debate_id, user_argument))
    _LIVE_SCORE_TASKS.add(t)
    t.add_done_callback(lambda fut: _LIVE_SCORE_TASKS.discard(fut))

# --- API Endpoints ---

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "FastAPI Backend is fully connected!"}


@app.post("/api/debate/turn")
async def process_turn(request: TurnRequest):
    if request.turn_kind not in ("rebuttal_opening", "session_opening") and (request.user_argument or "").strip():
        # Must run in parallel with streaming; Starlette background tasks only run after the
        # full response (including the entire stream) is finished.
        _schedule_live_score(request.debate_id, request.user_argument)

    return StreamingResponse(
        stream_opponent_rebuttal(request),
        media_type="text/event-stream",
    )


@app.get("/api/debate/live-score")
async def get_live_score(debate_id: str = Query(...)):
    data = LIVE_SCORES.get(debate_id) or {
        "evidence_score": 0,
        "persuasiveness_score": 0,
        "logic_score": 0,
        "fallacies": [],
        "evidence_flags": [],
    }
    return data


@app.post("/api/debate/report")
async def generate_report(request: ReportRequest):
    try:
        report_data = await analyze_debate(request.messages, request.config)
        if not isinstance(report_data, dict) or report_data.get("error"):
            return report_data

        user_id = request.config.get("userId", str(uuid.uuid4()))
        debate_id = str(uuid.uuid4())
        base = (request.config.get("shareBaseUrl") or "http://localhost:5173").rstrip("/")

        database.get_or_create_user(user_id)
        database.create_debate(debate_id, user_id, request.config)

        for msg in request.messages:
            if msg.get("role") != "system":
                database.save_transcript_message(
                    debate_id, msg.get("role"), msg.get("content")
                )

        database.update_debate_report(debate_id, report_data)
        share = database.set_debate_share_token(debate_id)
        share_url = f"{base}/?share={share}"

        return {
            **report_data,
            "meta": {
                "debateId": debate_id,
                "shareToken": share,
                "shareUrl": share_url,
            },
        }

    except Exception as e:
        print(f"Error generating report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate report") from e


@app.get("/api/public/report/{token}")
async def public_shared_report(token: str):
    row = database.get_debate_by_share_token(token)
    if not row or not row.get("report_json"):
        raise HTTPException(status_code=404, detail="Report not found")
    did = row["id"]
    return {
        "report": json.loads(row["report_json"]),
        "transcript": database.get_transcript_lines(did),
        "topic": row.get("topic"),
    }


@app.get("/api/user/history")
async def user_history(
    user_id: str = Query(...),
    limit: int = Query(30, ge=1, le=100),
):
    database.get_or_create_user(user_id)
    return {"debates": database.list_debate_summaries(user_id, limit)}


@app.get("/api/debate/saved")
async def get_saved_debate(
    debate_id: str = Query(...),
    user_id: str = Query(...),
):
    database.get_or_create_user(user_id)
    row = database.get_debate_for_user(debate_id, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Debate not found")
    out = {k: row[k] for k in row.keys() if k != "report_json"}
    if row.get("report_json"):
        try:
            out["report"] = json.loads(row["report_json"])
        except (json.JSONDecodeError, TypeError):
            out["report"] = None
    out["transcript"] = database.get_transcript_lines(debate_id)
    return out


@app.get("/api/user/progress")
async def get_user_progress(user_id: str = Query(..., description="Persistent user id from the client")):
    database.get_or_create_user(user_id)
    base = database.get_user_progress(user_id)
    base["goals"] = database.get_goal_progress(user_id)
    return base


@app.get("/api/user/goals")
async def list_goals(user_id: str = Query(...)):
    database.get_or_create_user(user_id)
    return {"goals": database.get_goal_progress(user_id)}


@app.post("/api/user/goals")
async def create_goal(body: GoalCreate):
    database.get_or_create_user(body.user_id)
    gid = str(uuid.uuid4())
    database.add_practice_goal(
        gid, body.user_id, body.label, body.target_metric, body.target_value
    )
    return {"id": gid, "ok": True}


@app.delete("/api/user/goals/{goal_id}")
async def delete_goal(goal_id: str, user_id: str = Query(...)):
    database.remove_practice_goal(user_id, goal_id)
    return {"ok": True}