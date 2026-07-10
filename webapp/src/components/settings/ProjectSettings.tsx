import { useEffect, useRef, useState } from "react";
import {
  api,
  listVoices,
  synthesize,
  base64ToAudioUrl,
  projectExportUrl,
  type Project,
  type SettingsPreset,
  type Voice,
} from "../../api/client";

// Per-project settings: prompt header/footer (always prepended/appended to every
// image & video prompt), culture hint, style, and the image model.
export default function ProjectSettings({
  project,
  onClose,
  onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const [opts, setOpts] = useState<any>(null);
  const [s, setS] = useState({
    style: project.style ?? "",
    script_lang: project.script_lang ?? "English",
    image_text_lang: project.image_text_lang ?? "English",
    culture_hint: project.culture_hint ?? "",
    prompt_header: project.prompt_header ?? "",
    prompt_footer: project.prompt_footer ?? "",
    image_model: project.image_model ?? "",
    aspect_ratio: project.aspect_ratio ?? "VIDEO_ASPECT_RATIO_LANDSCAPE",
    video_model: project.video_model ?? "",
  });
  const [shotDuration, setShotDuration] = useState<number>(project.shot_duration ?? 8);
  const [storytelling, setStorytelling] = useState<boolean>(!!project.storytelling);
  const [seed, setSeed] = useState<number>(project.seed ?? 0);
  const [bgmPath, setBgmPath] = useState(project.bgm_path ?? null);
  const [bgmVol, setBgmVol] = useState(project.bgm_volume ?? 0.18);
  const [bgmDuck, setBgmDuck] = useState<boolean>(project.bgm_duck == null ? true : !!project.bgm_duck);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState<string>(String(project.voice_id ?? "21m00Tcm4TlvDq8ikWAM"));
  const [ttsSpeed, setTtsSpeed] = useState<number>(project.tts_speed ?? 1.0);
  const [ttsGap, setTtsGap] = useState<number>(project.tts_gap ?? 0.4);
  const [ttsSentenceGap, setTtsSentenceGap] = useState<number>(project.tts_sentence_gap ?? 0.3);
  const [ttsEdgePad, setTtsEdgePad] = useState<number>(project.tts_edge_pad ?? 0.5);
  const [testing, setTesting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [presets, setPresets] = useState<SettingsPreset[]>([]);
  const [presetSel, setPresetSel] = useState("");

  useEffect(() => {
    api.options().then(setOpts).catch(() => {});
    listVoices().then(setVoices).catch(() => {});
    api.listSettingsPresets().then((r) => setPresets(r.presets)).catch(() => {});
  }, []);

  const testVoice = async () => {
    setTesting(true);
    setErr(null);
    try {
      const r = await synthesize("Hello, this is the project narration voice.", voiceId, ttsSpeed);
      if (r.audio && audioRef.current) {
        audioRef.current.src = base64ToAudioUrl(r.audio);
        await audioRef.current.play().catch(() => {});
      } else setErr("TTS returned no audio (check the OmniVoice URL in Settings).");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setTesting(false);
    }
  };

  const set = (k: keyof typeof s, v: string) => setS((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const updated = await api.updateProject(project.id, {
        ...s,
        bgm_volume: bgmVol,
        bgm_duck: bgmDuck,
        voice_id: voiceId,
        shot_duration: shotDuration,
        storytelling,
        tts_speed: ttsSpeed,
        tts_gap: ttsGap,
        tts_sentence_gap: ttsSentenceGap,
        tts_edge_pad: ttsEdgePad,
        seed,
      });
      onSaved(updated);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onPickBgm = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await api.uploadBgm(project.id, file, bgmVol);
      setBgmPath(updated.bgm_path ?? null);
      onSaved(updated);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeBgm = async () => {
    setBusy(true);
    setErr(null);
    try {
      const updated = await api.clearBgm(project.id);
      setBgmPath(null);
      onSaved(updated);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Export / import REUSABLE settings (not project content) so the same setup can be
  // applied to other projects without redoing it by hand. BGM file isn't included (it's media).
  const STR_KEYS = ["style", "script_lang", "image_text_lang", "culture_hint",
    "prompt_header", "prompt_footer", "image_model", "aspect_ratio", "video_model"] as const;
  const NUM_KEYS = ["shot_duration", "seed", "bgm_volume", "voice_id",
    "tts_speed", "tts_gap", "tts_sentence_gap", "tts_edge_pad"] as const;
  const BOOL_KEYS = ["storytelling", "bgm_duck"] as const;

  const collectSettings = () => ({
    ...s, shot_duration: shotDuration, storytelling, seed, bgm_volume: bgmVol, bgm_duck: bgmDuck,
    voice_id: voiceId, tts_speed: ttsSpeed, tts_gap: ttsGap, tts_sentence_gap: ttsSentenceGap,
    tts_edge_pad: ttsEdgePad,
  });

  // Apply a settings object (from a file OR a saved preset) to this project immediately,
  // type-guarding each field, then reflect the persisted values back into the form.
  const applySettings = async (obj: any, label = "settings") => {
    if (!obj || typeof obj !== "object") { setErr("Invalid settings data"); return; }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const fields: any = {};
      for (const k of STR_KEYS) if (typeof obj[k] === "string") fields[k] = obj[k];
      for (const k of NUM_KEYS) if (typeof obj[k] === "number") fields[k] = obj[k];
      for (const k of BOOL_KEYS) if (typeof obj[k] === "boolean") fields[k] = obj[k];
      if (!Object.keys(fields).length) throw new Error("No valid settings found");
      const u = await api.updateProject(project.id, fields);
      setS((p) => ({
        style: u.style ?? p.style, script_lang: u.script_lang ?? p.script_lang,
        image_text_lang: u.image_text_lang ?? p.image_text_lang, culture_hint: u.culture_hint ?? p.culture_hint,
        prompt_header: u.prompt_header ?? p.prompt_header, prompt_footer: u.prompt_footer ?? p.prompt_footer,
        image_model: u.image_model ?? p.image_model, aspect_ratio: u.aspect_ratio ?? p.aspect_ratio,
        video_model: u.video_model ?? p.video_model,
      }));
      if (u.shot_duration != null) setShotDuration(u.shot_duration);
      if (u.storytelling != null) setStorytelling(!!u.storytelling);
      if (u.seed != null) setSeed(u.seed);
      if (u.bgm_volume != null) setBgmVol(u.bgm_volume);
      if (u.bgm_duck != null) setBgmDuck(!!u.bgm_duck);
      if (u.voice_id != null) setVoiceId(String(u.voice_id));
      if (u.tts_speed != null) setTtsSpeed(u.tts_speed);
      if (u.tts_gap != null) setTtsGap(u.tts_gap);
      if (u.tts_sentence_gap != null) setTtsSentenceGap(u.tts_sentence_gap);
      if (u.tts_edge_pad != null) setTtsEdgePad(u.tts_edge_pad);
      onSaved(u);
      setMsg(`Applied ${Object.keys(fields).length} ${label}.`);
    } catch (e: any) {
      setErr("Failed to apply settings: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const exportSettings = () => {
    const payload = { _type: "flowkit-project-settings", version: 1, ...collectSettings() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowkit-settings-${(project.title || "project").replace(/[^\w-]+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = async (file: File | undefined) => {
    if (!file) return;
    try {
      await applySettings(JSON.parse(await file.text()), "settings from file");
    } catch {
      setErr("Invalid JSON file");
    }
  };

  // ── In-app presets (server-side, like the node-graph presets) ──
  const saveAsPreset = async () => {
    const name = window.prompt("Name preset settings:");
    if (!name?.trim()) return;
    try {
      const r = await api.saveSettingsPreset(name.trim(), collectSettings());
      setPresets(r.presets);
      setMsg(`Saved preset "${name.trim()}".`);
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const deletePreset = async (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p || !window.confirm(`Delete preset "${p.name}"?`)) return;
    try {
      const r = await api.deleteSettingsPreset(id);
      setPresets(r.presets);
      setPresetSel("");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const bgmName = bgmPath ? bgmPath.replace(/\\/g, "/").split("/").pop() : null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-[440px] flex-col bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h2 className="font-semibold">⚙ Project settings</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">✕</button>
        </div>

        <div className="flex-1 space-y-5 overflow-auto p-5">
          {err && <div className="rounded-lg bg-rose-950/40 px-3 py-2 text-sm text-rose-300">{err}</div>}
          {msg && <div className="rounded-lg bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">{msg}</div>}

          <Field label="Style (always prepended to each prompt)">
            <input value={s.style} onChange={(e) => set("style", e.target.value)}
              placeholder="e.g. chibi ghibli, watercolor" className={inp} />
          </Field>

          <Field label="Script / dialogue / narration language">
            <input value={s.script_lang} onChange={(e) => set("script_lang", e.target.value)}
              placeholder="English" className={inp} />
            <p className="mt-1 text-xs text-neutral-600">
              Script, dialogue, narration (voiceover), and SEO will be written in this language (default
              English). Applies to future script generation/edits.
            </p>
          </Field>

          <Field label="Language for text shown in generated images">
            <input value={s.image_text_lang} onChange={(e) => set("image_text_lang", e.target.value)}
              placeholder="English" className={inp} />
            <p className="mt-1 text-xs text-neutral-600">
              All text/signs/labels visible in images will use this language (default English). Language-specific
              terms from other languages (e.g. English terms/brands) are preserved.
            </p>
          </Field>

          <Field label="Culture hint (auto-detected from script - visual culture)">
            <textarea value={s.culture_hint} onChange={(e) => set("culture_hint", e.target.value)}
              placeholder="e.g. Vietnamese folk tale, traditional architecture, ceremonial dress..."
              className={`${inp} h-20 resize-none`} />
            <p className="mt-1 text-xs text-neutral-600">
              Keep imagery faithful to the story origin (Vietnamese stories look Vietnamese, Japanese stories look Japanese, etc.).
            </p>
          </Field>

          <Field label="Prompt header (inserted at the START of every image/video prompt)">
            <textarea value={s.prompt_header} onChange={(e) => set("prompt_header", e.target.value)}
              placeholder="e.g. always output in English" className={`${inp} h-16 resize-none`} />
          </Field>

          <Field label="Prompt footer (inserted at the END of every image/video prompt)">
            <textarea value={s.prompt_footer} onChange={(e) => set("prompt_footer", e.target.value)}
              placeholder="e.g.: super detailed, aspect ratio 16:9, cinematic lighting, 8k, sharp focus"
              className={`${inp} h-16 resize-none`} />
          </Field>

          <Field label="Image model">
            <select value={s.image_model} onChange={(e) => set("image_model", e.target.value)} className={inp}>
              <option value="">(default)</option>
              {(opts?.image_models || []).map((m: string) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Aspect ratio">
              <select value={s.aspect_ratio} onChange={(e) => set("aspect_ratio", e.target.value)} className={inp}>
                <option value="VIDEO_ASPECT_RATIO_LANDSCAPE">16:9 landscape</option>
                <option value="VIDEO_ASPECT_RATIO_PORTRAIT">9:16 portrait</option>
              </select>
            </Field>
            <Field label="Shot length (seconds)">
              <input type="number" min={1} max={10} value={shotDuration}
                onChange={(e) => setShotDuration(Math.min(10, Math.max(1, Number(e.target.value) || 8)))}
                className={inp} />
            </Field>
          </div>

          <Field label="Video model">
            <select value={s.video_model} onChange={(e) => set("video_model", e.target.value)} className={inp}>
              <option value="">(default)</option>
              {(opts?.video_models?.veo_tiers || []).length > 0 && (
                <optgroup label="Veo (i2v)">
                  {(opts?.video_models?.veo_tiers || []).map((m: string) => <option key={m} value={m}>{m}</option>)}
                </optgroup>
              )}
              {(opts?.video_models?.omni_flash_durations || []).length > 0 && (
                <optgroup label="Omni Flash (r2v)">
                  {(opts?.video_models?.omni_flash_durations || []).map((m: string) => <option key={m} value={m}>{m}</option>)}
                </optgroup>
              )}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={storytelling}
              onChange={(e) => setStorytelling(e.target.checked)}
              className="h-4 w-4 accent-indigo-500" />
            Storytelling mode (narration-driven, reads the original content verbatim)
          </label>

          <Field label="🔒 Seed (lock for reproducible images)">
            <input type="number" min={0} value={seed}
              onChange={(e) => setSeed(Math.max(0, Number(e.target.value) || 0))}
              placeholder="0 = random" className={inp} />
            <p className="mt-1 text-xs text-neutral-600">
              Set a number &gt; 0 so every generation uses the same seed and can be reproduced (same prompt/ref).
              0 or blank = random. (Multiple variants stay random so you have choices.)
            </p>
          </Field>

          <Field label="🎙 Voice (project narration)">
            <div className="flex gap-2">
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className={inp}
              >
                {voices.map((v) => {
                  return (
                    <option key={v.voice_id} value={v.voice_id}>
                      {v.title}
                    </option>
                  );
                })}
              </select>
              <button
                onClick={testVoice}
                disabled={testing}
                title="Preview selected voice"
                className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-40"
              >
                {testing ? "…" : "▶ Test"}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs text-neutral-500">Speech speed</span>
              <input type="range" min={0.5} max={1.5} step={0.05} value={ttsSpeed}
                onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                className="flex-1 accent-indigo-500" />
              <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
                {ttsSpeed.toFixed(2)}×
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs text-neutral-500">Pause between segments</span>
              <input type="range" min={0} max={2} step={0.05} value={ttsGap}
                onChange={(e) => setTtsGap(parseFloat(e.target.value))}
                className="flex-1 accent-indigo-500" />
              <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
                {ttsGap.toFixed(2)}s
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-600">
              Breathing pause between segments/shots. Use about 1.0s (24 frames) if using
              cross-dissolve so the effect sits fully inside the pause. Re-run "Build from narration" afterward.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs text-neutral-500">Pause between sentences</span>
              <input type="range" min={0} max={1} step={0.05} value={ttsSentenceGap}
                onChange={(e) => setTtsSentenceGap(parseFloat(e.target.value))}
                className="flex-1 accent-indigo-500" />
              <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
                {ttsSentenceGap.toFixed(2)}s
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-600">
              Each sentence is read separately and this pause is inserted at sentence breaks, so narration
              breathes naturally instead of running together. Re-run "Build from narration" afterward.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs text-neutral-500">Head/tail padding</span>
              <input type="range" min={0} max={2} step={0.05} value={ttsEdgePad}
                onChange={(e) => setTtsEdgePad(parseFloat(e.target.value))}
                className="flex-1 accent-indigo-500" />
              <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
                {ttsEdgePad.toFixed(2)}s
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-600">
              Padding silence at the START and END of each scene WAV, acting as handles for cross-dissolve
              during editing (DaVinci...), so transitions stay inside silence and do not eat narration at the
              start/end. About 0.5s covers a 24-frame dissolve. Re-run "Build from narration" afterward.
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              Manage/add voices in Settings. Set OmniVoice URL before testing.
            </p>
            <audio ref={audioRef} className="hidden" />
          </Field>

          <Field label="🎵 Background music (automatically mixed under narration when assembling video)">
            {bgmName ? (
              <div className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm">
                <span className="truncate text-neutral-200">🎵 {bgmName}</span>
                <button onClick={removeBgm} disabled={busy}
                  className="ml-2 shrink-0 text-rose-400 hover:text-rose-300 disabled:opacity-40">
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-neutral-700 px-3 py-3 text-sm text-neutral-400 hover:border-indigo-500 hover:text-neutral-200">
                {busy ? "Loading..." : "+ Choose music file (mp3, wav, m4a...)"}
                <input type="file" accept="audio/*" className="hidden"
                  onChange={(e) => onPickBgm(e.target.files?.[0])} />
              </label>
            )}
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs text-neutral-500">Music volume</span>
              <input type="range" min={0} max={0.6} step={0.02} value={bgmVol}
                onChange={(e) => setBgmVol(parseFloat(e.target.value))}
                className="flex-1 accent-indigo-500" />
              <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
                {Math.round(bgmVol * 100)}%
              </span>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-neutral-300">
              <input type="checkbox" checked={bgmDuck}
                onChange={(e) => setBgmDuck(e.target.checked)}
                className="h-4 w-4 accent-indigo-500" />
              Automatically lower music during narration (ducking)
            </label>
            <p className="mt-1 text-xs text-neutral-600">
              Narration keeps its volume. With ducking on, music lowers during speech and rises during
              silence. With ducking off, music stays at the fixed level above. No file means no music.
            </p>
          </Field>
        </div>

        <div className="space-y-2 border-t border-neutral-800 p-4">
          <div className="flex gap-2">
            <select
              value={presetSel}
              onChange={(e) => {
                setPresetSel(e.target.value);
                const p = presets.find((x) => x.id === e.target.value);
                if (p) applySettings(p.settings, `preset "${p.name}"`);
              }}
              title="Load a saved settings preset (applies immediately)"
              className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-300 outline-none"
            >
              <option value="">Settings preset...</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {presetSel && (
              <button onClick={() => deletePreset(presetSel)} title="Delete selected preset"
                className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-sm text-rose-300 hover:bg-rose-950/40">
                🗑
              </button>
            )}
            <button onClick={saveAsPreset} title="Save current settings as an app preset"
              className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-sm hover:bg-neutral-800">
              💾 Preset
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportSettings}
              title="Export project SETTINGS (style, prompt header/footer, model, TTS, BGM volume...) as .json for reuse in another project"
              className="flex-1 rounded-lg border border-neutral-700 py-2 text-center text-sm text-neutral-300 hover:bg-neutral-800"
            >
              ⤓ Export settings
            </button>
            <label
              title="Load settings from a .json file and apply them to this project (does not touch content/script/images)"
              className="flex-1 cursor-pointer rounded-lg border border-neutral-700 py-2 text-center text-sm text-neutral-300 hover:bg-neutral-800"
            >
              ⤒ Import settings
              <input type="file" accept="application/json,.json" className="hidden" disabled={busy}
                onChange={(e) => { importSettings(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          <a
            href={projectExportUrl(project.id)}
            download
            className="block rounded-lg border border-neutral-700 py-2 text-center text-sm text-neutral-300 hover:bg-neutral-800"
            title="Export project (DB rows + media) as .zip for backup / moving machines"
          >
            ⬇ Export project (.zip)
          </a>
          <button onClick={save} disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
            {busy ? "Saving..." : "Save project settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-400">{label}</label>
      {children}
    </div>
  );
}
