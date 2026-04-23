import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SetupScreen from './components/SetupScreen';
import ChatInterface from './components/ChatInterface';
import ReportScreen from './components/ReportScreen';
import UserDashboard from './components/UserDashboard';

const API = 'http://localhost:8000';

function App() {
  const [appState, setAppState] = useState('setup');
  const [debateConfig, setDebateConfig] = useState(null);
  const [finalReport, setFinalReport] = useState(null);
  const [lastTranscript, setLastTranscript] = useState([]);

  const [userId] = useState(() => {
    let storedId = localStorage.getItem('debateUserId');
    if (!storedId) {
      storedId = crypto.randomUUID();
      localStorage.setItem('debateUserId', storedId);
    }
    return storedId;
  });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('share');
    if (!t) return;
    axios
      .get(`${API}/api/public/report/${t}`)
      .then((r) => {
        const d = r.data;
        setFinalReport({
          ...d.report,
          meta: { shareUrl: window.location.href },
        });
        setLastTranscript(
          (d.transcript || []).map((m) => ({
            role: m.role,
            content: m.content,
            op: m.op,
          }))
        );
        setAppState('report');
      })
      .catch((e) => {
        console.error('Shared report load failed', e);
        setAppState('setup');
      });
  }, []);

  const handleStartDebate = (config) => {
    setDebateConfig({
      ...config,
      userId,
    });
    setAppState('debating');
  };

  const handleEndDebate = async (chatHistory) => {
    setAppState('report');
    setLastTranscript(chatHistory);
    setFinalReport(null);

    try {
      const response = await axios.post(`${API}/api/debate/report`, {
        messages: chatHistory,
        config: {
          ...debateConfig,
          userId,
          shareBaseUrl: window.location.origin,
        },
      });
      setFinalReport(response.data);
    } catch (error) {
      console.error('Failed to fetch report:', error);
      setFinalReport({
        error: true,
        scores: { logic: 0, evidence: 0, persuasiveness: 0, composite: 0 },
        strongest_arguments: ['N/A'],
        transcript_annotations: [],
        fallacies: [],
        suggestions: { missed_counters: ['N/A'], helpful_evidence: ['N/A'] },
        judge: null,
      });
    }
  };

  const handleRestart = () => {
    setDebateConfig(null);
    setFinalReport(null);
    setLastTranscript([]);
    setAppState('setup');
  };

  const shareUrl = finalReport?.meta?.shareUrl;

  return (
    <div className="min-h-screen min-h-dvh bg-[#F3F4F6] text-gray-800 font-sans selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      <header className="shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xl">D</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Debate partner bot</h1>
        </div>
        <nav className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => {
              if (appState === 'debating' && !window.confirm('Leave the current session? Use End & report to save a report first.')) {
                return;
              }
              if (appState === 'debating') setDebateConfig(null);
              setAppState('setup');
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              appState === 'setup' || appState === 'debating' ? 'bg-indigo-100 text-indigo-800' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Practice
          </button>
          <button
            type="button"
            onClick={() => {
              if (appState === 'debating' && !window.confirm('Open Progress? Your in-progress session stays in memory if you return.')) {
                return;
              }
              setAppState('dashboard');
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              appState === 'dashboard' ? 'bg-indigo-100 text-indigo-800' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            History &amp; progress
          </button>
        </nav>
      </header>

      <main
        className={
          appState === 'debating'
            ? 'w-full max-w-none flex-1 min-h-0 flex flex-col px-2 sm:px-4 py-2 md:py-3'
            : 'max-w-5xl mx-auto w-full p-4 md:p-8 flex-1'
        }
      >
        {appState === 'setup' && <SetupScreen onStart={handleStartDebate} />}
        {appState === 'debating' && <ChatInterface config={debateConfig} onEnd={handleEndDebate} />}
        {appState === 'report' && (
          <ReportScreen
            report={finalReport}
            onRestart={handleRestart}
            onOpenProgress={() => setAppState('dashboard')}
            transcript={lastTranscript}
            shareUrl={shareUrl}
          />
        )}
        {appState === 'dashboard' && (
          <UserDashboard
            userId={userId}
            apiBase={API}
            onBack={() => setAppState('setup')}
            onStartPractice={() => {
              setAppState('setup');
            }}
            onViewReport={(row) => {
              axios
                .get(`${API}/api/debate/saved`, {
                  params: { user_id: userId, debate_id: row.id },
                })
                .then((r) => {
                  setLastTranscript(
                    (r.data.transcript || []).map((m) => ({ role: m.role, content: m.content, op: m.op }))
                  );
                  setFinalReport(
                    r.data.report
                      ? { ...r.data.report, meta: { shareUrl: null } }
                      : { error: true, scores: {}, fallacies: [], suggestions: { missed_counters: [], helpful_evidence: [] } }
                  );
                  setAppState('report');
                })
                .catch((e) => console.error(e));
            }}
          />
        )}
      </main>
    </div>
  );
}

export default App;
