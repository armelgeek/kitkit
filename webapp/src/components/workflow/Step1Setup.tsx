import React, { useState } from "react";
import { useWorkflow } from "../../context/WorkflowContext";

const MODEL_OPTIONS = [
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  { value: "claude-opus-4-1", label: "Claude Opus 4.1" },
];

const LANGUAGE_OPTIONS = ["English", "French", "Spanish"];
const DURATION_OPTIONS = [30, 60, 120, 180];

export default function Step1Setup() {
  const { state, actions } = useWorkflow();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    idea,
    style,
    duration,
    model,
    language,
    customPromptHeader,
    screenplayRaw,
    loading,
    error,
  } = state;

  const isGenerateDisabled = !idea.trim() || !style.trim() || loading;

  const handleGenerateClick = async () => {
    await actions.generateScreenplay();
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-950 p-8">
      {/* Error Display */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {error}
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        <h1 className="mb-8 text-2xl font-bold text-white">Setup Your Story</h1>

        {/* Story Idea */}
        <div className="mb-6">
          <label htmlFor="story-idea" className="block text-sm font-medium text-neutral-300 mb-2">
            Story Idea
          </label>
          <textarea
            id="story-idea"
            value={idea}
            onChange={(e) => actions.setIdea(e.target.value)}
            placeholder="Describe your story..."
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 transition"
            rows={4}
          />
        </div>

        {/* Style */}
        <div className="mb-6">
          <label htmlFor="style" className="block text-sm font-medium text-neutral-300 mb-2">
            Style
          </label>
          <textarea
            id="style"
            value={style}
            onChange={(e) => actions.setStyle(e.target.value)}
            placeholder="Describe the visual/narrative style..."
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 transition"
            rows={4}
          />
        </div>

        {/* Duration */}
        <div className="mb-6">
          <label htmlFor="duration" className="block text-sm font-medium text-neutral-300 mb-2">
            Duration
          </label>
          <select
            id="duration"
            value={duration}
            onChange={(e) => actions.setDuration(Number(e.target.value))}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 transition"
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
        </div>

        {/* Advanced Options Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="mb-6 flex items-center gap-2 text-sm font-medium text-indigo-400 hover:text-indigo-300 transition"
        >
          <span>{showAdvanced ? "▼" : "▶"}</span>
          Advanced Options
        </button>

        {/* Advanced Options */}
        {showAdvanced && (
          <div className="mb-6 space-y-6 border-t border-neutral-800 pt-6">
            {/* Model */}
            <div>
              <label htmlFor="model" className="block text-sm font-medium text-neutral-300 mb-2">
                Model
              </label>
              <select
                id="model"
                value={model}
                onChange={(e) => actions.setModel(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 transition"
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div>
              <label htmlFor="language" className="block text-sm font-medium text-neutral-300 mb-2">
                Language
              </label>
              <select
                id="language"
                value={language}
                onChange={(e) => actions.setLanguage(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 transition"
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Prompt Header */}
            <div>
              <label htmlFor="custom-prompt-header" className="block text-sm font-medium text-neutral-300 mb-2">
                Custom Prompt Header
                <span className="text-neutral-500 font-normal"> (optional)</span>
              </label>
              <textarea
                id="custom-prompt-header"
                value={customPromptHeader}
                onChange={(e) => actions.setCustomPromptHeader(e.target.value)}
                placeholder=""
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 transition"
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerateClick}
          disabled={isGenerateDisabled}
          className={`w-full rounded-lg px-4 py-3 font-medium transition ${
            isGenerateDisabled
              ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
        >
          {loading ? "Generating screenplay..." : "Generate Screenplay"}
        </button>
      </div>
    </div>
  );
}
