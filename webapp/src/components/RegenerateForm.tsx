import React from "react";

interface RegenerateFormProps {
  entity: any;
  onClose: () => void;
  onRegenerating: (jobId: string, versionNum: number | null) => void;
  projectId: string;
}

export const RegenerateForm: React.FC<RegenerateFormProps> = ({
  entity,
  onClose,
  onRegenerating,
  projectId,
}) => {
  const [prompt, setPrompt] = React.useState(entity.description || "");
  const [instructions, setInstructions] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/studio/projects/${projectId}/entities/${entity.id}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt || undefined,
            instructions: instructions || undefined,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to regenerate: ${response.statusText}`);
      }

      const data = await response.json();
      onRegenerating(data.job_id, data.version_num);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Regenerate Asset</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-semibold mb-2">Edit Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full p-3 border rounded focus:outline-none focus:border-blue-500"
              placeholder="Modify the description/prompt for the asset"
            />
          </div>

          <div>
            <label className="block font-semibold mb-2">
              Add Instructions (optional)
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              className="w-full p-3 border rounded focus:outline-none focus:border-blue-500"
              placeholder="e.g., 'Black hair instead of red, more dramatic lighting'"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? "Generating..." : "Regenerate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
