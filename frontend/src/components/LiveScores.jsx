import React from 'react';

/**
 * Live panel (Section 3): fallacies, evidence quality, persuasiveness, logic
 */
export default function LiveScores({ scores }) {
  const s = scores || {};
  return (
    <div className="flex h-full min-h-[240px] w-full flex-col overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:min-h-0">
      <h3 className="text-lg font-bold border-b pb-2 mb-4">Live argument scoring</h3>
      {s.scoring_error && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
          Scoring service: {s.scoring_error} (check GEMINI_API_KEY and backend logs.)
        </p>
      )}

      <div className="mb-3">
        <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Logic &amp; structure</p>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-slate-800">{s?.logic_score ?? 0}</span>
          <span className="text-gray-500 mb-1">/10</span>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Evidence quality</p>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-green-600">
            {s?.evidence_score ?? 0}
          </span>
          <span className="text-gray-500 mb-1">/10</span>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Persuasiveness</p>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-blue-600">
            {s?.persuasiveness_score ?? 0}
          </span>
          <span className="text-gray-500 mb-1">/10</span>
        </div>
      </div>

      {s?.evidence_flags && s.evidence_flags.length > 0 && (
        <div className="mb-4 p-2 rounded border border-amber-100 bg-amber-50/80">
          <p className="text-xs font-bold text-amber-900 mb-1">Evidence flags</p>
          <ul className="text-xs text-amber-950 space-y-1 list-disc pl-4">
            {s.evidence_flags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto">
        <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold mb-2">Logical fallacies</p>
        {!s?.fallacies || s.fallacies.length === 0 ? (
          <p className="text-sm text-gray-400 italic">None detected in the last turn.</p>
        ) : (
          <ul className="space-y-2 max-h-40 overflow-y-auto">
            {s.fallacies.map((fallacy, idx) => (
              <li
                key={idx}
                className="bg-red-50 text-red-800 text-xs p-2 rounded border border-red-100"
              >
                {fallacy}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
