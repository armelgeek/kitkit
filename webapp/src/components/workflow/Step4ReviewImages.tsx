import React, { useState } from "react";
import { useWorkflow } from "../../context/WorkflowContext";
import type { GeneratedImage } from "../../types/workflow";

export default function Step4ReviewImages() {
  const { state, actions } = useWorkflow();
  const { beats, loading, error, loadingMessage } = state;

  const handleGenerateNarration = () => {
    // Proceed to generate narration step
    actions.goToStep(4.6);
  };

  // Extract progress from loadingMessage (e.g., "Beat 3/10")
  const progressMatch = loadingMessage?.match(/Beat (\d+)\/(\d+)/);
  const progress = progressMatch ? (parseInt(progressMatch[1]) / parseInt(progressMatch[2])) * 100 : 0;
  const currentBeatIdx = progressMatch ? parseInt(progressMatch[1]) - 1 : -1;

  console.log("loadingMessage:", loadingMessage, "currentBeatIdx:", currentBeatIdx, "loading:", loading);

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
            <p className="text-sm font-medium text-white">Generating Images</p>
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
        <h1 className="mb-2 text-2xl font-bold text-white">Review Generated Images</h1>
        <p className="mb-6 text-neutral-400">
          Review your generated images before proceeding
        </p>

        {/* Beat Count Badge */}
        {beats.length > 0 && (
          <div className="mb-6 inline-block rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
            {beats.length} beats ready
          </div>
        )}

        {/* Images Grid */}
        <div className="mb-8">
          {beats.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {beats.map((beat, idx: number) => (
                <div
                  key={beat.id}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden hover:border-neutral-600 transition"
                >
                  {/* Image: Real or Placeholder */}
                  <div className="aspect-video bg-neutral-800 overflow-hidden relative">
                    {beat.image_url ? (
                      <img
                        src={beat.image_url}
                        alt={`Beat ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center text-neutral-500">
                          <div className="text-2xl mb-1">🖼️</div>
                          <p className="text-xs">{loading && currentBeatIdx === idx ? "Generating..." : "Pending"}</p>
                        </div>
                      </div>
                    )}

                    {/* Loader on current beat */}
                    {loading && currentBeatIdx === idx && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-indigo-200"></div>
                        <p className="text-sm text-indigo-300 font-medium">Generating...</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-neutral-900 p-6 text-neutral-500">
              No images generated yet.
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => actions.goToStep(3)}
            className="rounded-lg border border-neutral-700 px-6 py-3 font-medium text-neutral-300 hover:bg-neutral-900 hover:border-neutral-600 transition"
          >
            Back to Storyboard
          </button>
          <button
            onClick={handleGenerateNarration}
            disabled={beats.length === 0}
            className={`rounded-lg px-6 py-3 font-medium transition ${
              beats.length === 0
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            Generate Narration
          </button>
        </div>
      </div>
    </div>
  );
}
