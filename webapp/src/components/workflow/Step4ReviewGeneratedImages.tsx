import React, { useState } from "react";
import { useWorkflow } from "../../context/WorkflowContext";
import type { GeneratedImage } from "../../types/workflow";

export default function Step4ReviewGeneratedImages() {
  const { state, actions } = useWorkflow();
  const { generatedImages, beats, loading, error } = state;
  const [expandedBeat, setExpandedBeat] = useState<number | null>(null);

  const handleProceed = () => {
    actions.proceedToVideo();
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-950 p-8">
      {/* Error Display */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {error}
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <h1 className="mb-2 text-2xl font-bold text-white">Review Generated Images</h1>
        <p className="mb-6 text-neutral-400">
          Visual prompts have been enhanced for consistency. Review the prompts and generated images for each beat before proceeding to video generation.
        </p>

        {/* Image Count Badge */}
        {generatedImages.length > 0 && (
          <div className="mb-6 inline-block rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
            {generatedImages.length} images generated
          </div>
        )}

        {/* Images Grid */}
        <div className="mb-8 space-y-6">
          {generatedImages.length > 0 ? (
            generatedImages.map((img: GeneratedImage, idx: number) => {
              const beat = beats[idx];
              const isExpanded = expandedBeat === idx;

              return (
                <div
                  key={img.beat_id}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden hover:bg-neutral-800 transition"
                >
                  {/* Header */}
                  <div
                    onClick={() => setExpandedBeat(isExpanded ? null : idx)}
                    className="cursor-pointer p-4 border-b border-neutral-800"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          Beat {idx + 1}
                        </h3>
                        <p className="text-sm text-neutral-400 mt-1">
                          {beat?.voiceover?.substring(0, 100)}...
                        </p>
                      </div>
                      <span className="text-neutral-400">
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  {isExpanded && (
                    <div className="p-6 space-y-6">
                      {/* Image Preview */}
                      <div>
                        <p className="mb-3 text-sm font-medium text-neutral-400">Generated Image:</p>
                        <div className="rounded-lg bg-neutral-800 aspect-video flex items-center justify-center overflow-hidden">
                          <div className="text-center text-neutral-500">
                            <div className="text-6xl mb-2">🖼️</div>
                            <p>Image URL: {img.image_url}</p>
                            <p className="text-xs mt-2 text-neutral-600">(In production, actual image would display here)</p>
                          </div>
                        </div>
                      </div>

                      {/* Original Visual Prompt */}
                      <div>
                        <p className="mb-2 text-sm font-medium text-neutral-400">Original Visual Prompt:</p>
                        <div className="rounded-lg bg-neutral-800 p-4">
                          <p className="text-sm text-neutral-300">
                            {img.visual_prompt || "No prompt"}
                          </p>
                        </div>
                      </div>

                      {/* Enhanced Visual Prompt */}
                      <div>
                        <p className="mb-2 text-sm font-medium text-neutral-400">Enhanced Visual Prompt:</p>
                        <div className="rounded-lg bg-indigo-950/30 border border-indigo-700/50 p-4">
                          <p className="text-sm text-neutral-200">
                            {img.enhanced_prompt || "No enhanced prompt"}
                          </p>
                        </div>
                      </div>

                      {/* Consistency Notes */}
                      {img.consistency_notes && (
                        <div>
                          <p className="mb-2 text-sm font-medium text-neutral-400">Consistency Notes:</p>
                          <div className="rounded-lg bg-neutral-800 p-4 border-l-2 border-green-600">
                            <p className="text-sm text-neutral-300">
                              {img.consistency_notes}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Motion Prompt */}
                      {beat?.motionHints && (
                        <div>
                          <p className="mb-2 text-sm font-medium text-neutral-400">Motion Prompt:</p>
                          <div className="rounded-lg bg-neutral-800 p-4">
                            <p className="text-sm text-neutral-300">
                              {beat.motionHints}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="rounded-lg bg-neutral-900 p-6 text-neutral-500">
              No images generated yet.
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="mb-8 rounded-lg bg-neutral-900 px-6 py-4 text-neutral-300">
            Generating and enhancing image prompts...
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => actions.goToStep(4)}
            className="rounded-lg border border-neutral-700 px-6 py-3 font-medium text-neutral-300 hover:bg-neutral-900 hover:border-neutral-600 transition"
          >
            Back to Assets
          </button>
          <button
            onClick={handleProceed}
            disabled={loading || generatedImages.length === 0}
            className={`rounded-lg px-6 py-3 font-medium transition ${
              loading || generatedImages.length === 0
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {loading ? "Generating..." : "Proceed to Video"}
          </button>
        </div>
      </div>
    </div>
  );
}
