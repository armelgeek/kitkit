import { useEffect, useRef, useState } from "react";
import {
  listVoices,
  addVoice,
  removeVoice,
  synthesize,
  fileToBase64,
  base64ToAudioUrl,
  type Voice,
} from "../../api/client";
import { useConfirm } from "../common/Confirm";

const SAMPLE = "Hello, this is a sample narration voice for the project.";

// Manage ElevenLabs voices: list, upload+create a clone, test (synthesize + play), remove.
export default function VoiceManager({ defaultSpeed = 1.0 }: { defaultSpeed?: number }) {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [testText, setTestText] = useState(SAMPLE);
  const [testSpeed, setTestSpeed] = useState(defaultSpeed);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const confirm = useConfirm();

  const load = () => {
    setBusy("load");
    setErr(null);
    listVoices()
      .then(setVoices)
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(null));
  };
  useEffect(load, []);

  const play = async (b64: string) => {
    const url = base64ToAudioUrl(b64);
    if (audioRef.current) {
      audioRef.current.src = url;
      await audioRef.current.play().catch(() => {});
    }
  };

  const test = async (voice_id: string | number) => {
    console.log("Testing voice:", voice_id);
    setBusy(`test-${voice_id}`);
    setErr(null);
    try {
      const r = await synthesize(testText.trim() || SAMPLE, voice_id, testSpeed);
      if (r.audio) await play(r.audio);
      else
        setErr(
          "TTS did not return audio (check your ElevenLabs configuration).",
        );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!file) {
      setErr("Choose a voice file (WAV/MP3) first.");
      return;
    }
    setBusy("add");
    setErr(null);
    try {
      const b64 = await fileToBase64(file);
      await addVoice(b64, title.trim() || file.name.replace(/\.[^.]+$/, ""));
      setTitle("");
      setFile(null);
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const del = async (v: Voice) => {
    const ok = await confirm({
      title: "Delete voice?",
      message: `Voice "${v.title}" (id ${v.voice_id}) will be removed from ElevenLabs.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusy(`del-${v.voice_id}`);
    setErr(null);
    try {
      await removeVoice(v.voice_id);
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Voices (ElevenLabs)
        </span>
        <button
          onClick={load}
          disabled={busy === "load"}
          className="ml-auto text-xs text-neutral-400 hover:text-neutral-200 disabled:opacity-40"
        >
          ↻ Refresh
        </button>
      </div>

      {err && (
        <div className="rounded-lg bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
          {err}
        </div>
      )}

      <input
        value={testText}
        onChange={(e) => setTestText(e.target.value)}
        placeholder="Sample text to test the voice..."
        className={inp}
      />
      <div className="flex items-center gap-3">
        <span className="text-xs text-neutral-500 shrink-0">Test speed</span>
        <input
          type="range" min={0.5} max={1.5} step={0.05} value={testSpeed}
          onChange={(e) => setTestSpeed(parseFloat(e.target.value))}
          className="flex-1 accent-indigo-500"
        />
        <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
          {testSpeed.toFixed(2)}×
        </span>
      </div>

      <div className="space-y-1.5">
        {voices === null && busy === "load" && (
          <p className="text-xs text-neutral-500">Loading voice list...</p>
        )}
        {voices !== null && !voices.length && (
          <p className="text-xs text-neutral-500">
            No voices yet (or ElevenLabs is not connected).
          </p>
        )}
        {(voices || []).map((v) => (
          <div
            key={v.voice_id}
            className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-neutral-200">{v.title}</div>
              <div className="text-[11px] text-neutral-600">
                id {v.voice_id}
              </div>
            </div>
            <button
              onClick={() => test(v.voice_id)}
              disabled={!!busy}
              title="Preview voice"
              className="rounded-md border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-40"
            >
              {busy === `test-${v.voice_id}` ? "…" : "▶ Test"}
            </button>
            <button
              onClick={() => del(v)}
              disabled={!!busy}
              title="Delete voice"
              className="rounded-md px-2 py-1 text-xs text-rose-400 hover:bg-rose-950/40 disabled:opacity-40"
            >
              {busy === `del-${v.voice_id}` ? "…" : "🗑"}
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-neutral-800 p-3">
        <div className="mb-2 text-xs text-neutral-400">
          ＋ Add a new voice (clone)
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Voice name"
          className={`${inp} mb-2`}
        />
        <label className="mb-2 flex cursor-pointer items-center justify-center rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-400 hover:border-indigo-500 hover:text-neutral-200">
          {file ? `🎙 ${file.name}` : "Choose a sample voice file (WAV/MP3)"}
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <button
          onClick={create}
          disabled={busy === "add" || !file}
          className="w-full rounded-lg bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {busy === "add" ? "Creating voice..." : "Create voice from file"}
        </button>
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}

const inp =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500";
