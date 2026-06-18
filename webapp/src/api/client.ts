// Thin fetch wrapper for the Flow Studio backend (/api/studio/*).

export interface Project {
  id: string;
  title: string;
  flow_project_id: string | null;
  style: string;
  aspect_ratio: string;
  storytelling: number;
  thumb_media_key: string | null;
  status: string;
  updated_at: number;
}

export interface FlowProject {
  flow_project_id: string;
  title: string;
  thumb_media_key: string | null;
  creation_time: string | null;
}

export interface Health {
  status: string;
  extension_connected: boolean;
  ffmpeg: boolean;
  tts: boolean;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/studio${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<Health>("/health"),
  options: () => req<any>("/options"),
  credits: () => req<any>("/credits"),
  listProjects: () => req<{ projects: Project[] }>("/projects"),
  flowProjects: () => req<{ projects: FlowProject[] }>("/flow-projects"),
  createProject: (body: any) =>
    req<Project>("/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (id: string, body: any) =>
    req<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProject: (id: string) =>
    req<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
  getSettings: () => req<Record<string, any>>("/settings"),
  putSettings: (body: Record<string, any>) =>
    req<Record<string, any>>("/settings", { method: "PUT", body: JSON.stringify(body) }),
};

// Thumbnail URL for a Flow media key (backend caches locally).
export const thumbUrl = (key: string) => `/api/studio/thumb/${key}`;
