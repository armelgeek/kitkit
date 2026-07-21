import React from "react";
import { useWorkflow } from "../../context/WorkflowContext";

export default function Step4_5ReviewBeats() {
  const { state, actions } = useWorkflow();
  const { beats, loading, error } = state;

  const handleGenerateNarration = () => {
    actions.goToStep(4.6);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-950 p-8">
      {/* Error Display */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {error}
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <h1 className="mb-2 text-2xl font-bold text-white">Review Beats</h1>
        <p className="mb-6 text-neutral-400">
          Review your beats before generating narration
        </p>

        {/* Beat Count Badge */}
        {beats.length > 0 && (
          <div className="mb-6 inline-block rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
            {beats.length} beats ready
          </div>
        )}

        {/* Beats Grid */}
        <div className="mb-8">
          {beats.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {beats.map((beat, idx) => (
                <div
                  key={beat.id}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 p-4"
                >
                  <h3 className="text-sm font-semibold text-white">Beat {idx + 1}</h3>
                  <p className="text-xs text-neutral-400 mt-2 line-clamp-3">{beat.description}</p>
                  {beat.narration_audio && (
                    <div className="text-green-400 text-xs font-medium mt-2">✓ Narration done</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-neutral-900 p-6 text-neutral-500">
              No beats to review.
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => actions.goToStep(4)}
            className="rounded-lg border border-neutral-700 px-6 py-3 font-medium text-neutral-300 hover:bg-neutral-900 hover:border-neutral-600 transition"
          >
            Back to Images
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
