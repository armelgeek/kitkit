import { useEffect, useState } from "react";
import { api, type MediaVersion } from "../../api/client";

// Browse past versions of a record's media and restore one (§13#8). `kind` = entity vs shot.
export default function MediaHistory({
  kind,
  id,
  slot = "image",
  title,
  onRestored,
  onClose,
}: {
  kind: "entity" | "shot";
  id: string;
  slot?: string;
  title?: string;
  onRestored: (record: any) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaVersion[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    const p = kind === "entity" ? api.entityHistory(id) : api.shotHistory(id, slot);
    p.then((r) => setItems(r.history)).catch((e) => setErr(e.message));
  }, [kind, id, slot]);

  const restore = async (h: MediaVersion) => {
    setRestoring(h.id);
    setErr(null);
    try {
      const rec =
        kind === "entity"
          ? await api.restoreEntityHistory(id, h.id)
          : await api.restoreShotHistory(id, h.id);
      onRestored(rec);
      onClose();
    } catch (e: any) {
      setErr(e.message);
      setRestoring(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-neutral-800 px-5 py-3">
          <h3 className="font-semibold">🕘 Version history{title ? ` — ${title}` : ""}</h3>
          <button onClick={onClose} className="ml-auto text-neutral-500 hover:text-neutral-300">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {err && <div className="mb-3 rounded-lg bg-rose-950/40 px-3 py-2 text-sm text-rose-300">{err}</div>}
          {items === null && <p className="text-sm text-neutral-500">Loading...</p>}
          {items !== null && !items.length && (
            <p className="text-sm text-neutral-500">No versions have been saved yet.</p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {(items || []).map((h, i) => (
              <button
                key={h.id}
                onClick={() => restore(h)}
                disabled={!!restoring}
                className="group overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50 text-left transition hover:border-indigo-500 disabled:opacity-50"
              >
                <div className="relative">
                  {h.slot === "video" ? (
                    <video src={h.path} className="aspect-video w-full bg-black object-cover" muted preload="metadata" />
                  ) : (
                    <img src={h.path} alt="version" className="aspect-video w-full object-cover" />
                  )}
                  <div className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/50">
                    <span className="rounded-md bg-indigo-600 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                      {restoring === h.id ? "Restoring..." : "↩ Restore"}
                    </span>
                  </div>
                  {i === 0 && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] text-white">
                      current
                    </span>
                  )}
                </div>
                <div className="px-2 py-1 text-[11px] text-neutral-500">
                  {new Date((h.created_at || 0) * 1000).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
