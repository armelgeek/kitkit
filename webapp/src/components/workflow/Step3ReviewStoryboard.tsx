import React, { useState } from "react";
import { useWorkflow } from "../../context/WorkflowContext";
import BeatCard from "./BeatCard";
import NodeEditor, { type EditorTarget } from "../nodeeditor/NodeEditor";

export default function Step3ReviewStoryboard() {
  const { state, actions } = useWorkflow();
  const { beats, editedBeatIds, generationJobId, loading, error } = state;
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const isGenerateDisabled = beats.length === 0 || loading || !!generationJobId;

  const handleRedo = () => {
    actions.redoAllBeats();
  };

  const handleGenerate = async () => {
    await actions.approveStoryboard();
  };

  const handleEditBeat = (beatId: string) => {
    const beat = beats.find((b) => b.id === beatId);
    if (!beat) return;
    setEditor({
      kind: "shot",
      id: beat.id,
      title: beat.sceneHeading,
      goal: "image",
      prompt: beat.shotPrompts || null,
      imageSrc: null,
      imageMediaId: null,
    });
  };

  const handleEditorClose = () => {
    setEditor(null);
  };

  const handleEditorApplied = (result: any) => {
    if (editor) {
      // Mark the beat as edited when changes are applied
      actions.updateBeat(editor.id, {
        // Changes from the editor would be reflected here
        // For now, just marking it as edited
      });
    }
    setEditor(null);
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-neutral-950 p-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-950 px-4 py-3 text-red-200">
            {error}
          </div>
        )}

        <div className="max-w-4xl mx-auto">
          <h1 className="mb-2 text-2xl font-bold text-white">Review Your Storyboard</h1>
          <p className="mb-6 text-neutral-400">You can edit individual beats before generating images</p>

          {/* Beat Count Badge */}
          {beats.length > 0 && (
            <div className="mb-6 inline-block rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-300">
              {beats.length} beats · Ready to generate images
            </div>
          )}

          {/* Beats List */}
          <div className="mb-8">
            {beats.length > 0 ? (
              <div className="space-y-4">
                {beats.map((beat, idx) => (
                  <BeatCard
                    key={beat.id}
                    beat={beat}
                    index={idx}
                    isEdited={editedBeatIds.has(beat.id)}
                    onEdit={() => handleEditBeat(beat.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-neutral-900 p-6 text-neutral-500">
                No beats generated yet
              </div>
            )}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="mb-8 rounded-lg bg-neutral-900 px-6 py-4 text-neutral-300">
              Generating images...
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleRedo}
              className="rounded-lg border border-neutral-700 px-6 py-3 font-medium text-neutral-300 hover:bg-neutral-900 hover:border-neutral-600 transition"
            >
              Redo All
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerateDisabled}
              className={`rounded-lg px-6 py-3 font-medium transition ${
                isGenerateDisabled
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {loading ? "Starting generation..." : generationJobId ? "✓ Generation started" : "Generate Images"}
            </button>
          </div>
        </div>
      </div>

      {/* NodeEditor Modal */}
      {editor && (
        <NodeEditor
          target={editor}
          entities={[]}
          projectId=""
          onClose={handleEditorClose}
          onApplied={handleEditorApplied}
        />
      )}
    </>
  );
}
