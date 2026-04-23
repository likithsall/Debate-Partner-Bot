from pydantic import BaseModel
from typing import List, Optional

class DebateSetup(BaseModel):
    topic: str
    stance: str
    difficulty: str
    format: str
    persona: str

class TurnRequest(BaseModel):
    debate_id: str
    user_argument: str = ""
    topic: str
    stance: str
    stance_label: str = ""  # For/Against text or custom one-liner; sent from client
    difficulty: str
    persona: str
    practice_mode: str = "standard"  # standard | timed | rebuttal_drill | switch_sides
    # Optional practice-mode fields
    turn_kind: str = "normal"  # normal | rebuttal_opening | session_opening
    user_stance_effective: Optional[str] = None
    bot_stance_effective: Optional[str] = None
    opponent_last_message: Optional[str] = None
    format_phase: Optional[str] = None  # opening | rebuttal | closing (structured)

class ScoreResponse(BaseModel):
    fallacies: List[str]
    evidence_score: int
    persuasiveness_score: int