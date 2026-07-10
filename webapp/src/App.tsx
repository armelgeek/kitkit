import { useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { type Project } from "./api/client";
import StatusPills from "./components/StatusPills";
import ProjectGrid from "./components/ProjectGrid";
import ProjectWorkspace from "./components/ProjectWorkspace";
import ProjectWorkspaceNew from "./components/workflow/ProjectWorkspaceNew";
import CreateProjectPage from "./pages/CreateProjectPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import SettingsDrawer from "./components/settings/SettingsDrawer";

function AppContent() {
  const [settings, setSettings] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-3">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-lg font-semibold tracking-tight hover:opacity-80 transition"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm text-white">
            ▶
          </span>
          Flow Studio
        </button>

        <div className="flex items-center gap-3">
          <StatusPills />
          <button
            onClick={() => setSettings(true)}
            title="Settings"
            className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<ProjectGrid />} />
          <Route path="/project/new" element={<CreateProjectPage />} />
          <Route path="/project/:id" element={<ProjectDetailPage />} />
        </Routes>
      </main>

      {settings && <SettingsDrawer onClose={() => setSettings(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
