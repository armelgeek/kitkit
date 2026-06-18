import { useState } from "react";
import { type Project } from "./api/client";
import StatusPills from "./components/StatusPills";
import ProjectGrid from "./components/ProjectGrid";
import ProjectWorkspace from "./components/ProjectWorkspace";

export default function App() {
  const [open, setOpen] = useState<Project | null>(null);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-3">
        <button
          onClick={() => setOpen(null)}
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm text-white">
            ▶
          </span>
          Flow Studio
        </button>
        <StatusPills />
      </header>

      <main className="flex-1 overflow-hidden">
        {open ? (
          <ProjectWorkspace project={open} onBack={() => setOpen(null)} />
        ) : (
          <ProjectGrid onOpen={setOpen} />
        )}
      </main>
    </div>
  );
}
