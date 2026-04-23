import React, { useState } from 'react';

export default function ReportScreen({
  report,
  onRestart,
  onOpenProgress,
  transcript = [],
  shareUrl = null,
}) {
  const [copied, setCopied] = useState(false);

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-lg text-gray-600 font-medium">Analyzing transcript and generating detailed breakdown...</p>
      </div>
    );
  }

  if (report.error) {
    return <div className="p-8 text-center text-red-600">Error generating report. Please try again.</div>;
  }

  const handleExportPDF = () => {
    window.print();
  };

  const copyShare = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const scores = report.scores || {};
  const ann = report.transcript_annotations || [];
  const fall = report.fallacies || [];
  const strong = report.strongest_arguments || [];
  const sugg = report.suggestions || { missed_counters: [], helpful_evidence: [] };
  const judge = report.judge;

  return (
    <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mt-6 print:shadow-none print:border-none print:m-0 print:p-0">
      <div className="flex justify-between items-start border-b pb-6 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Debate performance report</h2>
          <p className="text-gray-500 mt-1">Post-debate analysis: scores, transcript, fallacies, coaching, export &amp; share.</p>
        </div>
        <div className="flex flex-wrap gap-3 print:hidden">
          {shareUrl && (
            <button
              type="button"
              onClick={copyShare}
              className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-lg font-medium"
            >
              {copied ? 'Link copied' : 'Copy share link'}
            </button>
          )}
          <button
            type="button"
            onClick={handleExportPDF}
            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Export PDF
          </button>
          {onOpenProgress && (
            <button
              type="button"
              onClick={onOpenProgress}
              className="bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium"
            >
              View progress
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="bg-gray-900 text-white hover:bg-gray-800 px-4 py-2 rounded-lg font-medium"
          >
            New debate
          </button>
        </div>
      </div>

      {judge && (
        <div className="mb-10 p-5 rounded-xl border-2 border-indigo-200 bg-indigo-50/60 print:border print:bg-white">
          <h3 className="text-lg font-bold text-indigo-950 mb-2">LLM judge verdict</h3>
          <div className="flex flex-wrap gap-4 text-sm text-indigo-950 mb-2">
            <span>Your score: <strong>{judge.user_total?.toFixed?.(1) ?? judge.user_total}</strong> / 10</span>
            <span>Opponent: <strong>{judge.opponent_total?.toFixed?.(1) ?? judge.opponent_total}</strong> / 10</span>
            <span className="font-bold">Winner: {judge.winner || '—'}</span>
          </div>
          <p className="text-sm text-indigo-900/90 leading-relaxed">{judge.rationale || ''}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Logic</div>
          <div className="text-4xl font-black text-gray-800">{scores.logic ?? '—'}</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Evidence</div>
          <div className="text-4xl font-black text-gray-800">{scores.evidence ?? '—'}</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Persuasiveness</div>
          <div className="text-4xl font-black text-gray-800">{scores.persuasiveness ?? '—'}</div>
        </div>
        <div className="bg-indigo-600 rounded-xl p-4 text-center shadow-md">
          <div className="text-xs font-bold text-indigo-200 uppercase tracking-wider mb-1">Composite</div>
          <div className="text-4xl font-black text-white">{scores.composite ?? '—'}</div>
        </div>
      </div>

      {transcript.length > 0 && (
        <div className="mb-10 print:break-inside-avoid">
          <h3 className="text-xl font-bold text-gray-900 mb-2">Full transcript (Section 4)</h3>
          <p className="text-sm text-gray-500 mb-3">The saved conversation; use annotations below for highlights.</p>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 p-3 bg-gray-50 text-sm space-y-2">
            {transcript.map((m, i) => (
              <p key={i} className="whitespace-pre-wrap">
                <span className="font-bold text-indigo-700">
                  {m.role === 'user' ? 'You' : m.op ? `Opponent ${m.op}` : 'Opponent'}
                  :
                </span>{' '}
                {m.content}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="mb-10">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Strongest arguments (highlights)</h3>
        <ul className="space-y-3">
          {strong.length === 0 && <li className="text-gray-500 text-sm">—</li>}
          {strong.map((arg, i) => (
            <li
              key={i}
              className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg text-green-900"
            >
              {arg}
            </li>
          ))}
        </ul>
      </div>

      {fall.length > 0 && (
        <div className="mb-10">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Logical fallacies (full list)</h3>
          <div className="space-y-4">
            {fall.map((fallacy, i) => (
              <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="font-bold text-red-800 text-lg mb-2">{fallacy.name}</div>
                <blockquote className="italic text-gray-600 border-l-2 border-gray-300 pl-3 mb-2">
                  &ldquo;{fallacy.quote}&rdquo;
                </blockquote>
                <p className="text-red-900 text-sm">{fallacy.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {ann.length > 0 && (
        <div className="mb-10">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Annotated transcript</h3>
          <div className="space-y-4">
            {ann.map((note, i) => (
              <div
                key={i}
                className={`p-4 rounded-lg border ${
                  note.type === 'strong' ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded uppercase ${
                      note.type === 'strong' ? 'bg-blue-200 text-blue-800' : 'bg-orange-200 text-orange-800'
                    }`}
                  >
                    {note.type === 'strong' ? 'Strong moment' : 'Weak moment'}
                  </span>
                </div>
                <blockquote className="italic text-gray-700 font-medium mb-2">
                  &ldquo;{note.quote}&rdquo;
                </blockquote>
                <p className="text-gray-600 text-sm">{note.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2">
        <div className="bg-purple-50 p-5 rounded-xl border border-purple-100">
          <h4 className="font-bold text-purple-900 mb-3">Coaching: missed counter-arguments</h4>
          <ul className="list-disc pl-5 text-purple-800 space-y-2 text-sm">
            {(sugg.missed_counters || []).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="bg-teal-50 p-5 rounded-xl border border-teal-100">
          <h4 className="font-bold text-teal-900 mb-3">Coaching: evidence to strengthen your case</h4>
          <ul className="list-disc pl-5 text-teal-800 space-y-2 text-sm">
            {(sugg.helpful_evidence || []).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
