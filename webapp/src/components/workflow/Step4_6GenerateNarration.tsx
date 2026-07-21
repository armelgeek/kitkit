import React from "react";
import { useWorkflow } from "../../context/WorkflowContext";

export default function Step4_6GenerateNarration() {
  const { state, actions } = useWorkflow();
  const { beats, loading, error, loadingMessage } = state;

  const handleGenerateNarration = async () => {
    await actions.generateNarration();
  };

  // Extract progress from loadingMessage (e.g., "Beat 3/10")
  const progressMatch = loadingMessage?.match(/Beat (\d+)\/(\d+)/);
  const progress = progressMatch ? (parseInt(progressMatch[1]) / parseInt(progressMatch[2])) * 100 : 0;

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-950 p-8">
      {/* Error Display */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {error}
        </div>
      )}

      {/* Loading Progress */}
      {loading && (
        <div className="mb-8 rounded-lg bg-neutral-900 border border-neutral-700 p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-white">Generating Narration</p>
            <p className="text-sm text-neutral-400">{loadingMessage}</p>
          </div>
          <div className="w-full bg-neutral-800 rounded h-2">
            <div
              className="bg-indigo-600 h-2 rounded transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <h1 className="mb-2 text-2xl font-bold text-white">Generate Narration</h1>
        <p className="mb-6 text-neutral-400">
          Generate voice-over narration for each beat using AI text-to-speech
        </p>

        {/* Beat Count Badge */}
        {beats.length > 0 && (
          <div className="mb-6 inline-block rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
            {beats.length} beats ready for narration
          </div>
        )}

        {/* Beats List */}
        <div className="mb-8 space-y-3">
          {beats.length > 0 ? (
            beats.map((beat, idx) => (
              <div
                key={beat.id}
                className="rounded-lg border border-neutral-700 bg-neutral-900 p-4 flex items-start gap-3"
              >
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-white">Beat {idx + 1}</h3>
                  <p className="text-sm text-neutral-400 mt-1">{beat.description?.substring(0, 150)}</p>
                </div>
                {beat.narration_audio && (
                  <div className="text-green-400 text-sm font-medium">✓ Done</div>
                )}
              </div>
            ))
          ) : (
            <div className="rounded-lg bg-neutral-900 p-6 text-neutral-500">
              No beats to narrate.
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => actions.goToStep(4.5)}
            className="rounded-lg border border-neutral-700 px-6 py-3 font-medium text-neutral-300 hover:bg-neutral-900 hover:border-neutral-600 transition"
          >
            Back to Beats
          </button>
          <button
            onClick={handleGenerateNarration}
            disabled={beats.length === 0 || loading}
            className={`rounded-lg px-6 py-3 font-medium transition ${
              beats.length === 0 || loading
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {loading ? "Generating..." : "Generate Narration"}
          </button>
        </div>
      </div>
    </div>
  );
}
