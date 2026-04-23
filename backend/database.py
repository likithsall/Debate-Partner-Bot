import sqlite3
import uuid
import json
import secrets
from collections import Counter
from datetime import datetime
from typing import Optional

DB_FILE = "debate_bot.db"

def get_db():
    """Helper function to connect to the database."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row # Allows us to access columns by name
    return conn

def init_db():
    """Initializes the database and creates tables if they don't exist."""
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 2. Debates Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS debates (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            topic TEXT,
            stance TEXT,
            difficulty TEXT,
            persona TEXT,
            format TEXT,
            practice_mode TEXT DEFAULT 'standard',
            practice_config TEXT,
            share_token TEXT UNIQUE,
            persuasiveness_score INTEGER,
            evidence_score INTEGER,
            summary TEXT,
            report_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    
    # 3. Transcripts Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            debate_id TEXT,
            role TEXT,
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(debate_id) REFERENCES debates(id)
        )
    ''')
    
    conn.commit()
    conn.close()
    _migrate_debates_columns()
    _init_practice_goals_table()


def _migrate_debates_columns():
    """Add columns missing from older debate_bot.db files (CREATE IF NOT EXISTS does not upgrade)."""
    conn = get_db()
    cur = conn.cursor()
    for col, definition in [
        ("practice_mode", "TEXT DEFAULT 'standard'"),
        ("practice_config", "TEXT"),
        ("share_token", "TEXT"),
        ("report_json", "TEXT"),
        ("persuasiveness_score", "INTEGER"),
        ("evidence_score", "INTEGER"),
        ("summary", "TEXT"),
    ]:
        try:
            cur.execute(f"ALTER TABLE debates ADD COLUMN {col} {definition}")
        except sqlite3.OperationalError:
            pass
    conn.commit()
    conn.close()


def _init_practice_goals_table():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS practice_goals (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            label TEXT NOT NULL,
            target_metric TEXT NOT NULL,
            target_value REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active INTEGER DEFAULT 1,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    conn.commit()
    conn.close()


# --- Data Saving Functions ---

def get_or_create_user(user_id: str):
    """Creates a user if they don't already exist."""
    conn = get_db()
    # INSERT OR IGNORE ensures we don't crash if the user already exists
    conn.execute("INSERT OR IGNORE INTO users (id) VALUES (?)", (user_id,))
    conn.commit()
    conn.close()

def create_debate(debate_id: str, user_id: str, config: dict):
    """Saves a new debate session when it ends (report path) or can be used at start if wired."""
    conn = get_db()
    pm = config.get('practiceMode') or config.get('practice_mode') or 'standard'
    pc = config.get('practiceConfig') or config.get('practice_config')
    conn.execute('''
        INSERT INTO debates (id, user_id, topic, stance, difficulty, persona, format, practice_mode, practice_config)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        debate_id, user_id, config.get('topic'), config.get('stance'),
        config.get('difficulty'), config.get('persona'), config.get('format'),
        pm, json.dumps(pc) if isinstance(pc, dict) else (pc or None)
    ))
    conn.commit()
    conn.close()

def save_transcript_message(debate_id: str, role: str, content: str):
    """Saves a single message to the transcript."""
    conn = get_db()
    conn.execute('''
        INSERT INTO transcripts (debate_id, role, content)
        VALUES (?, ?, ?)
    ''', (debate_id, role, content))
    conn.commit()
    conn.close()

def update_debate_report(debate_id: str, report: dict):
    """Updates a debate with the final complex report JSON."""
    conn = get_db()
    scores = report.get("scores") or {}
    conn.execute('''
        UPDATE debates
        SET report_json = ?,
            persuasiveness_score = ?,
            evidence_score = ?,
            summary = ?
        WHERE id = ?
    ''', (
        json.dumps(report),
        scores.get("persuasiveness"),
        scores.get("evidence"),
        (report.get("strongest_arguments") or [""])[0] if report.get("strongest_arguments") else None,
        debate_id
    ))
    conn.commit()
    conn.close()


def list_debates_with_reports(user_id: str, limit: int = 50):
    """Returns debates that have a generated report, newest first."""
    _migrate_debates_columns()
    conn = get_db()
    cur = conn.execute('''
        SELECT id, topic, stance, practice_mode, report_json, created_at
        FROM debates
        WHERE user_id = ? AND report_json IS NOT NULL AND report_json != ''
        ORDER BY created_at DESC
        LIMIT ?
    ''', (user_id, limit))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def add_practice_goal(goal_id: str, user_id: str, label: str, target_metric: str, target_value: float):
    conn = get_db()
    conn.execute('''
        INSERT INTO practice_goals (id, user_id, label, target_metric, target_value)
        VALUES (?, ?, ?, ?, ?)
    ''', (goal_id, user_id, label, target_metric, target_value))
    conn.commit()
    conn.close()


