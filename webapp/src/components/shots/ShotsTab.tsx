import { useEffect, useState } from "react";
import { api, storyboard, shots as shotsApi, type Project, type Scene, type Shot } from "../../api/client";
import MediaCard from "../common/MediaCard";
import Lightbox from "../common/Lightbox";

export default function ShotsTab({
  project,
  onEdit,
}: {
  project: Project;
  onEdit?: (t: { kind: "shot"; id: string; title: string }) => void;
}) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [byScene, setByScene] = useState<Record<string, Shot[]>>({});
  const [sel, setSel] = useState<Shot | null>(null);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<Shot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadShots = async (sid: string) => {
    const r = await storyboard.sceneShots(sid);
    setByScene((m) => ({ ...m, [sid]: r.shots }));
  };

  useEffect(() => {
    (async () => {
      const sc = (await api.listScenes(project.id)).scenes;
      setScenes(sc);
      for (const s of sc) await loadShots(s.id);
    })().catch((e) => setErr(e.message));
  }, [project.id]);

  const setShot = (u: Shot) => {
    setByScene((m) => ({
      ...m,
      [u.scene_id]: (m[u.scene_id] || []).map((x) => (x.id === u.id ? u : x)),
    }));
    if (sel?.id === u.id) setSel(u);
  };

  const mark = (id: string, on: boolean) =>
    setRunning((s) => {
      const n = new Set(s);
      on ? n.add(id) : n.delete(id);
      return n;
    });

  const genVideo = async (shot: Shot) => {
    if (!shot.image_path) {
      setErr("Shot chưa có ảnh frame — tạo ở Storyboard trước");
      return;
    }
    mark(shot.id, true);
    setErr(null);
    try {
      setShot(await shotsApi.genVideo(shot.id));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      mark(shot.id, false);
    }
  };

  const genAll = async () => {
    setBusy(true);
    setErr(null);
    try {
      await shotsApi.genAllVideos(project.id);
      for (const s of scenes) await loadShots(s.id);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-auto px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Cinematic Shots</h2>
            <p className="text-sm text-neutral-500">Render video từ ảnh storyboard</p>
          </div>
          <button
            disabled={busy}
            onClick={genAll}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy ? "Đang render…" : "✦ Auto gen video"}
          </button>
        </div>
        {err && (
          <div className="mb-4 rounded-lg border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
            {err}
          </div>
        )}
        {scenes.map((sc) => {
          const list = byScene[sc.id] || [];
          return (
            <section key={sc.id} className="mb-8">
              <h3 className="mb-3 text-sm font-medium text-neutral-200">
                <span className="mr-1.5 text-neutral-500">{String(sc.idx + 1).padStart(2, "0")}</span>
                {sc.heading}
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {list.map((sh) => (
                  <MediaCard
                    key={sh.id}
                    imageSrc={sh.image_path}
                    videoSrc={sh.video_path}
                    title={sh.title}
                    index={sh.idx}
                    subtitle={sh.video_path ? "▶ video" : sh.status}
                    selected={sel?.id === sh.id}
                    busy={running.has(sh.id)}
                    busyLabel="Đang render…"
                    onClick={() => setSel(sh)}
                    onPreview={sh.video_path || sh.image_path ? () => setLightbox(sh) : undefined}
                    onEdit={onEdit ? () => onEdit({ kind: "shot", id: sh.id, title: sh.title }) : undefined}
                    actions={
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          genVideo(sh);
                        }}
                        title="Render video"
                        className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900/80 text-sm hover:bg-indigo-600"
                      >
                        ⚡
                      </button>
                    }
                  />
                ))}
                {!list.length && (
                  <div className="col-span-full rounded-xl border border-dashed border-neutral-800 py-6 text-center text-xs text-neutral-600">
                    Chưa có frame — làm Storyboard trước.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {sel && (
        <ShotPanel
          shot={sel}
          project={project}
          running={running.has(sel.id)}
          onClose={() => setSel(null)}
          onChange={setShot}
          onGenVideo={() => genVideo(sel)}
        />
      )}
      {lightbox && (
        <Lightbox
          imageSrc={lightbox.image_path}
          videoSrc={lightbox.video_path}
          title={lightbox.title}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function ShotPanel({
  shot,
  project,
  running,
  onClose,
  onChange,
  onGenVideo,
}: {
  shot: Shot;
  project: Project;
  running: boolean;
  onClose: () => void;
  onChange: (s: Shot) => void;
  onGenVideo: () => void;
}) {
  const [visual, setVisual] = useState(shot.visual_prompt ?? "");
  const [motion, setMotion] = useState(shot.motion_prompt ?? "");
  const [aiBusy, setAiBusy] = useState(false);
  const [upBusy, setUpBusy] = useState(false);

  useEffect(() => {
    setVisual(shot.visual_prompt ?? "");
    setMotion(shot.motion_prompt ?? "");
  }, [shot.id]);

  const save = async () =>
    onChange(await storyboard.updateShot(shot.id, { visual_prompt: visual, motion_prompt: motion }));

  const aiPrompts = async () => {
    setAiBusy(true);
    try {
      onChange(await shotsApi.genPrompts(shot.id));
    } finally {
      setAiBusy(false);
    }
  };

  const upscale = async () => {
    setUpBusy(true);
    try {
      onChange(await shotsApi.upscale(shot.id));
    } finally {
      setUpBusy(false);
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950/50">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
        <span className="truncate text-sm font-medium">{shot.title}</span>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">✕</button>
      </div>
      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className="overflow-hidden rounded-lg border border-neutral-800 bg-black">
          {shot.video_path ? (
            <video src={shot.video_path} controls className="aspect-video w-full" />
          ) : shot.image_path ? (
            <img src={shot.image_path} className="aspect-video w-full object-cover" />
          ) : (
            <div className="grid aspect-video w-full place-items-center text-xs text-neutral-600">
              chưa có ảnh
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span>Model: {project.video_model || "Veo i2v"}</span>
          <span>{shot.duration}s</span>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-neutral-400">Visual / Motion prompt</label>
            <button
              onClick={aiPrompts}
              disabled={aiBusy}
              className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40"
            >
              {aiBusy ? "…" : "✨ AI"}
            </button>
          </div>
          <textarea
            value={visual}
            onChange={(e) => setVisual(e.target.value)}
            onBlur={save}
            placeholder="Visual prompt"
            className="mb-2 h-20 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          <textarea
            value={motion}
            onChange={(e) => setMotion(e.target.value)}
            onBlur={save}
            placeholder="Motion prompt"
            className="h-20 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
        </div>
      </div>
      <div className="space-y-2 border-t border-neutral-800 p-3">
        <button
          onClick={onGenVideo}
          disabled={running || !shot.image_path}
          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {running ? "Đang render…" : "Generate Video"}
        </button>
        {shot.video_path && (
          <button
            onClick={upscale}
            disabled={upBusy}
            className="w-full rounded-lg border border-neutral-700 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40"
          >
            {upBusy ? "Đang upscale…" : "Upscale 4K"}
          </button>
        )}
      </div>
    </aside>
  );
}
