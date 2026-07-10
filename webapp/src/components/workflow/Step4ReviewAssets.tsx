import React from "react";
import { useWorkflow } from "../../context/WorkflowContext";

export default function Step4ReviewAssets() {
  const { state, actions } = useWorkflow();
  const { entities, loading, error } = state;

  const handleGenerate = async () => {
    await actions.approveStoryboard();
  };

  const groupedEntities = {
    character: entities.filter(e => e.type === "character"),
    location: entities.filter(e => e.type === "location"),
    prop: entities.filter(e => e.type === "prop"),
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
        <h1 className="mb-2 text-2xl font-bold text-white">Generate Asset References</h1>
        <p className="mb-6 text-neutral-400">
          Before generating images, we'll create reference sheets for characters, locations, and props to keep your visuals consistent.
        </p>

        {/* Characters Section */}
        {groupedEntities.character.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-white">
              Characters ({groupedEntities.character.length})
            </h2>
            <div className="space-y-4">
              {groupedEntities.character.map((entity) => (
                <div key={entity.id} className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
                  <h3 className="mb-2 font-semibold text-white">{entity.name}</h3>
                  <p className="mb-2 text-sm text-neutral-400">{entity.description}</p>
                  <p className="text-xs text-neutral-500 italic">Will generate: Character sheet with turnarounds and expressions</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Locations Section */}
        {groupedEntities.location.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-white">
              Locations ({groupedEntities.location.length})
            </h2>
            <div className="space-y-4">
              {groupedEntities.location.map((entity) => (
                <div key={entity.id} className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
                  <h3 className="mb-2 font-semibold text-white">{entity.name}</h3>
                  <p className="mb-2 text-sm text-neutral-400">{entity.description}</p>
                  <p className="text-xs text-neutral-500 italic">Will generate: 4-angle establishing shot grid</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Props Section */}
        {groupedEntities.prop.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-white">
              Props ({groupedEntities.prop.length})
            </h2>
            <div className="space-y-4">
              {groupedEntities.prop.map((entity) => (
                <div key={entity.id} className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
                  <h3 className="mb-2 font-semibold text-white">{entity.name}</h3>
                  <p className="mb-2 text-sm text-neutral-400">{entity.description}</p>
                  <p className="text-xs text-neutral-500 italic">Will generate: Multi-angle design sheet</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mb-8 rounded-lg bg-neutral-900 px-6 py-4 text-neutral-300">
            Generating asset references...
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => actions.redoAllBeats()}
            className="rounded-lg border border-neutral-700 px-6 py-3 font-medium text-neutral-300 hover:bg-neutral-900 hover:border-neutral-600 transition"
          >
            Back
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || entities.length === 0}
            className={`rounded-lg px-6 py-3 font-medium transition ${
              loading || entities.length === 0
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {loading ? "Generating assets..." : "Generate Assets & Images"}
          </button>
        </div>
      </div>
    </div>
  );
}
