import React, { useState } from 'react';
import { PRACTICE_MODES } from '../constants/practiceModes';

export default function SetupScreen({ onStart }) {
  const [topic, setTopic] = useState('');
  const [stanceMode, setStanceMode] = useState('preset'); // preset | custom
  const [stance, setStance] = useState('For');
  const [customStance, setCustomStance] = useState('');
  const [format, setFormat] = useState('Casual');
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [persona, setPersona] = useState('Skeptical Professor');
  const [secondPersona, setSecondPersona] = useState('Policy Analyst');
  const [practiceMode, setPracticeMode] = useState('standard');
  const [secondsPerTurn, setSecondsPerTurn] = useState(90);
  const [maxRounds, setMaxRounds] = useState(6);
  const [judgeMode, setJudgeMode] = useState(true);
  const [multiOpponent, setMultiOpponent] = useState(false);
  const [voiceDebate, setVoiceDebate] = useState(false);

  const handleStart = () => {
    if (!topic.trim()) {
      alert('Please enter a debate topic!');
      return;
    }
    const stanceLabel =
      stanceMode === 'custom' ? (customStance.trim() || 'Custom position') : stance;

    const practiceConfig = {};
    if (practiceMode === 'timed') {
      practiceConfig.secondsPerTurn = Number(secondsPerTurn) || 90;
      practiceConfig.maxRounds = Number(maxRounds) || 6;
    }
    if (practiceMode === 'rebuttal_drill') {
      practiceConfig.rebuttalSeconds = 60;
    }

    onStart({
      topic: topic.trim(),
      stance: stanceMode === 'preset' ? stance : 'Custom',
      stanceLabel,
      customStance: stanceMode === 'custom' ? customStance.trim() : undefined,
      format,
      difficulty,
      persona,
      secondPersona: multiOpponent ? secondPersona : undefined,
      practiceMode,
      practiceConfig: Object.keys(practiceConfig).length ? practiceConfig : undefined,
      judgeMode,
      multiOpponent,
      voiceDebate,
    });
  };

  return (
    <div className="flex flex-col items-center justify-center mt-6 md:mt-10">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold text-gray-900 mb-3 tracking-tight">What shall we debate today?</h2>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          Set topic, position, and format — or enable judge mode, two opponents, and voice.
        </p>
      </div>

      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Debate topic (free text)</label>
          <input
            type="text"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-lg"
            placeholder='e.g. "Social media does more harm than good"'
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            autoFocus
          />
        </div>

        <div className="mb-6 p-4 rounded-xl border border-indigo-100 bg-indigo-50/50">
          <h3 className="text-sm font-bold text-indigo-900 mb-2">Stance (Section 1)</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {['preset', 'custom'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setStanceMode(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  stanceMode === m ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200'
                }`}
              >
                {m === 'preset' ? 'For / Against' : 'Custom position'}
              </button>
            ))}
          </div>
          {stanceMode === 'preset' ? (
            <select
              className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white"
              value={stance}
              onChange={(e) => setStance(e.target.value)}
            >
              <option value="For">For (agree with the resolution as stated)</option>
              <option value="Against">Against (disagree with the resolution)</option>
            </select>
          ) : (
            <input
              className="w-full px-4 py-3 rounded-xl border border-gray-300"
              placeholder="State your custom position in one line…"
              value={customStance}
              onChange={(e) => setCustomStance(e.target.value)}
            />
          )}
        </div>

        <div className="mb-6 p-4 rounded-xl border border-indigo-100 bg-indigo-50/30">
          <h3 className="text-sm font-bold text-indigo-900 mb-2">Format &amp; practice</h3>
          <p className="text-xs text-gray-600 mb-3">Casual vs structured; MUN / drills / side-switch (Section 5).</p>
          <div className="space-y-2">
            {PRACTICE_MODES.map((m) => (
              <label
                key={m.id}
                className={`flex gap-3 p-2 rounded-lg cursor-pointer border ${
                  practiceMode === m.id
                    ? 'bg-white border-indigo-500 shadow-sm'
                    : 'border-transparent hover:bg-white/60'
                }`}
              >
                <input
                  type="radio"
                  name="pmode"
                  checked={practiceMode === m.id}
                  onChange={() => setPracticeMode(m.id)}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold text-gray-900">{m.label}</span>
                  <span className="block text-xs text-gray-600">{m.desc}</span>
                </span>
              </label>
            ))}
          </div>
          {practiceMode === 'timed' && (
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Seconds per user turn</label>
                <input
                  type="number"
                  min={20}
                  max={600}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  value={secondsPerTurn}
                  onChange={(e) => setSecondsPerTurn(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Max user turns</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  value={maxRounds}
                  onChange={(e) => setMaxRounds(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Debate format (Casual / Structured)</label>
            <select
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 bg-gray-50"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="Casual">Casual (free-flowing)</option>
              <option value="Structured">Structured (opening, rebuttal, closing)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Difficulty (Section 1)</label>
            <select
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 bg-gray-50"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="Beginner">Beginner — simpler claims</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced — tough logic &amp; counter-examples</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Opponent persona (Section 1)</label>
            <select
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 bg-gray-50"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
            >
              <option value="Skeptical Professor">Skeptical Professor</option>
              <option value="Street Debater">Street Debater</option>
              <option value="Policy Analyst">Policy Analyst</option>
            </select>
          </div>
        </div>

        <div className="mb-6 p-4 rounded-xl border border-amber-100 bg-amber-50/50 space-y-3">
          <h3 className="text-sm font-bold text-amber-950">Advanced</h3>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={judgeMode}
              onChange={(e) => setJudgeMode(e.target.checked)}
            />
            <span>
              <span className="font-semibold text-gray-900">Judge mode</span>
              <span className="block text-xs text-gray-600">After the debate, an LLM judge scores both sides and picks a winner.</span>
            </span>
          </label>
          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={multiOpponent}
                onChange={(e) => setMultiOpponent(e.target.checked)}
              />
              <span>
                <span className="font-semibold text-gray-900">Multi-opponent mode</span>
                <span className="block text-xs text-gray-600">Two bots, different styles, each reply to your last turn.</span>
              </span>
            </label>
            {multiOpponent && (
              <div className="mt-2 ml-6">
                <label className="text-xs font-semibold text-gray-600">Second persona</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  value={secondPersona}
                  onChange={(e) => setSecondPersona(e.target.value)}
                >
                  <option value="Street Debater">Street Debater</option>
                  <option value="Policy Analyst">Policy Analyst</option>
                  <option value="Skeptical Professor">Skeptical Professor</option>
                </select>
              </div>
            )}
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={voiceDebate}
              onChange={(e) => setVoiceDebate(e.target.checked)}
            />
            <span>
              <span className="font-semibold text-gray-900">Voice debate (browser)</span>
              <span className="block text-xs text-gray-600">Speak with the mic; optional read-aloud for the opponent.</span>
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={handleStart}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg py-4 rounded-xl transition-all active:scale-[0.99] shadow-lg"
        >
          Begin debate
        </button>
      </div>
    </div>
  );
}
