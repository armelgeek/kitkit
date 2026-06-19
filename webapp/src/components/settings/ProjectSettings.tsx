import { useEffect, useState } from "react";
import { api, type Project } from "../../api/client";

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
    culture_hint: project.culture_hint ?? "",
    prompt_header: project.prompt_header ?? "",
    prompt_footer: project.prompt_footer ?? "",
    image_model: project.image_model ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.options().then(setOpts).catch(() => {});
  }, []);

  const set = (k: keyof typeof s, v: string) => setS((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const updated = await api.updateProject(project.id, s);
      onSaved(updated);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-[440px] flex-col bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h2 className="font-semibold">⚙ Cấu hình dự án</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">✕</button>
        </div>

        <div className="flex-1 space-y-5 overflow-auto p-5">
          {err && <div className="rounded-lg bg-rose-950/40 px-3 py-2 text-sm text-rose-300">{err}</div>}

          <Field label="Style (luôn được đưa lên đầu mỗi prompt)">
            <input value={s.style} onChange={(e) => set("style", e.target.value)}
              placeholder="vd: chibi ghibli, watercolor" className={inp} />
          </Field>

          <Field label="Culture hint (tự nhận từ kịch bản — phong cách văn hoá)">
            <textarea value={s.culture_hint} onChange={(e) => set("culture_hint", e.target.value)}
              placeholder="vd: Vietnamese folk tale, traditional Vietnamese architecture, áo dài…"
              className={`${inp} h-20 resize-none`} />
            <p className="mt-1 text-xs text-neutral-600">
              Giữ hình ảnh đúng với gốc câu chuyện (truyện VN ra phong cách VN, truyện Nhật ra Nhật…).
            </p>
          </Field>

          <Field label="Prompt header (chèn vào ĐẦU mỗi prompt ảnh/video)">
            <textarea value={s.prompt_header} onChange={(e) => set("prompt_header", e.target.value)}
              placeholder="vd: always output in Vietnamese" className={`${inp} h-16 resize-none`} />
          </Field>

          <Field label="Prompt footer (chèn vào CUỐI mỗi prompt ảnh/video)">
            <textarea value={s.prompt_footer} onChange={(e) => set("prompt_footer", e.target.value)}
              placeholder="vd: super detailed, aspect ratio 16:9, cinematic lighting, 8k, sharp focus"
              className={`${inp} h-16 resize-none`} />
          </Field>

          <Field label="Image model">
            <select value={s.image_model} onChange={(e) => set("image_model", e.target.value)} className={inp}>
              <option value="">(mặc định)</option>
              {(opts?.image_models || []).map((m: string) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>

        <div className="border-t border-neutral-800 p-4">
          <button onClick={save} disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
            {busy ? "Đang lưu…" : "Lưu cấu hình dự án"}
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
