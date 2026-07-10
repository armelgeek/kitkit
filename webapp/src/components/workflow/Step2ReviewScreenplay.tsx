import React from "react";
import { useWorkflow } from "../../context/WorkflowContext";

export default function Step2ReviewScreenplay() {
  const { state, actions } = useWorkflow();
  const { screenplayRaw, scenes, beats, loading, error } = state;

  const sceneCount = scenes.length;
  const isApproveDisabled = !screenplayRaw.trim() || loading;

  const handleRedo = () => {
    actions.redoScreenplay();
  };

  const handleApprove = async () => {
    await actions.approveScreenplay();
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
        <h1 className="mb-2 text-2xl font-bold text-white">Review Your Screenplay</h1>
        <p className="mb-6 text-neutral-400">Does your screenplay look good?</p>

        {/* Scene Count Badge */}
        {screenplayRaw && (
          <div className="mb-6 inline-block rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
            {sceneCount} scenes parsed
          </div>
        )}

        {/* Screenplay Display */}
        <div className="mb-8">
          {screenplayRaw ? (
            <pre className="rounded-lg bg-neutral-900 p-6 text-neutral-200 whitespace-pre-wrap font-mono text-sm overflow-x-auto">
              {screenplayRaw}
            </pre>
          ) : (
            <div className="rounded-lg bg-neutral-900 p-6 text-neutral-500">
              No screenplay generated yet.
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="mb-8 rounded-lg bg-neutral-900 px-6 py-4 text-neutral-300">
            Generating storyboard...
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleRedo}
            className="rounded-lg border border-neutral-700 px-6 py-3 font-medium text-neutral-300 hover:bg-neutral-900 hover:border-neutral-600 transition"
          >
            Redo
          </button>
          <button
            onClick={handleApprove}
            disabled={isApproveDisabled}
            className={`rounded-lg px-6 py-3 font-medium transition ${
              isApproveDisabled
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {loading ? "Generating storyboard..." : "Looks Good"}
          </button>
        </div>
      </div>
    </div>
  );
}
