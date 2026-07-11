import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, thumbUrl, type Project, type FlowProject } from "../api/client";
import Thumb from "./Thumb";
import { useConfirm } from "./common/Confirm";

export default function ProjectGrid() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [flow, setFlow] = useState<FlowProject[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirm = useConfirm();

  const importZip = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setErr(null);
    try {
      const p = await api.importProjectZip(file);
      await refresh();
      navigate(`/project/${p.id}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setImporting(false);
    }
  };

  const refresh = async () => {
    try {
      setProjects((await api.listProjects()).projects);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const loadFlow = async () => {
    setShowImport((s) => !s);
    if (!flow.length) {
      try {
        setFlow((await api.flowProjects()).projects);
      } catch (e: any) {
        setErr(e.message);
      }
    }
  };

  const importFlow = async (fp: FlowProject) => {
    await api.createProject({
      title: fp.title || "Untitled",
      import_flow_project_id: fp.flow_project_id,
      import_thumb_media_key: fp.thumb_media_key,
    });
    await refresh();
    setShowImport(false);
  };

  const remove = async (p: Project) => {
    const ok = await confirm({
      title: "Delete project?",
      message: `Project "${p.title}" will be removed from Studio.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    await api.deleteProject(p.id);
    refresh();
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Projects</h1>
          <p className="text-sm text-neutral-400">Turn ideas into videos with AI</p>
        </div>
        <div className="flex gap-3">
          <label
            title="Import a project from an exported .zip file"
            className="cursor-pointer rounded-lg border border-neutral-600 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800 transition-colors duration-150"
          >
            {importing ? "Importing…" : "⬆ Import .zip"}
            <input
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              disabled={importing}
              onChange={(e) => importZip(e.target.files?.[0])}
            />
          </label>
          <button
            onClick={loadFlow}
            className="rounded-lg border border-neutral-600 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800 transition-colors duration-150"
          >
          Import from Flow
          </button>
          <button
            onClick={() => navigate("/project/new")}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors duration-150"
          >
            + New project
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-rose-800 bg-rose-950/40 px-4 py-2 text-sm text-rose-300">
          {err}
        </div>
      )}

      {showImport && (
        <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-300">
            Projects on Google Flow
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {flow.map((fp) => (
              <button
                key={fp.flow_project_id}
                onClick={() => importFlow(fp)}
                className="group text-left"
              >
                <Thumb
                  src={fp.thumb_media_key ? thumbUrl(fp.thumb_media_key) : null}
                  alt={fp.title}
                  className="aspect-video w-full ring-1 ring-neutral-800 group-hover:ring-indigo-500"
                />
                <div className="mt-1.5 truncate text-xs text-neutral-300">{fp.title}</div>
              </button>
            ))}
            {!flow.length && (
              <div className="col-span-full py-6 text-center text-sm text-neutral-500">
                Loading... (extension connection required)
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((p) => (
          <div
            key={p.id}
            className="group overflow-hidden rounded-xl bg-neutral-900/70 shadow-sm transition-shadow duration-200 hover:shadow-md"
          >
            <button onClick={() => navigate(`/project/${p.id}`)} className="block w-full text-left">
              <Thumb
                src={p.thumb_media_key ? thumbUrl(p.thumb_media_key) : null}
                alt={p.title}
                rounded="rounded-none"
                className="aspect-video w-full"
              />
            </button>
            <div className="flex flex-col gap-2 p-4">
              <button onClick={() => navigate(`/project/${p.id}`)} className="text-left">
                <div className="truncate font-semibold text-base text-white">{p.title}</div>
              </button>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 truncate text-xs text-neutral-500">
                  <span>{p.style}</span>
                  {p.storytelling ? (
                    <>
                      <span> • </span>
                      <span className="rounded bg-amber-500/15 px-1.5 text-amber-300 inline">
                        storytelling
                      </span>
                    </>
                  ) : null}
                  <span> • </span>
                  {/* Note: using updated_at (Project has no created_at field) */}
                  <span>{new Date(p.updated_at * 1000).toISOString().split('T')[0]}</span>
                  {p.target_duration && (
                    <>
                      <span> • </span>
                      <span>{Math.round(p.target_duration / 60)} min</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => remove(p)}
                  title="Delete"
                  className="rounded-md p-2 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-150 flex-shrink-0"
                >
                  🗑
                </button>
              </div>
            </div>
          </div>
        ))}
        {!projects.length && (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-800 py-16 text-center text-neutral-500">
            No projects yet. Click <b className="text-neutral-300">+ New project</b> to get started.
          </div>
        )}
      </div>

    </div>
  );
}
