import React, { useEffect, useState } from 'react';
import axios from 'axios';

const DEFAULT_API = 'http://localhost:8000';

export default function UserDashboard({
  userId,
  onBack,
  onStartPractice,
  onViewReport,
  apiBase = DEFAULT_API,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [label, setLabel] = useState('Raise my evidence game');
  const [metric, setMetric] = useState('evidence_avg');
  const [target, setTarget] = useState(7.5);

  const load = () => {
    setLoading(true);
    axios
      .get(`${apiBase}/api/user/progress`, { params: { user_id: userId } })
      .then((r) => {
        setData(r.data);
        setError(null);
      })
      .catch((e) => {
        setError(e.message || 'Failed to load');
      })
      .finally(() => setLoading(false));
  };

  const loadHistory = () => {
    axios
      .get(`${apiBase}/api/user/history`, { params: { user_id: userId } })
      .then((r) => setHistory(r.data.debates || []))
      .catch(() => setHistory([]));
  };

  useEffect(() => {
    load();
    loadHistory();
  }, [userId, apiBase]);

  const addGoal = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${apiBase}/api/user/goals`, {
        user_id: userId,
        label,
        target_metric: metric,
        target_value: Number(target),
      });
      setLabel('Raise my evidence game');
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const removeGoal = async (id) => {
    try {
      await axios.delete(`${apiBase}/api/user/goals/${id}`, {
        params: { user_id: userId },
      });
      load();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-600">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        Loading your progress…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 p-8">
        {error} <button className="underline" type="button" onClick={load}>Retry</button>
      </div>
    );
  }

  const ev = data?.evidence_trend || [];
  const fr = data?.fallacy_rate_trend || [];
  const fav = data?.favorite_topics || [];
  const rec = data?.recurring_weaknesses || [];
  const goals = data?.goals || [];
  const cm = data?.current_metrics;
  const av = data?.averages;

  return (
    <div className="max-w-5xl mx-auto space-y-8 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">History &amp; progress</h2>
          <p className="text-gray-500">Saved debates, trends, weak spots, and practice goals (Sections 6 &amp; 7).</p>
        </div>
        <div className="flex gap-2 print:hidden">
          {onStartPractice && (
            <button
              type="button"
              onClick={onStartPractice}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700"
            >
              New practice
            </button>
          )}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50"
            >
              Back
            </button>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">Saved debates (transcript + report in DB)</h3>
          <ul className="divide-y divide-gray-100">
            {history.map((h) => (
              <li key={h.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">{h.topic || 'Untitled'}</p>
                  <p className="text-xs text-gray-500">
                    {h.created_at || ''} · {h.practice_mode || 'standard'} ·{' '}
                    {h.has_report ? 'has report' : 'no report yet'}
                  </p>
                </div>
                {h.has_report && onViewReport && (
                  <button
                    type="button"
                    onClick={() => onViewReport(h)}
                    className="text-sm text-indigo-600 font-medium hover:underline"
                  >
                    Open report
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.debate_count === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 text-sm">
          No completed debates with reports yet. Finish a debate and generate a report to unlock trend charts and
          goals.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase">Debates saved</p>
          <p className="text-3xl font-bold text-gray-900">{data.debate_count}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase">Avg. evidence (all time)</p>
          <p className="text-3xl font-bold text-gray-900">
            {av?.evidence != null ? av.evidence.toFixed(1) : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase">Avg. logic (all time)</p>
          <p className="text-3xl font-bold text-gray-900">
            {av?.logic != null ? av.logic.toFixed(1) : '—'}
          </p>
        </div>
      </div>

      {cm?.last_n_avg && (
        <div className="bg-indigo-50/80 border border-indigo-100 rounded-xl p-4">
          <h3 className="font-bold text-indigo-950 mb-2">Rolling last {cm.last_n_avg.n} debate averages</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {cm.last_n_avg.evidence != null && (
              <span>Evidence: <strong>{cm.last_n_avg.evidence.toFixed(1)}</strong> / 10</span>
            )}
            {cm.last_n_avg.logic != null && (
              <span>Logic: <strong>{cm.last_n_avg.logic.toFixed(1)}</strong> / 10</span>
            )}
            {cm.last_n_avg.composite != null && (
              <span>Composite: <strong>{cm.last_n_avg.composite.toFixed(1)}</strong> / 10</span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-2">Evidence score (recent)</h3>
          <p className="text-xs text-gray-500 mb-3">From each saved report (chronological).</p>
          {ev.length === 0 ? (
            <p className="text-gray-400 text-sm">No data yet.</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {ev.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.date} — ${d.topic}`}>
                  <div
                    className="w-full bg-indigo-500 rounded-t min-h-[2px] transition-all"
                    style={{ height: `${(d.evidence / 10) * 100}%` }}
                  />
                  <span className="text-[9px] text-gray-400 truncate w-full text-center">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-2">Fallacy load (per user turn)</h3>
          <p className="text-xs text-gray-500 mb-3">Lower is better. Derived from each report and transcript size.</p>
          {fr.length === 0 ? (
            <p className="text-gray-400 text-sm">No data yet.</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {fr.map((d, i) => {
                const h = Math.min(1, d.rate) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}`}>
                    <div
                      className="w-full bg-amber-500 rounded-t min-h-[2px] transition-all"
                      style={{ height: `${h}%` }}
                    />
                    <span className="text-[9px] text-gray-400 truncate w-full text-center">{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">Favorite topics</h3>
          {fav.length === 0 ? (
            <p className="text-gray-400 text-sm">Debate a few different topics to see a ranking.</p>
          ) : (
            <ol className="list-decimal list-inside space-y-2 text-gray-800">
              {fav.map((t, i) => (
                <li key={i}>
                  {t.topic} <span className="text-gray-500">— {t.count}×</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">Recurring weaknesses (last 5 reports)</h3>
          {rec.length === 0 ? (
            <p className="text-gray-400 text-sm">No repeated fallacy pattern detected, or not enough data.</p>
          ) : (
            <ul className="space-y-3 text-sm text-gray-800">
              {rec.map((r, i) => (
                <li key={i} className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r-lg">
                  <strong className="text-amber-950">{r.name}</strong> — {r.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-1">Practice goals & improvement</h3>
        <p className="text-sm text-gray-500 mb-4">Targets are compared to your rolling average over your last 5 completed debates (when that exists).</p>

        <form onSubmit={addGoal} className="flex flex-col sm:flex-row gap-2 mb-6 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <input
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Goal label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
          <select
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            <option value="evidence_avg">Average evidence (last 5)</option>
            <option value="logic_avg">Average logic (last 5)</option>
            <option value="composite">Composite average (last 5)</option>
          </select>
          <input
            type="number"
            step="0.1"
            min="0.5"
            max="10"
            className="w-24 border border-gray-300 rounded-lg px-2 py-2 text-sm"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          />
          <button type="submit" className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800">
            Add goal
          </button>
        </form>

        {goals.length === 0 ? (
          <p className="text-gray-400 text-sm">No active goals. Add one above to track progress.</p>
        ) : (
          <ul className="space-y-3">
            {goals.map((g) => (
              <li
                key={g.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-gray-100 rounded-lg p-3 bg-white"
              >
                <div>
                  <p className="font-medium text-gray-900">{g.label}</p>
                  <p className="text-xs text-gray-500">
                    {g.target_metric} target {g.target_value}
                    {g.current != null && ` — current (rolling avg): ${g.current.toFixed(2)}`}
                  </p>
                  {g.met && <span className="text-xs text-green-700 font-semibold">Target met</span>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${g.met ? 'bg-green-500' : 'bg-indigo-500'}`}
                      style={{ width: `${g.progress_pct || 0}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGoal(g.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
