import google.generativeai as genai
import os
import json
import asyncio
from dotenv import load_dotenv
from typing import Tuple
from models import TurnRequest

# Load env variables
load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

MODEL_NAME = "gemini-2.5-flash-lite"

def _stance_pair(turn: TurnRequest) -> Tuple[str, str]:
    u = (turn.user_stance_effective or turn.stance_label or turn.stance or "").strip()
    b = turn.bot_stance_effective
    if b:
        return (u, b)
    st = (turn.stance or "").strip()
    if st in ("For",) or u in ("For", "for", "PRO"):
        return (u, "Against")
    if st in ("Against",) or u in ("Against", "against", "CON"):
        return (u, "For")
    return (u, f"Oppose the user’s custom position. User side: {u}")




async def stream_opponent_rebuttal(turn: TurnRequest):
    """Streams the AI opponent's response back to the user."""
    model = genai.GenerativeModel(MODEL_NAME)
    user_stance, bot_stance = _stance_pair(turn)

    base_rules = f"""
    You are a {turn.difficulty} debate opponent. Your persona is '{turn.persona}'.
    The topic is '{turn.topic}'.
    The user is currently arguing: {user_stance}. You MUST adopt and defend: {bot_stance}.
    RULE 1: Push back hard. Do not hedge. Do not agree with the user.
    RULE 2: Exploit weak arguments ruthlessly.
    RULE 3: Cite plausible data or logical principles to back your claims.
    RULE 4: Use normal English spacing: a space between every word and after punctuation. For emphasis you may use
    **bold** with matched double-asterisks; do not leave bare asterisks.
    """
    if turn.format_phase:
        base_rules += f"\n    Debate section (structured): {turn.format_phase}. Match that phase."

    rebuttal_extras = ""
    if turn.practice_mode == "rebuttal_drill" and turn.turn_kind != "rebuttal_opening":
        rebuttal_extras = """
    REBUTTAL DRILL: In a single message, (1) briefly rebut the user's last point, (2) then on a new
    paragraph start with the label 'Next round —' and give exactly ONE new debatable claim
    (2-4 sentences) the user will rebut next. Do not reference a stopwatch.
    """

    if turn.turn_kind == "session_opening":
        prompt = f"""
    {base_rules}
    SESSION OPENING (this is the very start of the debate, before the user has said anything):
    1) Start with a one-sentence, crisp position statement for your side: {bot_stance}.
    2) Add exactly 2–3 numbered supporting points with plausible data, expert-style reasoning, or clear principles.
    3) Cite at least one concrete-sounding (but not fabricated beyond plausible debate practice) data point or comparison.
    4) End by challenging the user, who will argue: {user_stance}.
    Do not agree with the user. Do not hedge. Keep under ~180 words.
    """
    elif turn.turn_kind == "rebuttal_opening":
        prompt = f"""
    {base_rules}
    REBUTTAL DRILL — you open this round. Say NOTHING about a timer. Give exactly ONE main debatable
    claim or argument in 2–4 sentences that the user must rebut. Number it if you use multiple sub-points. End with a direct challenge; do not yet respond to a user rebuttal (the user has not spoken yet).
    """
    else:
        ctx = ""
        if turn.opponent_last_message:
            ctx = f'Your last argument to them was: """{turn.opponent_last_message[:1200]}"""\n'
        prompt = f"""
    {base_rules}
    {rebuttal_extras}
    {ctx}User's latest argument or rebuttal: {turn.user_argument}
    Provide your direct rebuttal:
    """

    # Stream response
    response = await model.generate_content_async(prompt, stream=True)
    
    async for chunk in response:
        if chunk.text:
            # Yield in SSE (Server-Sent Events) format
            yield f"data: {chunk.text}\n\n"
            await asyncio.sleep(0.01)

