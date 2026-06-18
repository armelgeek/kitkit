import { useEffect, useRef, useState } from "react";
import { api, type Project, type Scene } from "../../api/client";

export default function ScriptTab({ project }: { project: Project }) {
  const [script, setScript] = useState(project.script_raw ?? "");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.listScenes(project.id).then((r) => setScenes(r.scenes)).catch(() => {});
  }, [project.id]);

  const hasScript = script.trim().length > 0;

  const onResult = (r: { script: string; scenes: Scene[] }) => {
    setScript(r.script);
    setScenes(r.scenes);
    setDirty(false);
  };

  const wrap = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    setErr(null);
    try {
      onResult(await fn());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* Main editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!hasScript ? (
          <GeneratePanel
            project={project}
            busy={busy === "gen"}
            onGenerate={(idea, dur) =>
              wrap("gen", () => api.generateScript(project.id, idea, dur))
            }
          />
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-neutral-400">
                Screenplay (Fountain) · {scenes.length} scene
              </span>
              <button
                disabled={!dirty || !!busy}
                onClick={() => wrap("save", () => api.saveScript(project.id, script))}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {busy === "save" ? "Đang lưu…" : dirty ? "Lưu" : "Đã lưu"}
              </button>
            </div>
            <textarea
              value={script}
              onChange={(e) => {
                setScript(e.target.value);
                setDirty(true);
              }}
              spellCheck={false}
              className="flex-1 resize-none rounded-xl border border-neutral-800 bg-neutral-950 p-4 font-mono text-[13px] leading-6 text-neutral-200 outline-none focus:border-indigo-500"
              style={{ fontFamily: '"Courier New", ui-monospace, monospace' }}
            />
            <ChatBox
              busy={busy === "chat"}
              onSend={(instr) => wrap("chat", () => api.scriptChat(project.id, instr))}
            />
          </div>
        )}
        {err && (
          <div className="mx-4 mb-3 rounded-lg border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
            {err}
          </div>
        )}
      </div>

      {/* Scenes sidebar */}
      <aside className="hidden w-72 shrink-0 overflow-auto border-l border-neutral-800 p-3 lg:block">
        <h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Scenes
        </h3>
        <div className="space-y-1.5">
          {scenes.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">{String(s.idx + 1).padStart(2, "0")}</span>
                <span className="truncate text-sm font-medium text-neutral-200">
                  {s.heading}
                </span>
              </div>
              {s.action && (
                <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{s.action}</p>
              )}
            </div>
          ))}
          {!scenes.length && (
            <p className="px-1 text-xs text-neutral-600">Chưa có scene.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function GeneratePanel({
  project,
  busy,
  onGenerate,
}: {
  project: Project;
  busy: boolean;
  onGenerate: (idea: string, dur: number | null) => void;
}) {
  const [idea, setIdea] = useState(project.idea ?? "");
  const [useDur, setUseDur] = useState(!!project.target_duration);
  const [dur, setDur] = useState(project.target_duration ?? 60);

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col justify-center px-6 py-10">
      <h2 className="mb-1 text-xl font-semibold">Tạo kịch bản từ ý tưởng</h2>
      <p className="mb-5 text-sm text-neutral-400">
        Nhập ý tưởng ngắn hoặc dán nội dung dài — AI sẽ viết screenplay.
        {project.storytelling ? " (Storytelling: giọng đọc dẫn dắt)" : ""}
      </p>
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Ví dụ: Câu chuyện về hai anh em và cây khế thần…"
        className="mb-4 h-40 resize-none rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm outline-none focus:border-indigo-500"
      />
      <div className="mb-5 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={useDur}
            onChange={(e) => setUseDur(e.target.checked)}
            className="h-4 w-4 accent-indigo-500"
          />
          Thời lượng mục tiêu
        </label>
        {useDur && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={dur}
              min={5}
              onChange={(e) => setDur(parseInt(e.target.value) || 0)}
              className="w-24 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
            />
            <span className="text-sm text-neutral-500">giây</span>
          </div>
        )}
        {!useDur && (
          <span className="text-xs text-neutral-600">(không đặt → giữ đầy đủ nội dung)</span>
        )}
      </div>
      <button
        disabled={busy || !idea.trim()}
        onClick={() => onGenerate(idea, useDur ? dur : null)}
        className="self-start rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
      >
        {busy ? "AI đang viết…" : "✦ Tạo kịch bản"}
      </button>
    </div>
  );
}

function ChatBox({ busy, onSend }: { busy: boolean; onSend: (s: string) => void }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const send = () => {
    if (!text.trim() || busy) return;
    onSend(text);
    setText("");
  };
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2">
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        placeholder="Mô tả thay đổi, sửa cảnh, đổi lời thoại…"
        disabled={busy}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-600"
      />
      <button
        onClick={send}
        disabled={busy || !text.trim()}
        className="grid h-8 w-8 place-items-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40"
      >
        {busy ? "…" : "→"}
      </button>
    </div>
  );
}
