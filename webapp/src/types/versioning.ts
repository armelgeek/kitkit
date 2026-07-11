export interface VersionEntry {
  version: number;
  media_id: string;
  reference_image_url: string;
  prompt: string;
  instructions: string | null;
  generated_at: string;
  status: string;
}

export interface AssetHistoryResponse {
  entity_id: string;
  active_version: number;
  versions: VersionEntry[];
}
