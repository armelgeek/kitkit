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
        <h3 className="text-lg font-semibold text-white">
          Beat {index + 1}: {beat.sceneHeading}
        </h3>
        {isEdited && (
          <span className="text-yellow-500 text-sm font-medium">✎ Manually edited</span>
        )}
      </div>

      {/* Description */}
      <p className="mb-6 text-neutral-300">{beat.description}</p>

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

      {/* Shot Prompts Section */}
      {beat.shotPrompts && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-neutral-400">Shot Prompts:</p>
          <p className="text-neutral-300">{beat.shotPrompts}</p>
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
