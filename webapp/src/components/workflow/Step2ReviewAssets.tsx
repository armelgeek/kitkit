import React, { useState, useEffect } from "react";
import { useWorkflow } from "../../context/WorkflowContext";
import { AssetHistoryModal } from "../AssetHistoryModal";
import { RegenerateForm } from "../RegenerateForm";
import { VersionEntry } from "../../types/versioning";

interface Asset {
  id: string;
  name: string;
  description: string;
  type: "character" | "location" | "prop";
  reference_image_url?: string;
  generating?: boolean;
}

export default function Step2ReviewAssets() {
  const { state, actions } = useWorkflow();

  if (!state) {
    return <div className="p-4">Loading...</div>;
  }

  const {
    characters = [],
    locations = [],
    props: propsData = [],
    beats = [],
    loading,
    error,
    projectId,
    flowProjectId,
  } = state;

  const [assets, setAssets] = useState<Asset[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDesc, setEditingDesc] = useState("");
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [newAssetType, setNewAssetType] = useState<
    "character" | "location" | "prop" | null
  >(null);
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetDesc, setNewAssetDesc] = useState("");
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [historyVersions, setHistoryVersions] = useState<VersionEntry[]>([]);
  const [activeHistoryVersion, setActiveHistoryVersion] = useState<number>(0);
  const [regenerateFormOpen, setRegenerateFormOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<Asset | null>(null);

  const allAssets =
    (characters?.length || 0) +
    (locations?.length || 0) +
    (propsData?.length || 0);
  const assetsWithImages = assets.filter((a) => a.reference_image_url).length;
  const allImagesGenerated = allAssets > 0 && assetsWithImages === allAssets;
  const canProceed = allImagesGenerated && !loading;

  const refreshAssets = async () => {
    if (!projectId) return;

    try {
      const [charsRes, locsRes, propsRes] = await Promise.all([
        fetch(`/api/studio/projects/${projectId}/characters`),
        fetch(`/api/studio/projects/${projectId}/locations`),
        fetch(`/api/studio/projects/${projectId}/props`),
      ]);

      if (charsRes.ok && locsRes.ok && propsRes.ok) {
        const charsResp = await charsRes.json();
        const locsResp = await locsRes.json();
        const propsResp = await propsRes.json();

        const all: Asset[] = [
          ...(charsResp.characters || []).map((c) => ({
            ...c,
            type: "character" as const,
          })),
          ...(locsResp.locations || []).map((l) => ({
            ...l,
            type: "location" as const,
          })),
          ...(propsResp.props || []).map((p) => ({
            ...p,
            type: "prop" as const,
          })),
        ];
        setAssets(all);
        setGeneratingIds(new Set());
      }
    } catch (err) {
      console.error("Failed to refresh assets:", err);
      setGeneratingIds(new Set());
    }
  };

  const addNewAsset = async () => {
    if (!newAssetType || !newAssetName.trim() || !newAssetDesc.trim()) return;

    try {
      const endpoint =
        newAssetType === "character"
          ? "characters"
          : newAssetType === "location"
            ? "locations"
            : "props";
      console.log("kkkkk", `/api/studio/projects/${projectId}/${endpoint}`);
      const resp = await fetch(
        `/api/studio/projects/${projectId}/${endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            name: newAssetName,
            description: newAssetDesc,
          }),
        },
      );

      if (resp.ok) {
        setNewAssetType(null);
        setNewAssetName("");
        setNewAssetDesc("");
        // Reload all assets to show the new one from DB
        await refreshAssets();
      }
    } catch (err) {
      console.error("Failed to add asset:", err);
    }
  };

  // Load assets on mount if not already in context
  useEffect(() => {
    if (projectId && characters.length === 0 && locations.length === 0 && propsData.length === 0) {
      refreshAssets();
    }
  }, [projectId]);

  // Sync context data to local state whenever context changes
  useEffect(() => {
    const all: Asset[] = [
      ...characters.map((c) => ({ ...c, type: "character" as const })),
      ...locations.map((l) => ({ ...l, type: "location" as const })),
      ...propsData.map((p) => ({ ...p, type: "prop" as const })),
    ];
    setAssets(all);
  }, [characters, locations, propsData]);

  const startEdit = (asset: Asset) => {
    setEditingId(asset.id);
    setEditingDesc(asset.description);
  };

  const saveEdit = async (assetId: string) => {
    setEditingId(null);

    // Save to DB
    try {
      await fetch(
        `/api/studio/${assets.find((a) => a.id === assetId)?.type}s/${assetId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: editingDesc }),
        },
      );
      // Reload all assets to sync with DB
      await refreshAssets();
    } catch (err) {
      console.error("Failed to save:", err);
    }
  };

  const generateAllReferences = async () => {
    if (!projectId || assets.length === 0) return;

    setGeneratingIds(new Set(assets.map((a) => a.id)));

    try {
      // Connect to WebSocket FIRST (before starting generation)
      const ws = new WebSocket(`ws://${window.location.host}/api/studio/jobs/ws`);
      let jobCompleted = false;
      let pollingInterval: NodeJS.Timeout | null = null;
      let jobId: string | null = null;

      // Wait for WebSocket connection before starting generation
      await new Promise<void>((resolve) => {
        ws.onopen = () => {
          console.log("Connected to WebSocket for real-time updates");
          resolve();
        };
      });

      // NOW start asset generation after WebSocket is ready
      const response = await fetch(
        `/api/studio/projects/${projectId}/generate-asset-references`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to start asset generation");
      }

      const { job_id } = await response.json();
      jobId = job_id;
      console.log("Asset generation job started:", job_id);

      // Polling function to check asset images in real-time
      const pollAssets = async () => {
        try {
          const [charsRes, locsRes, propsRes] = await Promise.all([
            fetch(`/api/studio/projects/${projectId}/characters`),
            fetch(`/api/studio/projects/${projectId}/locations`),
            fetch(`/api/studio/projects/${projectId}/props`),
          ]);

          if (charsRes.ok && locsRes.ok && propsRes.ok) {
            const charsResp = await charsRes.json();
            const locsResp = await locsRes.json();
            const propsResp = await propsRes.json();

            const all: Asset[] = [
              ...(charsResp.characters || []).map((c) => ({
                ...c,
                type: "character" as const,
              })),
              ...(locsResp.locations || []).map((l) => ({
                ...l,
                type: "location" as const,
              })),
              ...(propsResp.props || []).map((p) => ({
                ...p,
                type: "prop" as const,
              })),
            ];

            setAssets(all);

            // Update generating IDs based on which still don't have images
            const stillGenerating = new Set(
              all.filter((a) => !a.reference_image_url).map((a) => a.id),
            );
            setGeneratingIds(stillGenerating);
          }
        } catch (err) {
          console.error("Failed to poll assets:", err);
        }
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "snapshot") {
            // Initial list of jobs, find ours
            const job = msg.jobs.find((j: any) => j.id === jobId);
            if (job?.status === "done") {
              jobCompleted = true;
              if (pollingInterval) clearInterval(pollingInterval);
              await refreshAssets();
            }
          } else if (msg.type === "job" && jobId && msg.job.id === jobId) {
            // Job update for our generation
            const job = msg.job;

            // Log progress
            if (job.done > 0 || job.errors.length > 0) {
              console.log(
                `Asset generation progress: ${job.done}/${job.total} done, ${job.errors.length} errors`,
              );
            }

            // Start polling assets during generation
            if (!pollingInterval && job.status === "running") {
              pollingInterval = setInterval(pollAssets, 2000); // Poll every 2 seconds
              pollAssets(); // Poll immediately
            }

            // When complete, stop polling and fetch final state
            if (job.status === "done") {
              jobCompleted = true;
              if (pollingInterval) clearInterval(pollingInterval);
              await refreshAssets();
            }
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      ws.onerror = () => {
        console.error("WebSocket connection error");
        if (pollingInterval) clearInterval(pollingInterval);
        setGeneratingIds(new Set());
      };

      ws.onclose = () => {
        if (pollingInterval) clearInterval(pollingInterval);
        if (!jobCompleted) {
          setGeneratingIds(new Set());
        }
      };
    } catch (err) {
      console.error("Failed to start asset generation:", err);
      setGeneratingIds(new Set());
    }
  };

  const getBeatsForAsset = (assetName: string, assetType: string) => {
    if (assetType !== "character" || !beats) return [];
    return beats
      .map((beat, idx) =>
        beat.characterNames?.includes(assetName) ? idx : null,
      )
      .filter((idx): idx is number => idx !== null);
  };

  const openHistoryModal = async (assetId: string) => {
    setSelectedEntityId(assetId);
    setHistoryModalOpen(true);
    // ponytail: placeholder for history data; real data from Task 7 API
    setHistoryVersions([]);
    setActiveHistoryVersion(0);
  };

  const closeHistoryModal = () => {
    setHistoryModalOpen(false);
    setSelectedEntityId(null);
    setHistoryVersions([]);
    setActiveHistoryVersion(0);
  };

  const handleSetActiveVersion = async (versionNum: number) => {
    if (!selectedEntityId) return;
    // ponytail: placeholder for version switching; actual API call in Task 7
    console.log(`Setting asset ${selectedEntityId} to version ${versionNum}`);
  };

  const handleOpenRegenerate = (entity: Asset) => {
    setSelectedEntity(entity);
    setRegenerateFormOpen(true);
  };

  const closeRegenerateForm = () => {
    setRegenerateFormOpen(false);
    setSelectedEntity(null);
  };

  const handleRegenerating = (jobId: string, versionNum: number | null) => {
    // Mark this asset as generating
    setGeneratingIds(new Set([...generatingIds, selectedEntity?.id || ""]));

    try {
      // Connect to WebSocket to watch job progress
      const ws = new WebSocket(`ws://${window.location.host}/api/studio/jobs/ws`);
      let jobCompleted = false;
      let pollingInterval: NodeJS.Timeout | null = null;

      // Wait for WebSocket connection
      ws.onopen = () => {
        console.log("Connected to WebSocket for regeneration updates");
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "snapshot") {
            // Initial list of jobs, find ours
            const job = msg.jobs.find((j: any) => j.id === jobId);
            if (job?.status === "done") {
              jobCompleted = true;
              if (pollingInterval) clearInterval(pollingInterval);
              await refreshAssets();
            }
          } else if (msg.type === "job" && msg.job.id === jobId) {
            // Job update for our regeneration
            const job = msg.job;

            // Log progress
            if (job.done > 0 || job.errors.length > 0) {
              console.log(
                `Asset regeneration progress: ${job.done}/${job.total} done, ${job.errors.length} errors`,
              );
            }

            // Start polling assets during regeneration
            if (!pollingInterval && job.status === "running") {
              pollingInterval = setInterval(refreshAssets, 2000);
              refreshAssets();
            }

            // When complete, stop polling and fetch final state
            if (job.status === "done") {
              jobCompleted = true;
              if (pollingInterval) clearInterval(pollingInterval);
              await refreshAssets();
            }
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      ws.onerror = () => {
        console.error("WebSocket connection error");
        if (pollingInterval) clearInterval(pollingInterval);
        setGeneratingIds(new Set());
      };

      ws.onclose = () => {
        if (pollingInterval) clearInterval(pollingInterval);
        if (!jobCompleted) {
          setGeneratingIds(new Set());
        }
      };
    } catch (err) {
      console.error("Failed to watch regeneration:", err);
      setGeneratingIds(new Set());
    }
  };

  const handleProceed = async () => {
    console.log("Step2ReviewAssets: proceeding to generate beats");
    await actions.generateBeats();
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-950 p-8">
      {error && (
        <div className="mb-6 rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {error}
        </div>
      )}

      <div className="max-w-5xl mx-auto">
        <h1 className="mb-2 text-2xl font-bold text-white">
          Review & Manage Assets
        </h1>
        <p className="mb-6 text-neutral-400">
          Review extracted assets and generate reference images for visual
          consistency
        </p>

        {/* Add New Asset Section */}
        {!newAssetType ? (
          <div className="mb-8 flex gap-2">
            <button
              onClick={() => setNewAssetType("character")}
              className="rounded-lg bg-indigo-600/20 border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-300 hover:bg-indigo-600/30 transition"
            >
              + Add Character
            </button>
            <button
              onClick={() => setNewAssetType("location")}
              className="rounded-lg bg-amber-600/20 border border-amber-600 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-600/30 transition"
            >
              + Add Location
            </button>
            <button
              onClick={() => setNewAssetType("prop")}
              className="rounded-lg bg-violet-600/20 border border-violet-600 px-4 py-2 text-sm font-medium text-violet-300 hover:bg-violet-600/30 transition"
            >
              + Add Prop
            </button>
          </div>
        ) : (
          <div className="mb-8 rounded-lg bg-neutral-900 border border-neutral-800 p-4">
            <h3 className="mb-4 font-semibold text-white">
              Add New{" "}
              {newAssetType.charAt(0).toUpperCase() + newAssetType.slice(1)}
            </h3>
            <div className="space-y-3 mb-4">
              <input
                type="text"
                value={newAssetName}
                onChange={(e) => setNewAssetName(e.target.value)}
                placeholder="Name"
                className="w-full rounded bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <textarea
                value={newAssetDesc}
                onChange={(e) => setNewAssetDesc(e.target.value)}
                placeholder="Description"
                className="w-full rounded bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={addNewAsset}
                className="flex-1 rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setNewAssetType(null);
                  setNewAssetName("");
                  setNewAssetDesc("");
                }}
                className="flex-1 rounded bg-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Generate All Button */}
        {allAssets > 0 && !allImagesGenerated && (
          <div className="mb-8 flex gap-3">
            <button
              onClick={generateAllReferences}
              disabled={generatingIds.size > 0}
              className={`flex-1 rounded-lg px-4 py-3 font-medium transition ${
                generatingIds.size > 0
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {generatingIds.size > 0
                ? "Generating all reference images..."
                : "🎨 Generate All Reference Images"}
            </button>
          </div>
        )}

        {/* Assets Grid */}
        <div className="space-y-8">
          {/* Characters */}
          {assets.filter((a) => a.type === "character").length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold text-indigo-400">
                Characters
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {assets
                  .filter((a) => a.type === "character")
                  .map((asset) => {
                    const beatIndices = getBeatsForAsset(
                      asset.name,
                      "character",
                    );
                    const isGenerating = generatingIds.has(asset.id);

                    return (
                      <div
                        key={asset.id}
                        className="rounded-lg bg-neutral-900 border border-neutral-800 p-5"
                      >
                        {/* Header */}
                        <div className="mb-3 flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-white">
                              {asset.name}
                            </h3>
                            <span className="text-xs text-neutral-500">
                              Character
                            </span>
                          </div>
                          {beatIndices.length > 0 && (
                            <div className="text-right">
                              <div className="text-xs text-neutral-400">
                                Appears in
                              </div>
                              <div className="text-sm font-mono text-indigo-400">
                                beats {beatIndices.map((i) => i + 1).join(", ")}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Description */}
                        {editingId === asset.id ? (
                          <div className="mb-3">
                            <textarea
                              value={editingDesc}
                              onChange={(e) => setEditingDesc(e.target.value)}
                              className="w-full rounded bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                              rows={3}
                            />
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => saveEdit(asset.id)}
                                className="flex-1 rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="flex-1 rounded bg-neutral-700 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => startEdit(asset)}
                            className="mb-3 cursor-pointer rounded bg-neutral-800/50 p-2 text-sm text-neutral-300 hover:bg-neutral-800 transition"
                          >
                            {asset.description}
                          </div>
                        )}

                        {/* Reference Image */}
                        {asset.reference_image_url ? (
                          <div>
                            <img
                              src={asset.reference_image_url}
                              alt={asset.name}
                              className="w-full h-40 object-cover rounded mb-3 border border-neutral-700"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => openHistoryModal(asset.id)}
                                className="flex-1 px-3 py-2 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700 transition"
                              >
                                📜 History
                              </button>
                              <button
                                onClick={() => handleOpenRegenerate(asset)}
                                className="flex-1 px-3 py-2 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700 transition"
                              >
                                🔄 Regenerate
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-40 bg-neutral-800 rounded mb-3 border border-neutral-700 flex items-center justify-center">
                            <span className="text-neutral-500 text-sm">
                              Pending generation
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* Locations */}
          {assets.filter((a) => a.type === "location").length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold text-amber-400">
                Locations
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {assets
                  .filter((a) => a.type === "location")
                  .map((asset) => {
                    const isGenerating = generatingIds.has(asset.id);

                    return (
                      <div
                        key={asset.id}
                        className="rounded-lg bg-neutral-900 border border-neutral-800 p-5"
                      >
                        <h3 className="mb-1 font-semibold text-white">
                          {asset.name}
                        </h3>
                        <span className="text-xs text-neutral-500">
                          Location
                        </span>

                        {editingId === asset.id ? (
                          <div className="mt-3">
                            <textarea
                              value={editingDesc}
                              onChange={(e) => setEditingDesc(e.target.value)}
                              className="w-full rounded bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-600"
                              rows={3}
                            />
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => saveEdit(asset.id)}
                                className="flex-1 rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="flex-1 rounded bg-neutral-700 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => startEdit(asset)}
                            className="mt-3 cursor-pointer rounded bg-neutral-800/50 p-2 text-sm text-neutral-300 hover:bg-neutral-800 transition"
                          >
                            {asset.description}
                          </div>
                        )}

                        {asset.reference_image_url ? (
                          <div>
                            <img
                              src={asset.reference_image_url}
                              alt={asset.name}
                              className="w-full h-40 object-cover rounded my-3 border border-neutral-700"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => openHistoryModal(asset.id)}
                                className="flex-1 px-3 py-2 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700 transition"
                              >
                                📜 History
                              </button>
                              <button
                                onClick={() => handleOpenRegenerate(asset)}
                                className="flex-1 px-3 py-2 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700 transition"
                              >
                                🔄 Regenerate
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-40 bg-neutral-800 rounded my-3 border border-neutral-700 flex items-center justify-center">
                            <span className="text-neutral-500 text-sm">
                              Pending generation
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          )}
        </div>

        {/* Progress Indicator */}
        {allAssets > 0 && (
          <div className="mt-8 rounded-lg bg-neutral-900 p-4 border border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">
                Reference Images Generated
              </span>
              <span
                className={`text-sm font-mono ${allImagesGenerated ? "text-green-400" : "text-neutral-400"}`}
              >
                {assetsWithImages} / {allAssets}
              </span>
            </div>
            <div className="w-full bg-neutral-800 rounded h-2">
              <div
                className="bg-green-600 h-2 rounded transition-all"
                style={{ width: `${(assetsWithImages / allAssets) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleProceed}
            disabled={!canProceed}
            className={`flex-1 rounded-lg px-4 py-3 font-medium transition ${
              canProceed
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
            }`}
          >
            {loading
              ? "Processing..."
              : !allImagesGenerated
                ? `Generate all reference images (${assetsWithImages}/${allAssets})`
                : "✓ Proceed to Beats"}
          </button>
        </div>
      </div>

      {/* Asset History Modal */}
      {historyModalOpen && selectedEntityId && (
        <AssetHistoryModal
          entityId={selectedEntityId}
          versions={historyVersions}
          activeVersion={activeHistoryVersion}
          onClose={closeHistoryModal}
          onSetActive={handleSetActiveVersion}
        />
      )}

      {/* Regenerate Form Modal */}
      {regenerateFormOpen && selectedEntity && (
        <RegenerateForm
          entity={selectedEntity}
          onClose={closeRegenerateForm}
          onRegenerating={handleRegenerating}
          projectId={projectId}
        />
      )}
    </div>
  );
}
