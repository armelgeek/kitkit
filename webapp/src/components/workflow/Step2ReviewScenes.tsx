import React from "react";
import { useWorkflow } from "../../context/WorkflowContext";

export default function Step2ReviewScenes() {
  const { state, actions } = useWorkflow();
  const { scenes, loading, error } = state;

  const handleApprove = async () => {
    await actions.approveScreenplay();
  };

  const handleRedo = () => {
    actions.redoScreenplay();
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
        <h1 className="mb-2 text-2xl font-bold text-white">Review Story Scenes</h1>
        <p className="mb-6 text-neutral-400">
          Your screenplay has been automatically divided into scenes. Each scene represents a distinct location and time in your story.
        </p>

        {/* Scene Count Badge */}
        {scenes.length > 0 && (
          <div className="mb-6 inline-block rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
            {scenes.length} scenes identified
          </div>
        )}

        {/* Scenes List */}
        <div className="mb-8 space-y-4">
          {scenes.length > 0 ? (
            scenes.map((scene, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-neutral-700 bg-neutral-900 p-6 hover:bg-neutral-800 transition"
              >
                {/* Scene Number and Heading */}
                <div className="mb-3 flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-white">
                    Scene {idx + 1}
                  </h3>
                  <span className="inline-block rounded-full bg-indigo-600/20 px-3 py-1 text-xs font-medium text-indigo-300">
                    {scene.heading.split("-")[0].trim()}
                  </span>
                </div>

                {/* Scene Heading */}
                <p className="mb-4 font-mono text-sm text-neutral-400">
                  {scene.heading}
                </p>

                {/* Scene Action/Description */}
                <div className="rounded-lg bg-neutral-800 p-4">
                  <p className="text-sm text-neutral-300 whitespace-pre-wrap line-clamp-4">
                    {scene.body}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg bg-neutral-900 p-6 text-neutral-500">
              No scenes found. Make sure your screenplay is in FOUNTAIN format.
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="mb-8 rounded-lg bg-neutral-900 px-6 py-4 text-neutral-300">
            Generating beats from scenes...
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleRedo}
            className="rounded-lg border border-neutral-700 px-6 py-3 font-medium text-neutral-300 hover:bg-neutral-900 hover:border-neutral-600 transition"
          >
            Back to Screenplay
          </button>
          <button
            onClick={handleApprove}
            disabled={loading || scenes.length === 0}
            className={`rounded-lg px-6 py-3 font-medium transition ${
              loading || scenes.length === 0
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {loading ? "Generating beats..." : "Generate Beats"}
          </button>
        </div>
      </div>
    </div>
  );
}
