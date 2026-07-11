import React from "react";
import type { Beat } from "../../types/workflow";

interface BeatCardProps {
  beat: Beat;
  index: number; // 0-based
  isEdited: boolean;
  onEdit: () => void;
}

export default function BeatCard({ beat, index, isEdited, onEdit }: BeatCardProps) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-6">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Beat {beat.beatIndex || index + 1}{beat.totalBeats ? `/${beat.totalBeats}` : ""}
          </h3>
          {beat.tone && (
            <p className="text-sm text-amber-400 mt-1">Tone: {beat.tone}</p>
          )}
        </div>
        {isEdited && (
          <span className="text-yellow-500 text-sm font-medium">✎ Edited</span>
        )}
      </div>

      {/* Voiceover/Text Section */}
      {beat.voiceover && (
        <div className="mb-4 p-3 bg-neutral-800 rounded-lg border border-neutral-700">
          <p className="text-sm font-medium text-neutral-400 mb-2">Narration:</p>
          <p className="text-neutral-200 italic">{beat.voiceover}</p>
        </div>
      )}

      {/* Character Arcs */}
      {beat.characterArcs && Object.keys(beat.characterArcs).length > 0 && (
        <div className="mb-6 p-3 bg-indigo-950/30 rounded-lg border border-indigo-700/30">
          <p className="text-sm font-medium text-indigo-400 mb-2">Character States:</p>
          <div className="space-y-1">
            {Object.entries(beat.characterArcs).map(([char, arc]) => (
              <p key={char} className="text-sm text-indigo-300">
                <span className="font-semibold">{char}:</span> {arc}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {beat.description && (
        <div className="mb-6">
          <p className="text-sm font-medium text-neutral-400 mb-2">Scene:</p>
          <p className="text-neutral-300">{beat.description}</p>
        </div>
      )}

      {/* Entities Section */}
      {beat.entities && beat.entities.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-neutral-400">Entities:</p>
          <div className="flex flex-wrap gap-2">
            {beat.entities.map((entity, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded-full bg-neutral-800 px-3 py-1 text-sm text-neutral-300"
              >
                {entity.name} ({entity.type})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Transition Note */}
      {beat.transitionPrompt && (
        <div className="mb-6 p-3 bg-amber-950/30 rounded-lg border border-amber-700/30">
          <p className="text-sm font-medium text-amber-400">→ Next transition:</p>
          <p className="text-sm text-amber-300">{beat.transitionPrompt}</p>
        </div>
      )}

      {/* Shot Prompts Section */}
      {beat.shotPrompts && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-neutral-400">Visual Prompt:</p>
          <p className="text-sm text-neutral-300 max-h-32 overflow-y-auto">{beat.shotPrompts}</p>
        </div>
      )}

      {/* Motion Hints Section */}
      {beat.motionHints && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-neutral-400">Motion Hints:</p>
          <p className="text-neutral-300">{beat.motionHints}</p>
        </div>
      )}

      {/* Edit Button */}
      <div className="flex justify-end">
        <button
          onClick={onEdit}
          className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 hover:border-neutral-600 transition"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
