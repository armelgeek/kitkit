import { useEffect, useState } from "react";
import { api, getTtsConfig, setTtsConfig, listVoices, type Voice } from "../../api/client";
import VoiceManager from "./VoiceManager";

export default function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const [opts, setOpts] = useState<any>(null);
  const [s, setS] = useState<Record<string, any>>({});
  const [ttsUrl, setTtsUrl] = useState("");
  const [fonts, setFonts] = useState<{ name: string; path: string }[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.options().then(setOpts).catch((e) => setErr(e.message));
    api.getSettings().then(setS).catch(() => {});
    // Show the currently-saved OmniVoice URL so it doesn't look lost on reopen.
    getTtsConfig().then((c) => setTtsUrl(c.base_url || "")).catch(() => {});
    api.listFonts().then((r) => setFonts(r.fonts)).catch(() => {});
    listVoices().then(setVoices).catch(() => {});
  }, []);

  const set = (k: string, v: any) => {
    setS((p) => ({ ...p, [k]: v }));
    setSaved(false);
  };

  const save = async () => {
    setErr(null);
    try {
      await api.putSettings(s);
      if (ttsUrl.trim()) await setTtsConfig(ttsUrl.trim());
      setSaved(true);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const agents = opts?.agents || [];
  const deps = [
    { ok: agents.some((a: any) => a.available), label: "AI agent (claude/agy)" },
    { ok: !!opts, label: "Studio API" },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-[420px] flex-col bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h2 className="font-semibold">⚙ Settings</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">✕</button>
        </div>

        <div className="flex-1 space-y-5 overflow-auto p-5">
          {err && <div className="rounded-lg bg-rose-950/40 px-3 py-2 text-sm text-rose-300">{err}</div>}

          <Field label="AI Agent">
            <select value={s.agent || "claude"} onChange={(e) => set("agent", e.target.value)} className={inp}>
              {(agents.length ? agents.map((a: any) => a.key) : ["claude", "antigravity"]).map((k: string) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </Field>

          <Field label="Image model">
            <select value={s.image_model || ""} onChange={(e) => set("image_model", e.target.value)} className={inp}>
              <option value="">(mặc định)</option>
              {(opts?.image_models || []).map((m: string) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>

          <Field label="Style mặc định">
            <input value={s.style || ""} onChange={(e) => set("style", e.target.value)}
              placeholder="vd: Cinematic, teal-orange, 35mm" className={inp} />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(opts?.style_presets || []).map((p: string) => (
                <button key={p} onClick={() => set("style", p)}
                  className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700">{p}</button>
              ))}
            </div>
          </Field>

          <div className="border-t border-neutral-800 pt-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Mặc định cho project mới
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Khung hình">
                <select value={s.aspect_ratio || "VIDEO_ASPECT_RATIO_LANDSCAPE"}
                  onChange={(e) => set("aspect_ratio", e.target.value)} className={inp}>
                  <option value="VIDEO_ASPECT_RATIO_LANDSCAPE">16:9 ngang</option>
                  <option value="VIDEO_ASPECT_RATIO_PORTRAIT">9:16 dọc</option>
                </select>
              </Field>
              <Field label="Độ dài shot (giây)">
                <input type="number" min={1} max={10} value={s.shot_duration ?? 8}
                  onChange={(e) => set("shot_duration", Math.min(10, Math.max(1, Number(e.target.value) || 8)))}
                  className={inp} />
              </Field>
            </div>
            <Field label="Video model">
              <select value={s.video_model || ""} onChange={(e) => set("video_model", e.target.value)} className={inp}>
                <option value="">(mặc định)</option>
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
            <Field label="Ngôn ngữ kịch bản / lời đọc">
              <input value={s.script_lang || ""} onChange={(e) => set("script_lang", e.target.value)}
                placeholder="Tiếng Việt" className={inp} />
            </Field>
            <Field label="Giọng đọc mặc định">
              <select value={s.voice_id ?? 0} onChange={(e) => set("voice_id", Number(e.target.value))} className={inp}>
                <option value={0}>Mặc định (id 0)</option>
                {voices.map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>{v.title} (id {v.voice_id})</option>
                ))}
              </select>
            </Field>
            <Field label="Tốc độ đọc mặc định">
              <div className="flex items-center gap-3">
                <input type="range" min={0.5} max={1.5} step={0.05} value={s.tts_speed ?? 1.0}
                  onChange={(e) => set("tts_speed", parseFloat(e.target.value))}
                  className="flex-1 accent-indigo-500" />
                <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
                  {(s.tts_speed ?? 1.0).toFixed(2)}×
                </span>
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input type="checkbox" checked={s.storytelling ?? true}
                onChange={(e) => set("storytelling", e.target.checked)}
                className="h-4 w-4 accent-indigo-500" />
              Bật Storytelling mặc định
            </label>
          </div>

          <Field label="OmniVoice base URL (TTS)">
            <input value={ttsUrl} onChange={(e) => setTtsUrl(e.target.value)}
              placeholder="https://xxxx.ngrok-free.app" className={inp} />
            <p className="mt-1 text-xs text-neutral-600">
              Đặt URL rồi “Lưu cấu hình” trước khi quản lý/test giọng bên dưới.
            </p>
          </Field>

          <div className="border-t border-neutral-800 pt-4">
            <VoiceManager />
          </div>

          <Field label="Font caption (vẽ chữ lên video)">
            <select value={s.caption_font || ""} onChange={(e) => set("caption_font", e.target.value)} className={inp}>
              <option value="">(tự dò theo hệ điều hành)</option>
              {fonts.map((f) => (
                <option key={f.path} value={f.path}>{f.name}</option>
              ))}
            </select>
          </Field>

          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Trạng thái</div>
            <div className="space-y-1.5">
              {deps.map((d) => (
                <div key={d.label} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${d.ok ? "bg-emerald-400" : "bg-rose-500"}`} />
                  {d.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-800 p-4">
          <button onClick={save}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            {saved ? "✓ Đã lưu" : "Lưu cấu hình"}
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
