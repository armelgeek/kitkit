import React from "react";
import { VersionEntry } from "../types/versioning";

interface AssetHistoryModalProps {
  entityId: string;
  versions: VersionEntry[];
  activeVersion: number;
  onClose: () => void;
  onSetActive: (versionNum: number) => Promise<void>;
}

export const AssetHistoryModal: React.FC<AssetHistoryModalProps> = ({
  entityId,
  versions,
  activeVersion,
  onClose,
  onSetActive,
}) => {
  const [loading, setLoading] = React.useState(false);

  const handleSetActive = async (versionNum: number) => {
    setLoading(true);
    try {
      await onSetActive(versionNum);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Version History</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {versions.length === 0 ? (
            <p className="text-gray-500">No versions yet</p>
          ) : (
            versions.map((version) => (
              <div
                key={version.version}
                className={`p-4 border rounded-lg ${
                  version.version === activeVersion
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-semibold">
                      Version {version.version}
                      {version.version === activeVersion && (
                        <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">
                          Active
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date(version.generated_at).toLocaleString()}
                    </p>
                    <p className="text-sm mt-2">
                      <strong>Prompt:</strong> {version.prompt}
                    </p>
                    {version.instructions && (
                      <p className="text-sm">
                        <strong>Instructions:</strong> {version.instructions}
                      </p>
                    )}
                    {version.status !== "success" && (
                      <p className="text-sm text-red-600">
                        <strong>Status:</strong> {version.status}
                      </p>
                    )}
                  </div>
                  {version.version !== activeVersion && (
                    <button
                      onClick={() => handleSetActive(version.version)}
                      disabled={loading}
                      className="ml-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                      {loading ? "Setting..." : "Set as Active"}
                    </button>
                  )}
                </div>
                {version.reference_image_url && (
                  <img
                    src={version.reference_image_url}
                    alt={`Version ${version.version}`}
                    className="mt-3 max-h-32 rounded"
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
