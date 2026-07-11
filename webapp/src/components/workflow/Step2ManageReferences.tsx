import React, { useState, useEffect } from "react";
import { useWorkflow } from "../../context/WorkflowContext";

interface Entity {
  id: string;
  name: string;
  description: string;
  image_prompt?: string;
  reference_image_url?: string;
  media_id?: string;
  type: "character" | "location" | "prop";
  generating?: boolean;
}

export default function Step2ManageReferences() {
  const { state, actions } = useWorkflow();
  const { characters, locations, props, beats, loading, error } = state;

  const [entities, setEntities] = useState<Entity[]>([]);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const all: Entity[] = [
      ...characters.map(c => ({ ...c, type: "character" as const })),
      ...locations.map(l => ({ ...l, type: "location" as const })),
      ...props.map(p => ({ ...p, type: "prop" as const })),
    ];
    setEntities(all);
  }, [characters, locations, props]);

  const generateReferenceImage = async (entity: Entity) => {
    setGeneratingIds(prev => new Set([...prev, entity.id]));

    try {
      const prompt = entity.image_prompt || `Reference image for ${entity.type} named ${entity.name}: ${entity.description}`;

      // Call AI to generate reference image prompt
      const response = await fetch(`/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "claude",
          prompt: `Generate a detailed visual reference prompt for a ${entity.type}:\n\nName: ${entity.name}\nDescription: ${entity.description}\n\nThe prompt should be detailed enough for an image generator to create a reference image that can be used consistently across multiple scenes.`,
          model: state.model,
          timeout: 30,
        }),
      });

      if (!response.ok) throw new Error("Failed to generate reference prompt");

      const data = await response.json();
      if (!data.ok) throw new Error("AI generation failed");

      // Extract the enhanced prompt from AI response
      const enhancedPrompt = data.stdout || prompt;

      // Generate the actual image via Flow
      if (state.flowProjectId) {
        const imageResponse = await fetch(`/api/flow/generate-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: enhancedPrompt,
            project_id: state.flowProjectId,
            aspect_ratio: "IMAGE_ASPECT_RATIO_PORTRAIT",
            user_paygate_tier: "PAYGATE_TIER_ONE",
          }),
        });

        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          const imageUrl = imageData.web || imageData.url;

          if (imageUrl) {
            // Update entity with generated image
            const updatedEntity = { ...entity, reference_image_url: imageUrl };
            setEntities(prev =>
              prev.map(e => e.id === entity.id ? updatedEntity : e)
            );

            // Save to DB
            await fetch(`/api/studio/${entity.type}s/${entity.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reference_image_url: imageUrl,
                image_prompt: enhancedPrompt,
              }),
            });
          }
        }
      }
    } catch (err) {
      console.error(`Failed to generate reference for ${entity.name}:`, err);
    } finally {
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(entity.id);
        return next;
      });
    }
  };

  const getBeatsForEntity = (entityName: string, entityType: string) => {
    return beats
      .map((beat, idx) => {
        const hasEntity =
          entityType === "character" && beat.characterNames?.includes(entityName);
        return hasEntity ? idx : null;
      })
      .filter((idx): idx is number => idx !== null);
  };

  const handleProceed = () => {
    actions.goToStep(3);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-950 p-8">
      {error && (
        <div className="mb-6 rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {error}
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <h1 className="mb-2 text-2xl font-bold text-white">Manage References</h1>
        <p className="mb-6 text-neutral-400">
          Generate and manage visual references for characters, locations, and props
        </p>

        {/* Characters */}
        {characters.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-white">Characters</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {characters.map(char => {
                const beatIndices = getBeatsForEntity(char.name, "character");
                const isGenerating = generatingIds.has(char.id);

                return (
                  <div key={char.id} className="rounded-lg bg-neutral-900 p-4 border border-neutral-800">
                    <h3 className="font-semibold text-white mb-2">{char.name}</h3>
                    <p className="text-sm text-neutral-400 mb-3">{char.description}</p>

                    {char.reference_image_url ? (
                      <div className="mb-3">
                        <img
                          src={char.reference_image_url}
                          alt={char.name}
                          className="w-full h-40 object-cover rounded border border-neutral-700"
                        />
                      </div>
                    ) : (
                      <div className="mb-3 w-full h-40 bg-neutral-800 rounded border border-neutral-700 flex items-center justify-center">
                        <span className="text-neutral-500 text-sm">No reference image</span>
                      </div>
                    )}

                    <button
                      onClick={() => generateReferenceImage(char)}
                      disabled={isGenerating}
                      className={`w-full px-3 py-2 rounded text-sm font-medium transition ${
                        isGenerating
                          ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      {isGenerating ? "Generating..." : "Generate Reference"}
                    </button>

                    {beatIndices.length > 0 && (
                      <p className="mt-2 text-xs text-neutral-400">
                        Appears in beats: {beatIndices.map(i => i + 1).join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Locations */}
        {locations.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-white">Locations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {locations.map(loc => {
                const isGenerating = generatingIds.has(loc.id);

                return (
                  <div key={loc.id} className="rounded-lg bg-neutral-900 p-4 border border-neutral-800">
                    <h3 className="font-semibold text-white mb-2">{loc.name}</h3>
                    <p className="text-sm text-neutral-400 mb-3">{loc.description}</p>

                    {loc.reference_image_url ? (
                      <div className="mb-3">
                        <img
                          src={loc.reference_image_url}
                          alt={loc.name}
                          className="w-full h-40 object-cover rounded border border-neutral-700"
                        />
                      </div>
                    ) : (
                      <div className="mb-3 w-full h-40 bg-neutral-800 rounded border border-neutral-700 flex items-center justify-center">
                        <span className="text-neutral-500 text-sm">No reference image</span>
                      </div>
                    )}

                    <button
                      onClick={() => generateReferenceImage(loc)}
                      disabled={isGenerating}
                      className={`w-full px-3 py-2 rounded text-sm font-medium transition ${
                        isGenerating
                          ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      {isGenerating ? "Generating..." : "Generate Reference"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Props */}
        {props.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-white">Props</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {props.map(prop => {
                const isGenerating = generatingIds.has(prop.id);

                return (
                  <div key={prop.id} className="rounded-lg bg-neutral-900 p-4 border border-neutral-800">
                    <h3 className="font-semibold text-white mb-2">{prop.name}</h3>
                    <p className="text-sm text-neutral-400 mb-3">{prop.description}</p>

                    {prop.reference_image_url ? (
                      <div className="mb-3">
                        <img
                          src={prop.reference_image_url}
                          alt={prop.name}
                          className="w-full h-40 object-cover rounded border border-neutral-700"
                        />
                      </div>
                    ) : (
                      <div className="mb-3 w-full h-40 bg-neutral-800 rounded border border-neutral-700 flex items-center justify-center">
                        <span className="text-neutral-500 text-sm">No reference image</span>
                      </div>
                    )}

                    <button
                      onClick={() => generateReferenceImage(prop)}
                      disabled={isGenerating}
                      className={`w-full px-3 py-2 rounded text-sm font-medium transition ${
                        isGenerating
                          ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      {isGenerating ? "Generating..." : "Generate Reference"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Proceed Button */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleProceed}
            disabled={loading}
            className={`flex-1 rounded-lg px-4 py-3 font-medium transition ${
              loading
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {loading ? "Processing..." : "Proceed to Storyboard"}
          </button>
        </div>
      </div>
    </div>
  );
}