async def evaluate_argument_json(user_argument: str) -> dict:
    """Live scoring: runs after each user message (background)."""
    model = genai.GenerativeModel(MODEL_NAME)

    prompt = f"""
    Analyze the following user debate message (judge the message alone, in isolation):
    \"\"\"{user_argument}\"\"\"

    Return a strict JSON object with these keys:
    - "fallacies": array of short strings, each a fallacy name and one-line reason (e.g. "Hasty generalization: ...")
      or []. Include common types: ad hominem, straw man, slippery slope, false dichotomy, appeal to emotion,
      circular reasoning, hasty generalization, etc. when they apply.
    - "evidence_score": integer 1-10: specific data, examples, expert refs vs. purely assertive; flag unsupported
      or likely made-up "statistics" with lower scores in your reasoning.
    - "persuasiveness_score": integer 1-10: clarity, structure, and direct engagement with a counter-position.
    - "logic_score": integer 1-10: quality of reasoning and rebuttal (separate from evidence).
    - "evidence_flags": array of 0-2 short notes if e.g. "assertion without support" or "suspicious unverifiable number".
    """
    
    try:
        response = await model.generate_content_async(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.2, 
            ),
        )
        data = json.loads(response.text)
        for k in ("fallacies", "evidence_flags"):
            if k not in data:
                data[k] = []
        for k, d in (("evidence_score", 0), ("persuasiveness_score", 0), ("logic_score", 0)):
            if k not in data:
                data[k] = d
        return data
    except Exception as e:
        print(f"LLM Scoring Error: {e}")
        return {
            "fallacies": [],
            "evidence_flags": [],
            "evidence_score": 0,
            "persuasiveness_score": 0,
            "logic_score": 0,
        }

async def analyze_debate(messages: list, config: dict) -> dict:
    """Generates a highly detailed post-debate breakdown."""
    model = genai.GenerativeModel(MODEL_NAME)
    
    transcript = ""
    for msg in messages:
        if msg.get("role") == "system":
            continue
        if msg.get("role") == "user":
            role = "User"
        elif msg.get("op"):
            role = f"AI Opponent (persona slot {msg['op']})"
        else:
            role = "AI Opponent"
        transcript += f"{role}: {msg['content']}\n\n"
        
    practice = config.get("practiceMode") or "standard"
    want_judge = bool(config.get("judgeMode"))
    judge_end = (
        '        "judge": {\n'
        '            "user_total": <float 1-10>,\n'
        '            "opponent_total": <float 1-10>,\n'
        '            "winner": "<user | opponent | draw>",\n'
        '            "rationale": "<string, 3-6 sentences: who won and why, considering clash, evidence, and strategy>"\n'
        "        }"
        if want_judge
        else '        "judge": null'
    )

    prompt = f"""
    You are an expert debate judge and coach. Analyze the following debate transcript and provide a highly detailed, brutally honest evaluation.

    Topic: {config.get('topic')}
    User's Stance: {config.get('stance')}
    Stance label (if any): {config.get("stanceLabel") or ""}
    Practice mode (context only): {practice}. If this was a timed or rebuttal drill, be fair: focus on content quality, not on minor phrasing from time pressure.

    Transcript:
    {transcript}

    Return your evaluation strictly as a JSON object with this structure:
    {{
        "scores": {{
            "logic": <int 1-10>,
            "evidence": <int 1-10>,
            "persuasiveness": <int 1-10>,
            "composite": <float 1.0-10.0>
        }},
        "strongest_arguments": ["<string>"],
        "transcript_annotations": [
            {{"quote": "<exact user quote>", "type": "strong" | "weak", "note": "<string>"}}
        ],
        "fallacies": [
            {{"quote": "<string>", "name": "<string>", "explanation": "<string>"}}
        ],
        "suggestions": {{
            "missed_counters": ["<string>"],
            "helpful_evidence": ["<string>"]
        }},
{judge_end}
    }}
    """
    
    try:
        response = await model.generate_content_async(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.3, # Lowered slightly to ensure strict JSON adherence for this complex schema
            )
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"LLM Report Error: {e}")
        return {"error": "Failed to generate detailed report."}