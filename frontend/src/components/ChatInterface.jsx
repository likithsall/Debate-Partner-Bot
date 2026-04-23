import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import LiveScores from './LiveScores';
import { chatTextToHtml } from '../utils/chatFormat';

const API = 'http://localhost:8000';
const TURN = `${API}/api/debate/turn`;
const OPP = (s) => (s === 'For' ? 'Against' : s === 'Against' ? 'For' : s);

function buildPhase(turnIndex, maxR) {
  if (turnIndex === 0) return 'opening';
  if (turnIndex >= maxR - 1) return 'closing';
  return 'rebuttal';
}

function initStanceState(cfg) {
  if (cfg.stance === 'Custom') {
    return {
      user: cfg.stanceLabel || 'My position',
      bot: 'Oppose the user’s custom position on this topic',
    };
  }
  return { user: cfg.stance, bot: OPP(cfg.stance) };
}

export default function ChatInterface({ config, onEnd }) {
  const debateId = useMemo(() => `d-${crypto.randomUUID()}`, []);
  const init = useMemo(() => initStanceState(config), [config]);

  const [userStance, setUserStance] = useState(init.user);
  const [botStance, setBotStance] = useState(init.bot);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [scores, setScores] = useState({});

  const [userTurnIndex, setUserTurnIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [ringing, setRinging] = useState(false);
  const lastBotRef = useRef('');

  const mode = config.practiceMode || 'standard';
  const pconf = config.practiceConfig || {};
  const maxM = pconf.maxRounds ?? 6;
  const secondsPerTurn = pconf.secondsPerTurn ?? 90;
  const rebuttalSec = pconf.rebuttalSeconds ?? 60;
  const structured = config.format === 'Structured';
  const canSendMore = mode !== 'timed' || userTurnIndex < maxM;
  const multi = config.multiOpponent;
  const voice = config.voiceDebate;
  const secondPersona = config.secondPersona || 'Policy Analyst';

  const recRef = useRef(null);
  const [micOn, setMicOn] = useState(false);

  const readStream = useCallback(async (res, onDelta) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          full += line.replace(/^data:\s*/, '');
          onDelta(full);
        }
      }
    }
    return full;
  }, []);

  const makePayload = useCallback(
    (overrides) => {
      return {
        debate_id: debateId,
        topic: config.topic,
        stance: config.stance,
        stance_label: userStance,
        difficulty: config.difficulty,
        persona: config.persona,
        user_argument: '',
        practice_mode: mode,
        turn_kind: 'normal',
        user_stance_effective: userStance,
        bot_stance_effective: botStance,
        opponent_last_message: lastBotRef.current || null,
        format_phase: null,
        ...overrides,
      };
    },
    [config, debateId, mode, userStance, botStance]
  );

  const streamOpponent = useCallback(async (payload) => {
    const res = await fetch(TURN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Turn failed');
    return res;
  }, []);

  const refetchLiveScore = useCallback(() => {
    fetch(`${API}/api/debate/live-score?debate_id=${encodeURIComponent(debateId)}`)
      .then((r) => r.json())
      .then((d) => setScores((prev) => ({ ...prev, ...d })))
      .catch(() => {});
  }, [debateId]);

  useEffect(() => {
    const id = setInterval(() => {
      refetchLiveScore();
    }, 600);
    return () => clearInterval(id);
  }, [debateId, refetchLiveScore]);

  useEffect(() => {
    if (mode === 'rebuttal_drill') return undefined;
    let live = true;
    (async () => {
      setIsTyping(true);
      setMessages([{ role: 'bot', content: '' }]);
      try {
        const res = await streamOpponent(
          makePayload({ user_argument: '', turn_kind: 'session_opening' })
        );
        if (!live) return;
        const text = await readStream(res, (full) => {
          if (!live) return;
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { role: 'bot', content: full };
            return n;
          });
        });
        lastBotRef.current = text;
        if (mode === 'timed' && live) {
          setTimeLeft(secondsPerTurn);
          setRinging(false);
        }
      } catch (e) {
        console.error(e);
        if (live) {
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = {
              role: 'bot',
              content: 'Could not open the session. Is the API running and GEMINI_API_KEY set?',
            };
            return n;
          });
        }
      } finally {
        if (live) setIsTyping(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [mode, makePayload, rebuttalSec, readStream, streamOpponent, secondsPerTurn]);

  useEffect(() => {
    if (mode !== 'rebuttal_drill') return undefined;
    let live = true;
    (async () => {
      setIsTyping(true);
      setMessages([{ role: 'bot', content: '' }]);
      try {
        const res = await streamOpponent(
          makePayload({ user_argument: '', turn_kind: 'rebuttal_opening' })
        );
        if (!live) return;
        const text = await readStream(res, (full) => {
          if (!live) return;
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { role: 'bot', content: full };
            return n;
          });
        });
        lastBotRef.current = text;
        setTimeLeft(rebuttalSec);
      } catch (e) {
        console.error(e);
        if (live) {
          setMessages((prev) => {
            const n = [...prev];
            n[n.length - 1] = { role: 'bot', content: 'Could not load the opening claim.' };
            return n;
          });
        }
      } finally {
        if (live) setIsTyping(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [mode, makePayload, rebuttalSec, readStream, streamOpponent]);

  useEffect(() => {
    if (timeLeft === null) return undefined;
    if (timeLeft <= 0) {
      setRinging(true);
      return undefined;
    }
    const t = setInterval(() => {
      setTimeLeft((s) => (s === null || s <= 0 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [timeLeft]);

  const startMic = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Speech recognition is not available in this browser.');
      return;
    }
    const r = new SR();
    r.lang = 'en-US';
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (ev) => {
      const t = ev.results[0][0].transcript;
      setInput((p) => (p ? `${p} ${t}` : t));
      setMicOn(false);
    };
    r.onerror = () => setMicOn(false);
    r.onend = () => setMicOn(false);
    recRef.current = r;
    r.start();
    setMicOn(true);
  }, []);

  const speakLast = useCallback(
    (text) => {
      if (!voice || !text) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1;
        window.speechSynthesis.speak(u);
      } catch (e) {
        console.error(e);
      }
    },
    [voice]
  );

  const handleSend = async () => {
    if (!input.trim()) return;
    if (!canSendMore) return;
    if (isTyping) return;

    const toSend = input;
    const turnForPhase = userTurnIndex;
    setInput('');
    setTimeLeft(null);
    setRinging(false);

    setMessages((prev) => [...prev, { role: 'user', content: toSend }]);
    setUserTurnIndex((c) => c + 1);
    setIsTyping(true);

    [200, 600, 1500, 3000].forEach((ms) => {
      setTimeout(() => refetchLiveScore(), ms);
    });

    if (multi) {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', op: 1, content: '' },
        { role: 'bot', op: 2, content: '' },
      ]);
      const phase = structured && mode !== 'rebuttal_drill' ? buildPhase(turnForPhase, maxM) : null;
      const b1 = makePayload({
        user_argument: toSend,
        turn_kind: 'normal',
        format_phase: phase,
        persona: config.persona,
      });
      const b2 = { ...b1, persona: secondPersona };
      try {
        const [res1, res2] = await Promise.all([streamOpponent(b1), streamOpponent(b2)]);
        await Promise.all([
          readStream(res1, (c) => {
            setMessages((prev) => {
              const n = [...prev];
              n[n.length - 2] = { role: 'bot', op: 1, content: c };
              return n;
            });
          }),
          readStream(res2, (c) => {
            setMessages((prev) => {
              const n = [...prev];
              n[n.length - 1] = { role: 'bot', op: 2, content: c };
              return n;
            });
          }),
        ]);
        setMessages((prev) => {
          const a = prev[prev.length - 2];
          const b = prev[prev.length - 1];
          const combined = `${(a && a.content) || ''}\n\n---\n\n${(b && b.content) || ''}`;
          lastBotRef.current = combined;
          if (voice) {
            window.speechSynthesis.cancel();
            const u1 = new SpeechSynthesisUtterance(a.content);
            u1.onend = () => window.speechSynthesis.speak(new SpeechSynthesisUtterance(b.content));
            window.speechSynthesis.speak(u1);
          }
          return prev;
        });
        if (mode === 'rebuttal_drill') {
          setTimeLeft(rebuttalSec);
        } else if (mode === 'timed' && turnForPhase + 1 < maxM) {
          setTimeLeft(secondsPerTurn);
        }
      } catch (e) {
        console.error(e);
        setMessages((prev) => {
          const n = [...prev];
          n[n.length - 2] = { role: 'bot', op: 1, content: 'Error from opponent 1' };
          n[n.length - 1] = { role: 'bot', op: 2, content: 'Error from opponent 2' };
          return n;
        });
      } finally {
        setIsTyping(false);
      }
      return;
    }

    setMessages((prev) => [...prev, { role: 'bot', content: '' }]);
    try {
      const phase = structured && mode !== 'rebuttal_drill' ? buildPhase(turnForPhase, maxM) : null;
      const res = await streamOpponent(
        makePayload({
          user_argument: toSend,
          turn_kind: 'normal',
          format_phase: phase,
        })
      );
      const full = await readStream(res, (chunk) => {
        setMessages((prev) => {
          const n = [...prev];
          n[n.length - 1] = { role: 'bot', content: chunk };
          return n;
        });
      });
      lastBotRef.current = full;
      speakLast(full);
      if (mode === 'rebuttal_drill') {
        setTimeLeft(rebuttalSec);
      } else if (mode === 'timed' && turnForPhase + 1 < maxM) {
        setTimeLeft(secondsPerTurn);
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const n = [...prev];
        n[n.length - 1] = { role: 'bot', content: 'Error connecting to the server.' };
        return n;
      });
    } finally {
      setIsTyping(false);
    }
  };

  const switchSides = () => {
    if (config.stance === 'Custom') {
      const t = userStance;
      setUserStance(botStance);
      setBotStance(t);
    } else {
      setUserStance((u) => OPP(u));
      setBotStance((b) => OPP(b));
    }
    setMessages((prev) => [
      ...prev,
      {
        role: 'system',
        content:
          config.stance === 'Custom'
            ? 'Sides switched: your custom position and the bot’s label are swapped.'
            : 'Sides switched: you and the bot now take the opposite For/Against roles.',
      },
    ]);
  };

  const timerLabel =
    mode === 'rebuttal_drill' ? 'Rebuttal time' : mode === 'timed' ? 'Your turn time' : null;
  const timeDisplay = timeLeft != null ? `${timeLeft}s` : '—';

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-1 flex-col gap-3 lg:flex-row lg:gap-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="shrink-0 space-y-2 border-b border-gray-200 bg-gray-100 p-3 sm:p-4">
          <div className="flex flex-wrap justify-between items-start gap-2">
            <div>
              <p className="font-bold">Topic: {config.topic}</p>
              <p className="text-sm text-gray-600">
                You ({userStance}) · Opponent: {config.persona}
                {multi ? ` + ${secondPersona}` : ''} — {config.difficulty}
                {config.judgeMode && ' · Judge on'}
                {mode !== 'standard' && ` · ${mode}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {mode === 'switch_sides' && (
                <button
                  type="button"
                  onClick={switchSides}
                  className="bg-amber-500 text-white px-3 py-1.5 rounded text-sm hover:bg-amber-600"
                >
                  Switch sides
                </button>
              )}
              {voice && (
                <button
                  type="button"
                  onClick={startMic}
                  className={`px-3 py-1.5 rounded text-sm ${micOn ? 'bg-rose-600' : 'bg-rose-500 text-white'}`}
                >
                  {micOn ? 'Listening…' : 'Mic (voice)'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onEnd(messages)}
                className="bg-red-500 text-white px-3 py-1.5 rounded text-sm hover:bg-red-600"
              >
                End &amp; report
              </button>
            </div>
          </div>

          {mode === 'timed' && (
            <p className="text-xs text-gray-700">
              MUN-style: {maxM} user turn{maxM > 1 ? 's' : ''} · {secondsPerTurn}s each · turn{' '}
              {Math.min(userTurnIndex + 1, maxM)}/{maxM}
            </p>
          )}
          {mode === 'rebuttal_drill' && (
            <p className="text-xs text-amber-800 bg-amber-100 border border-amber-200 rounded px-2 py-1">
              60s rebuttal per claim; the bot rebuttals, then a <strong>Next round</strong> line.
            </p>
          )}
          {timerLabel && (mode === 'timed' || mode === 'rebuttal_drill') && (
            <div
              className={`text-sm font-semibold ${
                ringing || timeLeft === 0 ? 'text-red-600' : 'text-indigo-700'
              }`}
            >
              {timerLabel}: {timeDisplay}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-5">
          {messages.length === 0 && (mode === 'rebuttal_drill' || mode === 'standard') && (
            <p className="text-gray-400 text-sm">Loading the opening from your opponent(s)…</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${
                m.role === 'user'
                  ? 'justify-end'
                  : m.role === 'system'
                    ? 'justify-center'
                    : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[min(96%,56rem)] rounded-2xl p-4 text-[15px] leading-relaxed break-words ${
                  m.role === 'user'
                    ? 'whitespace-pre-wrap bg-indigo-600 text-white [&_strong]:font-extrabold [&_strong]:text-white'
                    : m.role === 'system'
                      ? 'whitespace-pre-wrap border bg-amber-50 text-sm text-amber-900'
                      : m.op
                        ? 'border-l-4 border-slate-500 bg-slate-100 text-gray-900 [&_strong]:font-bold [&_strong]:text-gray-900'
                        : 'bg-gray-100 text-gray-900 shadow-sm [&_strong]:font-bold [&_strong]:text-gray-900'
                }`}
              >
                {m.op && (
                  <p className="mb-2 text-xs font-bold text-slate-600">
                    {m.op === 1 ? config.persona : secondPersona}
                  </p>
                )}
                {m.role === 'system' ? (
                  m.content
                ) : (
                  <div
                    className="whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: chatTextToHtml(m.content) }}
                  />
                )}
              </div>
            </div>
          ))}
          {isTyping && <div className="text-gray-400 text-sm italic">Opponent typing…</div>}
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-200 bg-gray-50/80 p-3 sm:flex-row sm:items-end sm:p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!canSendMore}
            className="min-h-[3rem] flex-1 resize-y rounded-xl border border-gray-300 p-3 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
            rows={2}
            placeholder={
              !canSendMore ? 'Rounds over — use End & report' : 'Type or use the mic to argue…'
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isTyping || !canSendMore}
            className="bg-indigo-600 text-white px-6 font-bold rounded disabled:opacity-50"
          >
            Send
          </button>
        </div>
        {!canSendMore && mode === 'timed' && (
          <p className="px-4 pb-3 text-sm text-amber-800">All timed user turns are used. End the debate for a report.</p>
        )}
      </div>
      <div className="flex h-64 min-h-0 w-full shrink-0 flex-col lg:h-auto lg:w-80 lg:min-w-[18rem] lg:max-w-md xl:w-96">
        <LiveScores scores={scores} />
      </div>
    </div>
  );
}
