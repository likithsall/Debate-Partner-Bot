# Debate Partner Bot

AI-powered **debate coaching** application: you pick a topic and stance, the model argues the other side in a streaming chat, and you get **live scoring**, a **post-debate report** (fallacies, evidence, logic, judge verdict when enabled), and **progress tracking** with SQLite persistence.

> **Edwisely – Problem 37 (Debate Partner):** MUN-style practice, structured or casual format, and optional multi-opponent, voice, and judge modes.

---

## Tech stack

| Layer | Technology |
|--------|--------------|
| **Frontend** | React 18, Vite 5, Tailwind CSS, Axios |
| **Backend** | Python 3, FastAPI, Uvicorn, Pydantic |
| **AI** | Google Gemini (`gemini-2.5-flash-lite` by default) via `google-generativeai` |
| **Database** | SQLite (`debate_bot.db` in the `backend` folder) |

---

## Repository layout

```
.
├── backend/
│   ├── main.py           # FastAPI app, routes, in-memory live scores, CORS
│   ├── llm_services.py   # Streaming opponent, live evaluation, post-debate “judge” report
│   ├── database.py       # SQLite: users, debates, transcripts, reports, goals, migrations
│   ├── models.py         # Pydantic request models (e.g. `TurnRequest`)
│   ├── requirements.txt
│   └── .env              # create this (see below)
│
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── main.jsx
    │   ├── components/     # SetupScreen, ChatInterface, ReportScreen, LiveScores, UserDashboard
    │   ├── utils/          # e.g. chatFormat.js (**bold** rendering in chat)
    │   └── constants/      # shared UI constants where used
    ├── index.html
    ├── package.json
    └── vite.config.js
```

---

## Prerequisites

- **Node.js** 18+ (for the React app)
- **Python** 3.10+ (3.12+ recommended)
- A **Google AI Studio** (Gemini) API key: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)

---

## Environment variables

In **`backend/.env`** (at the same level as `main.py`):

```env
GEMINI_API_KEY=your_key_here
```

The backend loads this with `python-dotenv`. Without a valid key, generation and live scoring will fail; check the terminal for errors.

---

## Install and run (development)

You need **two** terminals: one for the API, one for the Vite dev server.

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

- Default API URL: **http://localhost:8000**
- Health check: `GET http://localhost:8000/api/health`

On first start, the app creates/updates the SQLite file **`debate_bot.db`** in `backend/`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

- Default UI: **http://localhost:5173** (Vite default)
- The app calls the API at `http://localhost:8000`. If you change the host or port, update the `API` / `http://localhost:8000` strings in `App.jsx` and `ChatInterface.jsx` (or centralize in one config).

### 3. Production build (static frontend)

```bash
cd frontend
npm run build
```

Serve the `frontend/dist` folder with any static host. Point the frontend’s API base URL to your deployed FastAPI instance.

---

## Features (summary)

- **Setup:** Topic, For/Against or custom stance, casual vs structured, difficulty, persona, practice mode (standard, timed, rebuttal drill, switch sides), optional judge, multi-opponent, voice.
- **Chat:** Server-sent events (SSE) streaming; session opening; **``** in messages rendered as bold; full-width layout on the debate screen.
- **Live scoring:** Parallel to streaming; `GET /api/debate/live-score?debate_id=…` polled by the client (logic, evidence, persuasiveness, fallacy hints).
- **Report:** JSON report with scores, fallacies, transcript annotations, coaching, optional **judge** block; save to DB; **Copy share link** (public `GET /api/public/report/{token}` and `?share=…` on the app).
- **History & progress:** List saved debates, open past reports, trends, favorite topics, recurring weakness patterns, practice goals.

---

## API reference (main routes)

| Method | Path | Purpose |
|--------|------|--------|
| `GET` | `/api/health` | Liveness / connectivity |
| `POST` | `/api/debate/turn` | User turn; returns **SSE** stream of opponent text |
| `GET` | `/api/debate/live-score` | Latest live scores for `debate_id` (in-memory, single-worker dev) |
| `POST` | `/api/debate/report` | Full post-debate analysis; persists debate + transcript + report |
| `GET` | `/api/public/report/{token}` | Public, read-only report (and transcript) for shared links |
| `GET` | `/api/user/history` | Debate list for a `user_id` |
| `GET` | `/api/debate/saved` | One debate by `debate_id` + `user_id` (transcript + report) |
| `GET` | `/api/user/progress` | Aggregated stats and goals for `user_id` |
| `GET` / `POST` / `DELETE` | `/api/user/goals` | Practice goals CRUD |

Query parameters and bodies match the Pydantic models in `backend/models.py` and `main.py`.

---

## Notes and limitations

- **CORS** is set to `allow_origins=["*"]` for local development. Restrict origins in production.
- **Live scores** are stored **in process memory**. If you run **multiple** Uvicorn workers, a poll can hit a different process and see empty scores; use a single worker locally or add shared storage (e.g. Redis) later.
- **SQLite** file `backend/debate_bot.db` is suitable for a single machine; for multi-server deployment use a managed database and migrate the data layer.
- The Gemini Python package in use is `google-generativeai`; see Google’s migration notes for newer `google.genai` clients if you upgrade.

---

## License

Use and distribution are subject to your course / team / employer policy. Add a SPDX license if you open-source the project.
