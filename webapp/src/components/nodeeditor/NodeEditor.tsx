import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { graphApi, type Entity } from "../../api/client";

export interface EditorTarget {
  kind: "shot" | "entity";
  id: string;
  title: string;
}

const PALETTE: { type: string; label: string }[] = [
  { type: "prompt", label: "Prompt" },
  { type: "refs", label: "References" },
  { type: "image", label: "Generate Image" },
  { type: "editImage", label: "Edit Image" },
  { type: "video", label: "Generate Video" },
  { type: "output", label: "Output" },
];

const COLOR: Record<string, string> = {
  prompt: "#6366f1", refs: "#0ea5e9", image: "#10b981",
  editImage: "#f59e0b", video: "#ec4899", output: "#64748b",
};

function defaultGraph(kind: string): { nodes: Node[]; edges: Edge[] } {
  const mk = (id: string, type: string, x: number, y: number, data: any = {}): Node => ({
    id, position: { x, y }, data: { ...data, _type: type, label: type },
    style: nodeStyle(type),
  });
  if (kind === "shot") {
    return {
      nodes: [
        mk("p", "prompt", 0, 0, { text: "" }),
        mk("v", "video", 240, 0, { text: "" }),
        mk("o", "output", 480, 0),
      ],
      edges: [
        { id: "e1", source: "p", target: "v" },
        { id: "e2", source: "v", target: "o" },
      ],
    };
  }
  return {
    nodes: [
      mk("p", "prompt", 0, 0, { text: "" }),
      mk("r", "refs", 0, 120, { entity_ids: [] }),
      mk("i", "image", 260, 40),
      mk("o", "output", 500, 40),
    ],
    edges: [
      { id: "e1", source: "p", target: "i" },
      { id: "e2", source: "r", target: "i" },
      { id: "e3", source: "i", target: "o" },
    ],
  };
}

function nodeStyle(type: string) {
  return {
    background: "#18181b", color: "#e7e7ea",
    border: `1px solid ${COLOR[type] || "#444"}`, borderRadius: 10,
    padding: "8px 12px", fontSize: 12, width: 160,
  };
}

export default function NodeEditor({
  target,
  entities,
  onClose,
  onApplied,
}: {
  target: EditorTarget;
  entities: Entity[];
  onClose: () => void;
  onApplied: (r: any) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    graphApi.get(target.kind, target.id).then((r) => {
      const g = r.graph && r.graph.nodes?.length ? r.graph : defaultGraph(target.kind);
      // re-apply styles + labels
      g.nodes = g.nodes.map((n: any) => ({
        ...n,
        data: { ...n.data, label: n.data?._type || n.type, _type: n.data?._type || n.type },
        style: nodeStyle(n.data?._type || n.type),
      }));
      setNodes(g.nodes);
      setEdges(g.edges || []);
    }).catch(() => {
      const g = defaultGraph(target.kind);
      setNodes(g.nodes);
      setEdges(g.edges);
    });
  }, [target.id]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((es) => addEdge({ ...c, id: `e${Date.now()}` }, es)),
    [setEdges]
  );

  const addNode = (type: string) => {
    const id = `${type}-${Date.now()}`;
    setNodes((ns) => [
      ...ns,
      {
        id, position: { x: 60 + Math.random() * 120, y: 60 + Math.random() * 160 },
        data: { _type: type, label: type, ...(type === "prompt" ? { text: "" } : {}),
                ...(type === "refs" ? { entity_ids: [] } : {}) },
        style: nodeStyle(type),
      },
    ]);
  };

  // serialize graph for API: type at top level + data
  const serialize = () => ({
    nodes: nodes.map((n) => ({
      id: n.id, type: (n.data as any)._type,
      data: n.data, position: n.position,
    })),
    edges: edges.map((e) => ({ source: e.source, target: e.target })),
  });

  const updateSel = (patch: any) =>
    setNodes((ns) =>
      ns.map((n) => (n.id === selId ? { ...n, data: { ...n.data, ...patch } } : n))
    );

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await graphApi.run(target.kind, target.id, serialize());
      onApplied(r);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    await graphApi.save(target.kind, target.id, serialize());
  };

  const sel = nodes.find((n) => n.id === selId);
  const selType = sel ? (sel.data as any)._type : null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-neutral-950">
      <div className="flex items-center gap-3 border-b border-neutral-800 px-4 py-2.5">
        <span className="font-medium">Node Editor — {target.title}</span>
        <div className="ml-2 flex flex-wrap gap-1">
          {PALETTE.map((p) => (
            <button
              key={p.type}
              onClick={() => addNode(p.type)}
              className="rounded-md border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
            >
              + {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={save} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800">
            Lưu
          </button>
          <button onClick={run} disabled={busy}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
            {busy ? "Đang chạy…" : "▶ Run"}
          </button>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800">
            Đóng
          </button>
        </div>
      </div>
      {err && <div className="bg-rose-950/50 px-4 py-1.5 text-sm text-rose-300">{err}</div>}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelId(n.id)}
            fitView
            colorMode="dark"
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        {sel && (
          <aside className="w-72 shrink-0 overflow-auto border-l border-neutral-800 p-4">
            <div className="mb-3 text-sm font-medium capitalize">{selType}</div>
            {selType === "prompt" && (
              <textarea
                value={(sel.data as any).text || ""}
                onChange={(e) => updateSel({ text: e.target.value })}
                placeholder="Nội dung prompt (dùng {Tên} để gắn ref)"
                className="h-40 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-sm outline-none focus:border-indigo-500"
              />
            )}
            {selType === "refs" && (
              <div className="space-y-1">
                {entities.map((e) => {
                  const ids: string[] = (sel.data as any).entity_ids || [];
                  return (
                    <label key={e.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-neutral-800">
                      <input
                        type="checkbox"
                        checked={ids.includes(e.id)}
                        onChange={() =>
                          updateSel({
                            entity_ids: ids.includes(e.id)
                              ? ids.filter((x) => x !== e.id)
                              : [...ids, e.id],
                          })
                        }
                        className="h-3.5 w-3.5 accent-indigo-500"
                      />
                      <span className={`h-1.5 w-1.5 rounded-full ${e.media_id ? "bg-emerald-400" : "bg-neutral-600"}`} />
                      <span className="truncate text-neutral-300">{e.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {(selType === "video" || selType === "editImage" || selType === "image") && (
              <textarea
                value={(sel.data as any).text || ""}
                onChange={(e) => updateSel({ text: e.target.value })}
                placeholder="Prompt (nếu không nối từ node Prompt)"
                className="h-28 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-sm outline-none focus:border-indigo-500"
              />
            )}
            {selType === "output" && (
              <p className="text-xs text-neutral-500">Gán media cuối vào {target.kind}.</p>
            )}
            <button
              onClick={() => {
                setNodes((ns) => ns.filter((n) => n.id !== selId));
                setEdges((es) => es.filter((e) => e.source !== selId && e.target !== selId));
                setSelId(null);
              }}
              className="mt-4 w-full rounded-lg border border-rose-900 py-1.5 text-xs text-rose-400 hover:bg-rose-950/40"
            >
              Xóa node
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
