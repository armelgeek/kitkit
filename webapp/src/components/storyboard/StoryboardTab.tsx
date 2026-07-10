import { useEffect, useRef, useState } from "react";
import {
  api,
  storyboard,
  storyboardExportUrl,
  type Entity,
  type Project,
  type Scene,
  type Shot,
} from "../../api/client";
import type { EditorTarget } from "../nodeeditor/NodeEditor";
import MediaCard from "../common/MediaCard";
import Lightbox from "../common/Lightbox";
import CandidatePicker from "../common/CandidatePicker";
import MediaHistory from "../common/MediaHistory";
import { useConfirm } from "../common/Confirm";
import { creditGuard, CREDIT_COST } from "../../lib/credits";
import { useJobs, useJobWatcher } from "../../jobs/JobsContext";

const slug = (s: string) =>
  (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "shot";

const pad3 = (n: number) => String(n + 1).padStart(3, "0");

// Trigger a browser download of a same-origin file with a chosen filename.
function downloadFile(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const parseRefs = (s: string | null): string[] => {
  try {
    return JSON.parse(s || "[]");
  } catch {
    return [];
  }
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function StoryboardTab({
  project,
  onEdit,
  onCoverSet,
}: {
  project: Project;
  onEdit?: (t: EditorTarget) => void;
  onCoverSet?: (mediaId: string) => void;
}) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [shotsByScene, setShotsByScene] = useState<Record<string, Shot[]>>({});
  const [sel, setSel] = useState<Shot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [gening, setGening] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<Shot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Shot | null>(null);
  const [history, setHistory] = useState<Shot | null>(null);
  const confirm = useConfirm();
  const { jobFor } = useJobs();
  // Scenes currently being rebuilt by a per-scene narration job (shots cleared optimistically).
  const [rebuilding, setRebuilding] = useState<Set<string>>(new Set());
  // Scenes currently having their camera angles re-varied (per-scene 🎬).
  const [revarying, setRevarying] = useState<Set<string>>(new Set());
  // Scenes whose audio is being re-synthesized (per-scene 🔊) — keeps images, re-times shots.
  const [rebuildingAudio, setRebuildingAudio] = useState<Set<string>>(new Set());
  // Narration preview playback (one scene at a time).
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const setAsCover = async (shot: Shot) => {
    if (!shot.image_media_id) return;
    setErr(null);
    try {
      await api.setCover(project.id, shot.image_media_id);
      onCoverSet?.(shot.image_media_id);
      setNotice(`Set "${shot.title}" as project cover image`);
      setTimeout(() => setNotice(null), 2500);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const loadShots = async (sid: string) => {
    const r = await storyboard.sceneShots(sid);
    setShotsByScene((m) => ({ ...m, [sid]: r.shots }));
  };

  useEffect(() => {
    (async () => {
      const sc = (await api.listScenes(project.id)).scenes;
      setScenes(sc);
      setEntities((await api.listEntities(project.id)).entities);
      for (const s of sc) await loadShots(s.id);
    })().catch((e) => setErr(e.message));
  }, [project.id]);

  const setShot = (updated: Shot) => {
    setShotsByScene((m) => ({
      ...m,
      [updated.scene_id]: (m[updated.scene_id] || []).map((x) =>
        x.id === updated.id ? updated : x
      ),
    }));
    if (sel?.id === updated.id) setSel(updated);
  };

  const genImage = async (shot: Shot): Promise<boolean> => {
    setGening((s) => new Set(s).add(shot.id));
    setErr(null);
    try {
      setShot(await storyboard.genImage(shot.id));
      return true;
    } catch (e: any) {
      setErr(e.message);
      return false;
    } finally {
      setGening((s) => {
        const n = new Set(s);
        n.delete(shot.id);
        return n;
      });
    }
  };

  const autofill = async (sid: string) => {
    setBusy("autofill:" + sid);
    setErr(null);
    try {
      const r = await storyboard.autofill(sid);
      setShotsByScene((m) => ({ ...m, [sid]: r.shots }));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const sceneAll = async (sid: string) => {
    const todo = (shotsByScene[sid] || []).filter((s) => !s.image_path);
    if (!todo.length) {
      setErr("Every frame in this scene already has images.");
      return;
    }
    if (!(await creditGuard(confirm, todo.length, CREDIT_COST.image, "Generate storyboard images"))) return;
    setErr(null);
    try {
      await storyboard.genSceneAll(sid);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  // Rebuild ONE scene by its narration (TTS) — the escape hatch when the project-wide
  // "Build from narration" misses a scene (so you don't fall back to a silent Autofill).
  const buildSceneBeats = async (sid: string) => {
    const ok = await confirm({
      title: "Rebuild this scene from narration?",
      message:
        "Read (TTS) this scene's own source content, measure duration, and cut beats that follow " +
        "the audio. This will DELETE the current shots in this scene.",
      confirmText: "Build from narration",
      danger: true,
    });
    if (!ok) return;
    setErr(null);
    // Optimistic: clear this scene's shots right away so the delete is visible, and mark
    // mark it as building; the background job streams state to the banner; the "beats" watcher
    // reloads shots + scene meta when it finishes.
    setShotsByScene((m) => ({ ...m, [sid]: [] }));
    setRebuilding((s) => new Set(s).add(sid));
    try {
      await storyboard.buildSceneBeats(sid);
    } catch (e: any) {
      setErr(e.message);
      setRebuilding((s) => {
        const n = new Set(s);
        n.delete(sid);
        return n;
      });
      await loadShots(sid); // restore on failure to start
    }
  };

  // Play / stop a scene's narration WAV.
  const toggleAudio = (sc: Scene) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playing === sc.id || !sc.narration_path) {
      setPlaying(null);
      return;
    }
    const a = new Audio(sc.narration_path);
    a.onended = () => setPlaying(null);
    a.onerror = () => {
      setPlaying(null);
      setErr("Could not play scene audio.");
    };
    void a.play();
    audioRef.current = a;
    setPlaying(sc.id);
  };

  // Play / stop ONE shot's slice of the scene WAV.
  // The scene WAV concatenates all beats; this shot starts at sh.start_time and runs
  // for sh.narration_duration (read + trailing gap), so we seek + stop at the boundary.
  const toggleShotAudio = (sc: Scene, sh: Shot) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playing === sh.id || !sc.narration_path) {
      setPlaying(null);
      return;
    }
    const start = sh.start_time || 0;
    const end = start + (sh.narration_duration || 0);
    const a = new Audio(sc.narration_path);
    const stop = () => {
      a.pause();
      if (audioRef.current === a) audioRef.current = null;
      setPlaying(null);
    };
    a.onloadedmetadata = () => {
      a.currentTime = start;
    };
    a.ontimeupdate = () => {
      if (end > start && a.currentTime >= end) stop();
    };
    a.onended = stop;
    a.onerror = () => {
      stop();
      setErr("Could not play shot audio.");
    };
    void a.play();
    audioRef.current = a;
    setPlaying(sh.id);
  };

  // Audio status of a scene: measured = real TTS WAV exists; else estimate from beats.
  const sceneAudio = (sc: Scene) => {
    const list = shotsByScene[sc.id] || [];
    const measured = !!sc.narration_path;
    const dur = sc.narration_duration ?? list.reduce((a, s) => a + (s.narration_duration || 0), 0);
    const hasNarr = measured || list.some((s) => s.narrator_text || s.narration_duration);
    return { measured, dur, hasNarr };
  };

  // Reorder (drag-and-drop / arrow buttons).
  const dragShot = useRef<{ sceneId: string; id: string } | null>(null);

  const moveScene = async (pos: number, dir: -1 | 1) => {
    const j = pos + dir;
    if (j < 0 || j >= scenes.length) return;
    const next = [...scenes];
    [next[pos], next[j]] = [next[j], next[pos]];
    const reindexed = next.map((s, i) => ({ ...s, idx: i }));
    setScenes(reindexed);
    try {
      await storyboard.reorderScenes(project.id, reindexed.map((s) => s.id));
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const dropShot = async (sceneId: string, targetId: string) => {
    const d = dragShot.current;
    dragShot.current = null;
    if (!d || d.sceneId !== sceneId || d.id === targetId) return;
    const list = shotsByScene[sceneId] || [];
    const from = list.findIndex((s) => s.id === d.id);
    const to = list.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const reindexed = next.map((s, i) => ({ ...s, idx: i }));
    setShotsByScene((m) => ({ ...m, [sceneId]: reindexed }));
    try {
      await storyboard.reorderShots(sceneId, reindexed.map((s) => s.id));
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const reloadAll = async () => {
    for (const s of scenes) await loadShots(s.id);
  };

  // Stop any narration playback when leaving the tab / switching project.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [project.id]);

  // Refetch frames as the server storyboard batch advances (§9) — images fill in live
  // and survive tab close / reload.
  const imgJob = jobFor("storyboard");
  useJobWatcher("storyboard", {
    onAdvance: reloadAll,
    onDone: (j) => {
      reloadAll();
      if (j.errors.length) setErr(`Auto gen images: ${j.done}/${j.total} done, ${j.errors.length} errors.`);
    },
  });

  // Storytelling "Build from narration" runs as a job too (TTS is slow). Reload shots scene
  // by scene as each is rebuilt, and announce the result.
  const beatsJob = jobFor("beats");
  // Refetch scenes too so narration badges (🎙 / ⏱) update after a beats run.
  const refreshScenes = async () => {
    try {
      setScenes((await api.listScenes(project.id)).scenes);
    } catch {
      /* keep current */
    }
  };
  useJobWatcher("beats", {
    onAdvance: reloadAll,
    onDone: (j) => {
      reloadAll();
      refreshScenes();
      setRebuilding(new Set());
      if (j.errors.length) {
        setErr(`Build narration: ${j.done}/${j.total} scenes done, ${j.errors.length} errors.`);
      } else {
        setNotice(`Built narration + beats for ${j.done}/${j.total} scene.`);
        setTimeout(() => setNotice(null), 6000);
      }
    },
  });

  // "Vary camera angles": rewrites shot descriptions only (keeps audio) → regen images after.
  const revaryJob = jobFor("revary");
  useJobWatcher("revary", {
    onAdvance: reloadAll,
    onDone: (j) => {
      reloadAll();
      setRevarying(new Set());
      if (j.errors.length) {
        setErr(`Vary camera angles: ${j.done}/${j.total} scenes done, ${j.errors.length} errors.`);
      } else {
        setNotice(`Changed camera angles for ${j.done}/${j.total} scene — click "Auto gen all" to redraw images.`);
        setTimeout(() => setNotice(null), 8000);
      }
    },
  });

  const revaryAll = async () => {
    setErr(null);
    try {
      await storyboard.revaryProject(project.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const revaryScene = async (sid: string) => {
    setErr(null);
    setRevarying((s) => new Set(s).add(sid));
    try {
      await storyboard.revaryScene(sid);
    } catch (e: any) {
      setErr(e.message);
      setRevarying((s) => {
        const n = new Set(s);
        n.delete(sid);
        return n;
      });
    }
  };

  // Re-synthesize ONLY this scene's audio from its existing shots' narration, then re-time the
  // shots + captions — keeps the (slow-to-make) images. Synchronous; no image re-gen.
  const rebuildAudio = async (sid: string) => {
    setErr(null);
    setRebuildingAudio((s) => new Set(s).add(sid));
    try {
      const r = await storyboard.rebuildSceneAudio(sid);
      setShotsByScene((m) => ({ ...m, [sid]: r.shots }));
      setScenes((list) =>
        list.map((s) =>
          s.id === sid
            ? { ...s, narration_path: r.narration_path, narration_duration: r.scene_duration }
            : s
        )
      );
      setNotice(`Regenerated audio (${Math.round(r.scene_duration)}s) — timing & captions updated`);
      setTimeout(() => setNotice(null), 3500);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setRebuildingAudio((s) => {
        const n = new Set(s);
        n.delete(sid);
        return n;
      });
    }
  };

  const autofillAll = async () => {
    setBusy("autofill-all");
    setErr(null);
    try {
      await storyboard.autofillAll(project.id);
      await reloadAll();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  // Storytelling (§2.6): TTS each scene as ONE continuous read first, then map beats.
  const buildBeats = async () => {
    const ok = await confirm({
      title: "Build shots from narration?",
      message:
        "Each scene is read once continuously by TTS to preserve emotion, then split into beats " +
        "(1 image) aligned to the audio timing; important keywords are timed to appear as text " +
        "on the video. Requires OmniVoice (TTS) to be enabled; otherwise duration is estimated from word count.\n\n" +
        "This will DELETE the current shots.",
      confirmText: "Build from narration",
      danger: true,
    });
    if (!ok) return;
    setErr(null);
    try {
      // Background job (§9): TTS is slow, so we kick it off and watch progress in the
      // banner instead of blocking. Shots rebuild scene-by-scene as it advances.
      await storyboard.buildBeats(project.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  // Re-align the source prose to scenes by CONTENT (fixes narration landing in the wrong
  // scene). Doesn't touch shots/audio — you rebuild "Build from narration" after.
  const alignSource = async () => {
    const ok = await confirm({
      title: "Realign content to the right scene?",
      message:
        "Use AI to assign each source-content segment to the scene whose context matches it (by " +
        "heading/location), instead of splitting evenly by length. Then run 'Build from narration' again.",
      confirmText: "Realign content",
    });
    if (!ok) return;
    setBusy("align");
    setErr(null);
    try {
      await storyboard.alignSource(project.id);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  // Split ONE over-long scene into ~90s sub-scenes (same location) so each gets its own
  // coherent shot plan. Clears the scene's shots — rebuild after with "Build from narration".
  const splitScene = async (sc: Scene) => {
    const ok = await confirm({
      title: "Split this long scene?",
      message:
        "Split the scene into multiple short scenes (~90s) BY DURATION, KEEPING the same location. " +
        "The current scene shots will be deleted - afterward click 'Build from narration' to rebuild again. " +
        "Use when a whole chapter was merged into one scene / very long shot.",
      confirmText: "Split scene",
      danger: true,
    });
    if (!ok) return;
    setBusy("split:" + sc.id);
    setErr(null);
    try {
      const r = await storyboard.splitScene(sc.id);
      await reloadAll();
      setNotice(`Split into ${r.split_into} scenes (same location) — please 'Build from narration' again.`);
      setTimeout(() => setNotice(null), 4000);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  // Rebuild the shot list for EVERY scene from the script (force) — deletes existing
  // shots (incl. manual edits) and re-splits via AI. Confirm because it's destructive.
  const rebuildAll = async () => {
    const ok = await confirm({
      title: "Rebuild all shots from the script?",
      message:
        "This DELETES the current shots (including manually edited prompts/images) and lets AI split them again from the script.",
      confirmText: "Rebuild all",
      danger: true,
    });
    if (!ok) return;
    setBusy("rebuild-all");
    setErr(null);
    try {
      const r = await storyboard.autofillAll(project.id, undefined, true);
      await reloadAll();
      setNotice(`Rebuilt shots for ${r.done}/${r.requested} scene`);
      setTimeout(() => setNotice(null), 3000);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  // Server-side background job (§9): generate every frame without an image.
  const projectAll = async () => {
    const todo = scenes.flatMap((sc) => (shotsByScene[sc.id] || []).filter((s) => !s.image_path));
    if (!todo.length) {
      setErr("Every frame already has images.");
      return;
    }
    if (!(await creditGuard(confirm, todo.length, CREDIT_COST.image, "Generate storyboard images"))) return;
    setErr(null);
    try {
      await storyboard.genProjectAll(project.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-auto px-6 py-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Storyboard</h2>
            <p className="text-sm text-neutral-500">Frame images by scene</p>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!!busy || !scenes.length}
              onClick={autofillAll}
              title="Autofill scenes that DO NOT have shots yet (skip scenes that already do)"
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40"
            >
              {busy === "autofill-all" ? "Autofilling..." : "✨ Autofill all"}
            </button>
            <button
              disabled={!!busy || !scenes.length}
              onClick={rebuildAll}
              title="Rebuild shots from the script for EVERY scene (deletes old shots)"
              className="rounded-lg border border-amber-700/60 px-3 py-2 text-sm text-amber-300 hover:bg-amber-950/40 disabled:opacity-40"
            >
              {busy === "rebuild-all" ? "Rebuilding..." : "↻ Rebuild all"}
            </button>
            {!!project.storytelling && (
              <>
                <button
                  disabled={!!busy || !!beatsJob || !scenes.length}
                  onClick={alignSource}
                  title="Align source content to the correct scene by context (fixes content drift between scenes). Then rebuild from narration."
                  className="rounded-lg border border-sky-700/60 px-3 py-2 text-sm text-sky-300 hover:bg-sky-950/40 disabled:opacity-40"
                >
                  {busy === "align" ? "Aligning content..." : "🧭 Align scene content"}
                </button>
                <button
                  disabled={!!busy || !!beatsJob || !scenes.length}
                  onClick={buildBeats}
                  title="Storytelling: build shots by narration duration (audio-driven beats)"
                  className="rounded-lg border border-violet-700/60 px-3 py-2 text-sm text-violet-300 hover:bg-violet-950/40 disabled:opacity-40"
                >
                  {beatsJob ? `Building beat ${beatsJob.done}/${beatsJob.total}…` : "🎙 Build from narration"}
                </button>
              </>
            )}
            <button
              disabled={!!busy || !!revaryJob || !scenes.length}
              onClick={revaryAll}
              title="Vary camera angles for every shot (keep narration & duration - does NOT rerun TTS). Then click Auto gen all to redraw images."
              className="rounded-lg border border-teal-700/60 px-3 py-2 text-sm text-teal-300 hover:bg-teal-950/40 disabled:opacity-40"
            >
              {revaryJob ? `Changing angles ${revaryJob.done}/${revaryJob.total}…` : "🎬 Vary camera angles"}
            </button>
            <button
              onClick={() => downloadFile(storyboardExportUrl(project.id), "storyboard.zip")}
              title="Download all storyboard images (.zip, scXXX-sXXX-description.png)"
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800"
            >
              ⬇ Export images
            </button>
            <button
              disabled={!!busy || !!imgJob || !scenes.length}
              onClick={projectAll}
              title="Generate images for every frame still missing one in the project"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {imgJob ? `Generating ${imgJob.done}/${imgJob.total}…` : "✦ Auto gen all"}
            </button>
          </div>
        </div>
        {progress && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-800 bg-indigo-950/40 px-3 py-2 text-sm text-indigo-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
            {progress}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
            ★ {notice}
          </div>
        )}
        {err && (
          <div className="mb-4 rounded-lg border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
            {err}
          </div>
        )}
        {!scenes.length && (
          <div className="rounded-xl border border-dashed border-neutral-800 py-12 text-center text-sm text-neutral-500">
            No scenes yet - create a script in the Script tab first.
          </div>
        )}
        {scenes.map((sc, scenePos) => {
          const shots = shotsByScene[sc.id] || [];
          return (
            <section key={sc.id} className="mb-8">
              <div className="mb-3 flex items-center gap-3">
                <h3 className="text-sm font-medium text-neutral-200">
                  <span className="mr-1.5 text-neutral-500">{String(scenePos + 1).padStart(2, "0")}</span>
                  {sc.heading}
                </h3>
                {(() => {
                  const a = sceneAudio(sc);
                  if (!a.hasNarr) return null;
                  return a.measured ? (
                    <span
                      title="Scene has real narration audio (TTS) - duration measured from the voice"
                      className="rounded bg-emerald-900/50 px-1.5 py-0.5 text-[11px] text-emerald-300"
                    >
                      🎙 {Math.round(a.dur)}s
                    </span>
                  ) : (
                    <span
                      title="No TTS audio yet - duration is ESTIMATED from word count. Click Narration to create real audio."
                      className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[11px] text-amber-300"
                    >
                      ⏱ ~{Math.round(a.dur)}s
                    </span>
                  );
                })()}
                {sc.narration_path && (
                  <button
                    onClick={() => toggleAudio(sc)}
                    title="Preview scene narration"
                    className="grid h-6 w-6 place-items-center rounded text-emerald-300 hover:bg-emerald-950/40"
                  >
                    {playing === sc.id ? "⏸" : "▶"}
                  </button>
                )}
                <div className="flex items-center">
                  <button
                    disabled={scenePos === 0 || !!busy}
                    onClick={() => moveScene(scenePos, -1)}
                    title="Move scene up"
                    className="grid h-6 w-6 place-items-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    disabled={scenePos === scenes.length - 1 || !!busy}
                    onClick={() => moveScene(scenePos, 1)}
                    title="Move scene down"
                    className="grid h-6 w-6 place-items-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    disabled={!!busy}
                    onClick={() => splitScene(sc)}
                    title="Split this long scene into multiple ~90s scenes (KEEP location) when a whole chapter was merged into one scene / very long shot. Deletes current shots; rebuild afterward."
                    className="rounded-md border border-amber-700/60 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-950/40 disabled:opacity-40"
                  >
                    {busy === "split:" + sc.id ? "Splitting..." : "✂ Split scene"}
                  </button>
                  <button
                    disabled={!!busy}
                    onClick={() => autofill(sc.id)}
                    className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800 disabled:opacity-40"
                  >
                    {busy === "autofill:" + sc.id ? "…" : "✨ Autofill"}
                  </button>
                  {!!project.storytelling && (
                    <button
                      disabled={!!busy || !!beatsJob}
                      onClick={() => buildSceneBeats(sc.id)}
                      title="Rebuild ONLY this scene from narration (TTS) - use when a scene was skipped / has no audio"
                      className="rounded-md border border-violet-700/60 px-2.5 py-1 text-xs text-violet-300 hover:bg-violet-950/40 disabled:opacity-40"
                    >
                      {rebuilding.has(sc.id) ? "Building..." : "🎙 Narration"}
                    </button>
                  )}
                  {!!project.storytelling && !!shots.length && (
                    <button
                      disabled={!!busy || !!beatsJob || rebuildingAudio.has(sc.id)}
                      onClick={() => rebuildAudio(sc.id)}
                      title="Regenerate audio for this scene from existing shot narration (KEEP generated images), then update timing & captions. Use after changing speed/pauses/padding without redrawing images."
                      className="rounded-md border border-sky-700/60 px-2.5 py-1 text-xs text-sky-300 hover:bg-sky-950/40 disabled:opacity-40"
                    >
                      {rebuildingAudio.has(sc.id) ? "Generating audio…" : "🔊 Regenerate audio"}
                    </button>
                  )}
                  <button
                    disabled={!!busy || !!revaryJob || !shots.length}
                    onClick={() => revaryScene(sc.id)}
                    title="Vary camera angles for this scene's shots (keep narration - does not rerun TTS). Then click Auto gen to redraw images."
                    className="rounded-md border border-teal-700/60 px-2.5 py-1 text-xs text-teal-300 hover:bg-teal-950/40 disabled:opacity-40"
                  >
                    {revarying.has(sc.id) ? "Changing angles…" : "🎬 Angles"}
                  </button>
                  <button
                    disabled={!!busy || !!imgJob || !shots.length}
                    onClick={() => sceneAll(sc.id)}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                  >
                    {imgJob ? "…" : "✦ Auto gen"}
                  </button>
                </div>
              </div>
              {rebuilding.has(sc.id) && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-violet-800/60 bg-violet-950/30 px-3 py-2 text-sm text-violet-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                  🎙 Reading (TTS) & building beats for this scene... (see progress at bottom right)
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {shots.map((sh) => (
                  <div
                    key={sh.id}
                    className="relative"
                    draggable
                    onDragStart={() => (dragShot.current = { sceneId: sc.id, id: sh.id })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropShot(sc.id, sh.id);
                    }}
                    title="Drag to reorder shot"
                  >
                  {(sh.narrator_text || sh.narration_duration != null) &&
                    (sc.narration_path ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleShotAudio(sc, sh);
                        }}
                        title={
                          (sh.narrator_text ? `Narration: "${sh.narrator_text}"\n` : "") +
                          `Preview this shot (${(sh.narration_duration || 0).toFixed(1)}s)`
                        }
                        className={`absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded px-1 py-0.5 text-[10px] transition-colors ${
                          playing === sh.id
                            ? "bg-rose-600/90 text-white"
                            : "bg-emerald-600/85 text-white hover:bg-emerald-500"
                        }`}
                      >
                        {playing === sh.id ? "⏸" : "▶"} {(sh.narration_duration || 0).toFixed(1)}s
                      </button>
                    ) : (
                      <span
                        title={
                          (sh.narrator_text ? `Narration: "${sh.narrator_text}"\n` : "") +
                          `Estimated ${(sh.narration_duration || 0).toFixed(1)}s — no real audio yet`
                        }
                        className="absolute left-1.5 top-1.5 z-10 rounded bg-amber-600/80 px-1 py-0.5 text-[10px] text-white"
                      >
                        ⏱ {(sh.narration_duration || 0).toFixed(1)}s
                      </span>
                    ))}
                  <MediaCard
                    imageSrc={sh.image_path}
                    title={sh.title}
                    index={sh.idx}
                    subtitle={sh.description}
                    selected={sel?.id === sh.id}
                    busy={gening.has(sh.id)}
                    busyLabel="Generating images…"
                    onClick={() => setSel(sh)}
                    onPreview={sh.image_path ? () => setLightbox(sh) : undefined}
                    onEdit={
                      onEdit
                        ? () =>
                            onEdit({
                              kind: "shot",
                              goal: "image",
                              id: sh.id,
                              title: sh.title,
                              prompt: sh.description || sh.visual_prompt || sh.title,
                              refEntityIds: parseRefs(sh.ref_entity_ids),
                              imageMediaId: sh.image_media_id,
                              imageSrc: sh.image_path,
                              videoSrc: sh.video_path,
                            })
                        : undefined
                    }
                    actions={
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            genImage(sh);
                          }}
                          title="Quick gen"
                          className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900/80 text-sm hover:bg-indigo-600"
                        >
                          ⚡
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCandidate(sh);
                          }}
                          title="Generate several variants and choose the best image"
                          className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900/80 text-sm hover:bg-indigo-600"
                        >
                          🎲
                        </button>
                        {sh.image_path && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setHistory(sh);
                            }}
                            title="Version history - restore an older version"
                            className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900/80 text-sm hover:bg-neutral-700"
                          >
                            🕘
                          </button>
                        )}
                        {sh.image_path && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadFile(
                                sh.image_path!,
                                `sc${pad3(sc.idx)}-s${pad3(sh.idx)}-${slug(sh.description || sh.title)}.png`
                              );
                            }}
                            title="Download this image"
                            className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900/80 text-sm hover:bg-emerald-600"
                          >
                            ⬇
                          </button>
                        )}
                        {sh.image_media_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAsCover(sh);
                            }}
                            title="Set as project cover image"
                            className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900/80 text-sm hover:bg-amber-600"
                          >
                            ★
                          </button>
                        )}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await storyboard.deleteShot(sh.id);
                            loadShots(sc.id);
                          }}
                          title="Delete"
                          className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900/80 text-sm hover:bg-rose-600"
                        >
                          🗑
                        </button>
                      </>
                    }
                  />
                  </div>
                ))}
                <button
                  onClick={async () => {
                    await storyboard.addShot(sc.id);
                    loadShots(sc.id);
                  }}
                  className="aspect-video rounded-xl border border-dashed border-neutral-700 text-2xl text-neutral-600 hover:border-neutral-500 hover:text-neutral-400"
                >
                  +
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {sel && (
        <FramePanel
          shot={sel}
          entities={entities}
          onClose={() => setSel(null)}
          onChange={setShot}
          onGenerate={() => genImage(sel)}
          onCover={() => setAsCover(sel)}
          generating={gening.has(sel.id)}
        />
      )}

      {lightbox && (
        <Lightbox imageSrc={lightbox.image_path} title={lightbox.title} onClose={() => setLightbox(null)} />
      )}

      {candidate && (
        <CandidatePicker
          kind="shot"
          id={candidate.id}
          title={candidate.title}
          onApplied={(updated) =>
            setShotsByScene((m) => ({
              ...m,
              [updated.scene_id]: (m[updated.scene_id] || []).map((x) =>
                x.id === updated.id ? updated : x
              ),
            }))
          }
          onClose={() => setCandidate(null)}
        />
      )}

      {history && (
        <MediaHistory
          kind="shot"
          id={history.id}
          slot="image"
          title={history.title}
          onRestored={(updated) =>
            setShotsByScene((m) => ({
              ...m,
              [updated.scene_id]: (m[updated.scene_id] || []).map((x) =>
                x.id === updated.id ? updated : x
              ),
            }))
          }
          onClose={() => setHistory(null)}
        />
      )}
    </div>
  );
}

function FramePanel({
  shot,
  entities,
  onClose,
  onChange,
  onGenerate,
  onCover,
  generating,
}: {
  shot: Shot;
  entities: Entity[];
  onClose: () => void;
  onChange: (s: Shot) => void;
  onGenerate: () => void;
  onCover: () => void;
  generating: boolean;
}) {
  const [title, setTitle] = useState(shot.title);
  const [desc, setDesc] = useState(shot.description ?? "");
  const refIds: string[] = (() => {
    try {
      return JSON.parse(shot.ref_entity_ids || "[]");
    } catch {
      return [];
    }
  })();
  const [refs, setRefs] = useState<string[]>(refIds);

  useEffect(() => {
    setTitle(shot.title);
    setDesc(shot.description ?? "");
    try {
      setRefs(JSON.parse(shot.ref_entity_ids || "[]"));
    } catch {
      setRefs([]);
    }
  }, [shot.id]);

  const save = async () => {
    onChange(
      await storyboard.updateShot(shot.id, { title, description: desc, ref_entity_ids: refs })
    );
  };

  const toggleRef = (id: string) =>
    setRefs((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950/50">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
        <span className="text-sm font-medium">Frame</span>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">✕</button>
      </div>
      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={save}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Description (use {"{Name}"} to attach a ref)</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={save}
            className="h-28 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-neutral-400">Reference Assets (≤10)</label>
          <div className="space-y-1">
            {entities.map((e) => (
              <label
                key={e.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-neutral-800"
              >
                <input
                  type="checkbox"
                  checked={refs.includes(e.id)}
                  onChange={() => toggleRef(e.id)}
                  onBlur={save}
                  className="h-3.5 w-3.5 accent-indigo-500"
                />
                <span className={`h-1.5 w-1.5 rounded-full ${e.media_id ? "bg-emerald-400" : "bg-neutral-600"}`} />
                <span className="truncate text-neutral-300">{e.name}</span>
                <span className="ml-auto text-xs text-neutral-600">{e.type}</span>
              </label>
            ))}
            {!entities.length && <p className="text-xs text-neutral-600">No asset.</p>}
          </div>
        </div>
      </div>
      <div className="space-y-2 border-t border-neutral-800 p-3">
        <button
          onClick={async () => {
            await save();
            onGenerate();
          }}
          disabled={generating}
          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {generating ? "Generating images…" : "Create image"}
        </button>
        <button
          onClick={onCover}
          disabled={!shot.image_media_id}
          title={shot.image_media_id ? "" : "Generate the frame image first"}
          className="w-full rounded-lg border border-amber-700/60 py-2 text-sm text-amber-300 hover:bg-amber-950/40 disabled:opacity-40"
        >
          ★ Set as project cover image
        </button>
      </div>
    </aside>
  );
}
