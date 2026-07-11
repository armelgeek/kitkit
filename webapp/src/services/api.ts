import { AssetHistoryResponse } from "../types/versioning";

const BASE_URL = "/api/studio";

export async function getAssetHistory(
  projectId: string,
  entityId: string
): Promise<AssetHistoryResponse> {
  const response = await fetch(
    `${BASE_URL}/projects/${projectId}/entities/${entityId}/history`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch history: ${response.statusText}`);
  }
  return response.json();
}

export async function setActiveVersion(
  projectId: string,
  entityId: string,
  versionNum: number
): Promise<void> {
  const response = await fetch(
    `${BASE_URL}/projects/${projectId}/entities/${entityId}/set-active-version`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_num: versionNum }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to set active version: ${response.statusText}`);
  }
}

export async function regenerateAsset(
  projectId: string,
  entityId: string,
  prompt?: string,
  instructions?: string
): Promise<{ job_id: string; version_num: number | null }> {
  const response = await fetch(
    `${BASE_URL}/projects/${projectId}/entities/${entityId}/regenerate`,
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
  return response.json();
}