def list_practice_goals(user_id: str):
    conn = get_db()
    cur = conn.execute('''
        SELECT id, label, target_metric, target_value, created_at, is_active
        FROM practice_goals
        WHERE user_id = ? AND is_active = 1
        ORDER BY created_at DESC
    ''', (user_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def remove_practice_goal(user_id: str, goal_id: str):
    conn = get_db()
    conn.execute(
        "UPDATE practice_goals SET is_active = 0 WHERE id = ? AND user_id = ?",
        (goal_id, user_id)
    )
    conn.commit()
    conn.close()


def set_debate_share_token(debate_id: str) -> str:
    token = secrets.token_urlsafe(9).replace("=", "")
    conn = get_db()
    conn.execute("UPDATE debates SET share_token = ? WHERE id = ?", (token, debate_id))
    conn.commit()
    conn.close()
    return token


def get_debate_by_share_token(token: str) -> Optional[dict]:
    conn = get_db()
    cur = conn.execute(
        "SELECT * FROM debates WHERE share_token = ?",
        (token,),
    )
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_debate_for_user(debate_id: str, user_id: str) -> Optional[dict]:
    conn = get_db()
    cur = conn.execute(
        "SELECT * FROM debates WHERE id = ? AND user_id = ?",
        (debate_id, user_id),
    )
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_transcript_lines(debate_id: str) -> list:
    conn = get_db()
    cur = conn.execute(
        "SELECT role, content FROM transcripts WHERE debate_id = ? ORDER BY id ASC",
        (debate_id,),
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def list_debate_summaries(user_id: str, limit: int = 30) -> list:
    try:
        _migrate_debates_columns()
        conn = get_db()
        cur = conn.execute(
            """
            SELECT id, topic, stance, practice_mode, created_at, report_json IS NOT NULL AS has_report
        FROM debates
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (user_id, limit),
        )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
    except sqlite3.OperationalError as e:
        print(f"list_debate_summaries (returning empty): {e}")
        return []


def count_user_messages_in_debate(debate_id: str) -> int:
    conn = get_db()
    cur = conn.execute(
        "SELECT COUNT(*) FROM transcripts WHERE debate_id = ? AND role = 'user'",
        (debate_id,),
    )
    n = cur.fetchone()[0]
    conn.close()
    return n


def empty_user_progress() -> dict:
    """Safe default when there is no data or the DB query cannot run."""
    return {
        "debate_count": 0,
        "evidence_trend": [],
        "fallacy_rate_trend": [],
        "favorite_topics": [],
        "recurring_weaknesses": [],
        "current_metrics": None,
        "averages": {"evidence": None, "logic": None},
    }


def get_user_progress(user_id: str) -> dict:
    """Aggregates dashboard stats from saved reports and transcripts."""
    try:
        rows = list_debates_with_reports(user_id, limit=100)
        if not rows:
            return empty_user_progress()

        evidence_trend = []
        fallacy_rate_trend = []
        topic_counts: Counter = Counter()
        all_fallacy_names_last5: Counter = Counter()

        for row in rows:
            rid, topic = row["id"], row.get("topic") or ""
            if topic:
                topic_counts[topic] += 1
            try:
                report = json.loads(row["report_json"])
            except (TypeError, json.JSONDecodeError):
                continue
            scores = report.get("scores") or {}
            ev = int(scores.get("evidence") or 0)
            d = (row.get("created_at") or "")[:10]
            evidence_trend.append(
                {
                    "date": d,
                    "topic": topic[:40] + ("…" if len(topic) > 40 else ""),
                    "evidence": ev,
                }
            )
            flist = report.get("fallacies") or []
            n_f = len(flist) if isinstance(flist, list) else 0
            n_user = count_user_messages_in_debate(rid) or 1
            fallacy_rate_trend.append(
                {
                    "date": d,
                    "topic": topic[:40] + ("…" if len(topic) > 40 else ""),
                    "rate": round(n_f / n_user, 2),
                }
            )

        recent = list(rows[:5])
        for row in recent:
            try:
                report = json.loads(row["report_json"])
            except (TypeError, json.JSONDecodeError):
                continue
            for f in report.get("fallacies") or []:
                if isinstance(f, dict) and f.get("name"):
                    all_fallacy_names_last5[f["name"].strip()] += 1

        recurring = [
            {
                "name": name,
                "count": c,
                "message": f'You have used {name} arguments in {c} of your last {len(recent)} saved debates where it was detected.',
            }
            for name, c in all_fallacy_names_last5.most_common(5)
            if c >= 2
        ]

        all_ev = [t["evidence"] for t in evidence_trend if t.get("evidence") is not None]
        all_logic = []
        for row in rows:
            try:
                r = json.loads(row["report_json"])
                s = r.get("scores") or {}
                if s.get("logic") is not None:
                    all_logic.append(int(s["logic"]))
            except (TypeError, json.JSONDecodeError, ValueError):
                pass

        favorite_topics = [
            {"topic": t, "count": n} for t, n in topic_counts.most_common(5)
        ]

        current_metrics = None
        if rows:
            try:
                r0 = json.loads(rows[0]["report_json"])
                s0 = r0.get("scores") or {}
            except (TypeError, json.JSONDecodeError, KeyError):
                s0 = {}
            n_recent = min(5, len(rows))
            recent_e, recent_l, recent_c = [], [], []
            for row in rows[:n_recent]:
                try:
                    r = json.loads(row["report_json"])
                    s = r.get("scores") or {}
                    if s.get("evidence") is not None:
                        recent_e.append(int(s["evidence"]))
                    if s.get("logic") is not None:
                        recent_l.append(int(s["logic"]))
                    if s.get("composite") is not None:
                        recent_c.append(float(s["composite"]))
                except (TypeError, json.JSONDecodeError, ValueError):
                    pass
            if recent_e or recent_l or recent_c:
                current_metrics = {
                    "last_debate": {
                        "evidence": s0.get("evidence"),
                        "logic": s0.get("logic"),
                        "persuasiveness": s0.get("persuasiveness"),
                        "composite": s0.get("composite"),
                    },
                    "last_n_avg": {
                        "n": n_recent,
                        "evidence": (sum(recent_e) / len(recent_e)) if recent_e else None,
                        "logic": (sum(recent_l) / len(recent_l)) if recent_l else None,
                        "composite": (sum(recent_c) / len(recent_c)) if recent_c else None,
                    },
                }

        evidence_trend_asc = list(reversed(evidence_trend[-20:]))
        fallacy_rate_asc = list(reversed(fallacy_rate_trend[-20:]))

        return {
            "debate_count": len(rows),
            "evidence_trend": evidence_trend_asc,
            "fallacy_rate_trend": fallacy_rate_asc,
            "favorite_topics": favorite_topics,
            "recurring_weaknesses": recurring,
            "current_metrics": current_metrics,
            "averages": {
                "evidence": (sum(all_ev) / len(all_ev)) if all_ev else None,
                "logic": (sum(all_logic) / len(all_logic)) if all_logic else None,
            },
        }
    except sqlite3.OperationalError as e:
        print(f"get_user_progress (returning empty): {e}")
        return empty_user_progress()


def get_goal_progress(user_id: str) -> list:
    """Merges active goals with current metric values (rolling last-5 average where applicable)."""
    try:
        goals = list_practice_goals(user_id)
        prog = get_user_progress(user_id)
        cm = prog.get("current_metrics") or {}
        last = (cm.get("last_n_avg") or {}) or {}
        avg = prog.get("averages") or {}
        metric_to_current = {
            "evidence_avg": last.get("evidence") or avg.get("evidence"),
            "logic_avg": last.get("logic") or avg.get("logic"),
            "composite": last.get("composite"),
        }
        out = []
        for g in goals:
            m = g["target_metric"]
            current = metric_to_current.get(m)
            if current is None and m in ("evidence_avg", "logic_avg"):
                current = avg.get("evidence" if m == "evidence_avg" else "logic")
            target = g["target_value"]
            if current is not None and target and float(target) > 0:
                pct = min(1.0, max(0.0, float(current) / float(target)))
            else:
                pct = 0.0
            met = current is not None and target is not None and float(current) >= float(target)
            out.append(
                {**g, "current": current, "progress_pct": round(pct * 100, 0), "met": met}
            )
        return out
    except sqlite3.OperationalError as e:
        print(f"get_goal_progress (returning empty): {e}")
        return []