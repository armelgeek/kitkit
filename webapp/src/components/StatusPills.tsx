import { useEffect, useState } from "react";
import { api, type Health } from "../api/client";

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800/80 px-2.5 py-1 text-xs"
      title={label}
    >
      <span
        className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-500"}`}
      />
      {label}
    </span>
  );
}

export default function StatusPills() {
  const [health, setHealth] = useState<Health | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const h = await api.health();
        if (alive) setHealth(h);
        if (h.extension_connected) {
          try {
            const c = await api.credits();
            if (alive) setCredits(c.credits ?? null);
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (alive) setHealth(null);
      }
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      {credits != null && (
        <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-300">
          {credits.toLocaleString()} credits
        </span>
      )}
      <Pill ok={!!health?.extension_connected} label="Flow" />
      <Pill ok={!!health?.tts} label="TTS" />
      <Pill ok={!!health?.ffmpeg} label="ffmpeg" />
    </div>
  );
}
