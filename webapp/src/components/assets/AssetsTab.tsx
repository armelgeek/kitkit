import { useEffect, useState } from "react";
import { api, type Entity, type Project } from "../../api/client";
import type { EditorTarget } from "../nodeeditor/NodeEditor";
import Thumb from "../Thumb";

const GROUPS: { type: Entity["type"]; label: string }[] = [
  { type: "character", label: "Nhân vật" },
  { type: "location", label: "Bối cảnh" },
  { type: "prop", label: "Đạo cụ" },
];

export default function AssetsTab({
  project,
  onEdit,
}: {
  project: Project;
  onEdit?: (t: EditorTarget) => void;
}) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [gening, setGening] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    api.listEntities(project.id).then((r) => setEntities(r.entities)).catch(() => {});
  useEffect(() => {
    load();
  }, [project.id]);

  const wrap = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const genOne = async (e: Entity) => {
    setGening((s) => new Set(s).add(e.id));
    setErr(null);
    try {
      const updated = await api.generateEntity(e.id);
      setEntities((list) => list.map((x) => (x.id === e.id ? updated : x)));
    } catch (ex: any) {
      setErr(ex.message);
    } finally {
      setGening((s) => {
        const n = new Set(s);
        n.delete(e.id);
        return n;
      });
    }
  };

  const addManual = async (type: Entity["type"]) => {
    const name = prompt(`Tên ${type}?`);
    if (!name) return;
    wrap("add", () => api.addEntity(project.id, { type, name }));
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Thư viện Asset</h2>
          <p className="text-sm text-neutral-400">
            Nhân vật, bối cảnh, đạo cụ — ảnh tham chiếu cho storyboard
          </p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={!!busy}
            onClick={() => wrap("extract", () => api.extractEntities(project.id))}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40"
          >
            {busy === "extract" ? "Đang trích…" : "Trích từ kịch bản"}
          </button>
          <button
            disabled={!!busy}
            onClick={() => wrap("all", () => api.generateAllAssets(project.id))}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy === "all" ? "Đang tạo…" : "✦ Auto gen"}
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {err}
        </div>
      )}

      {GROUPS.map((g) => {
        const items = entities.filter((e) => e.type === g.type);
        return (
          <section key={g.type} className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
                {g.label}
              </h3>
              <span className="text-xs text-neutral-600">{items.length}</span>
              <button
                onClick={() => addManual(g.type)}
                className="ml-auto rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
              >
                + Thêm
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((e) => (
                <AssetCard
                  key={e.id}
                  entity={e}
                  generating={gening.has(e.id)}
                  onGenerate={() => genOne(e)}
                  onCover={
                    e.media_id
                      ? () => wrap("cover", () => api.setCover(project.id, e.media_id!))
                      : undefined
                  }
                  onDelete={() => wrap("del", () => api.deleteEntity(e.id))}
                  onEdit={
                    onEdit
                      ? () =>
                          onEdit({
                            kind: "entity",
                            id: e.id,
                            title: e.name,
                            prompt: e.description || e.ref_prompt || e.name,
                            imageSrc: e.image_path,
                          })
                      : undefined
                  }
                />
              ))}
              {!items.length && (
                <div className="col-span-full rounded-xl border border-dashed border-neutral-800 py-8 text-center text-xs text-neutral-600">
                  Chưa có {g.label.toLowerCase()}.
                </div>
              )}
            </div>
          </section>
        );
      })}
      </div>
    </div>
  );
}

function AssetCard({
  entity,
  generating,
  onGenerate,
  onCover,
  onDelete,
  onEdit,
}: {
  entity: Entity;
  generating: boolean;
  onGenerate: () => void;
  onCover?: () => void;
  onDelete: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="group overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50">
      <div className="relative">
        <Thumb
          src={entity.image_path}
          alt={entity.name}
          rounded="rounded-none"
          className="aspect-video w-full"
        />
        {generating && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-neutral-200">
            <span className="animate-pulse">Đang tạo ảnh…</span>
          </div>
        )}
        <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={onGenerate}
            disabled={generating}
            title="Gen nhanh"
            className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900/80 text-sm hover:bg-indigo-600"
          >
            ⚡
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              title="Edit (node editor)"
              className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900/80 text-sm hover:bg-neutral-700"
            >
              ✎
            </button>
          )}
          {onCover && (
            <button
              onClick={onCover}
              title="Đặt làm ảnh đại diện dự án"
              className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900/80 text-sm hover:bg-amber-600"
            >
              ★
            </button>
          )}
          <button
            onClick={onDelete}
            title="Xóa"
            className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900/80 text-sm hover:bg-rose-600"
          >
            🗑
          </button>
        </div>
      </div>
      <div className="p-2">
        <div className="truncate text-sm font-medium">{entity.name}</div>
        {entity.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{entity.description}</p>
        )}
      </div>
    </div>
  );
}
