import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

const MODEL_OPTIONS = [
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  { value: "claude-opus-4-1", label: "Claude Opus 4.1" },
];

const LANGUAGE_OPTIONS = ["English", "French", "Spanish"];
const DURATION_OPTIONS = [30, 60, 120, 180];
const ASPECT_RATIO_OPTIONS = [
  { value: "VIDEO_ASPECT_RATIO_LANDSCAPE", label: "16:9 landscape" },
  { value: "VIDEO_ASPECT_RATIO_PORTRAIT", label: "9:16 portrait" },
];

export default function CreateProjectPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [aspect, setAspect] = useState("VIDEO_ASPECT_RATIO_LANDSCAPE");
  const [style, setStyle] = useState("Realistic");
  const [scriptLang, setScriptLang] = useState("English");
  const [storytelling, setStorytelling] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      const project = await api.createProject({
        title,
        aspect_ratio: aspect,
        style,
        storytelling,
        script_lang: scriptLang.trim() || "English",
      });
      navigate(`/project/${project.id}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-neutral-950 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8">
        <h1 className="mb-6 text-2xl font-bold text-white">Create New Project</h1>

        {err && (
          <div className="mb-4 rounded-lg bg-red-950 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {/* Project Title */}
        <div className="mb-6">
          <label className="mb-2 block text-sm text-neutral-400">Project title</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Example: The story of the magic tree"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/20"
          />
        </div>

        {/* Frame Ratio & Style */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-sm text-neutral-400">Frame ratio</label>
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-indigo-500"
            >
              {ASPECT_RATIO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm text-neutral-400">Style</label>
            <input
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Script Language */}
        <div className="mb-6">
          <label className="mb-2 block text-sm text-neutral-400">Script / narration language</label>
          <select
            value={scriptLang}
            onChange={(e) => setScriptLang(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none focus:border-indigo-500"
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        {/* Storytelling Checkbox */}
        <label className="mb-6 flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={storytelling}
            onChange={(e) => setStorytelling(e.target.checked)}
            className="h-4 w-4 accent-indigo-500"
          />
          Storytelling mode (guided narration)
        </label>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/")}
            className="flex-1 rounded-lg px-4 py-3 text-sm text-neutral-300 hover:bg-neutral-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !title.trim()}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition"
          >
            {busy ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
