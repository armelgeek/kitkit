import { useEffect, useState } from "react";
import { api, thumbUrl, type Project, type FlowProject } from "../api/client";
import Thumb from "./Thumb";
import { useConfirm } from "./common/Confirm";

// Feature flag: set to false to use old 6-tab UI, true for new 4-step workflow UI
export const USE_NEW_WORKFLOW = true;

interface Props {
  onOpen: (p: Project) => void;
}

export default function ProjectGrid({ onOpen }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [flow, setFlow] = useState<FlowProject[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [creating, setCreating] = useState(false);
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
      onOpen(p);
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
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-neutral-400">Turn ideas into videos with AI</p>
        </div>
        <div className="flex gap-2">
          <label
            title="Import a project from an exported .zip file"
            className="cursor-pointer rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
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
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
          >
          Import from Flow
          </button>
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((p) => (
          <div
            key={p.id}
            className="group overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50 transition hover:border-neutral-600"
          >
            <button onClick={() => onOpen(p)} className="block w-full text-left">
              <Thumb
                src={p.thumb_media_key ? thumbUrl(p.thumb_media_key) : null}
                alt={p.title}
                rounded="rounded-none"
                className="aspect-video w-full"
              />
            </button>
            <div className="flex items-center justify-between gap-2 p-3">
              <button onClick={() => onOpen(p)} className="min-w-0 flex-1 text-left">
                <div className="truncate font-medium">{p.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                  <span>{p.style}</span>
                  {p.storytelling ? (
                    <span className="rounded bg-amber-500/15 px-1.5 text-amber-300">
                      storytelling
                    </span>
                  ) : null}
                </div>
              </button>
              <button
                onClick={() => remove(p)}
                title="Delete"
                className="rounded-md p-1.5 text-neutral-500 opacity-0 transition hover:bg-neutral-800 hover:text-rose-400 group-hover:opacity-100"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
        {!projects.length && (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-800 py-16 text-center text-neutral-500">
            No projects yet. Click <b className="text-neutral-300">+ New project</b> to get started.
          </div>
        )}
      </div>

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [aspect, setAspect] = useState("VIDEO_ASPECT_RATIO_LANDSCAPE");
  const [style, setStyle] = useState("Realistic");
  const [scriptLang, setScriptLang] = useState("English");
  const [storytelling, setStorytelling] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pre-fill from global defaults (Settings §2.7A) so new projects inherit them.
  useEffect(() => {
    api.getSettings().then((g) => {
      if (g.aspect_ratio) setAspect(g.aspect_ratio);
      if (g.style) setStyle(g.style);
      if (g.script_lang) setScriptLang(g.script_lang);
      if (g.storytelling != null) setStorytelling(!!g.storytelling);
    }).catch(() => {});
  }, []);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.createProject({ title, aspect_ratio: aspect, style, storytelling,
        script_lang: scriptLang.trim() || "English" });
      onCreated();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">New project</h2>
        <label className="mb-1 block text-xs text-neutral-400">Project title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Example: The story of the magic tree"
          className="mb-4 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Frame ratio</label>
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              <option value="VIDEO_ASPECT_RATIO_LANDSCAPE">16:9 landscape</option>
              <option value="VIDEO_ASPECT_RATIO_PORTRAIT">9:16 portrait</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Style</label>
            <input
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="mb-1 block text-xs text-neutral-400">Script / narration language</label>
          <input
            value={scriptLang}
            onChange={(e) => setScriptLang(e.target.value)}
            placeholder="English"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <label className="mb-4 flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={storytelling}
            onChange={(e) => setStorytelling(e.target.checked)}
            className="h-4 w-4 accent-indigo-500"
          />
          Storytelling mode (guided narration)
        </label>
        {err && <div className="mb-3 text-sm text-rose-400">{err}</div>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !title.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
