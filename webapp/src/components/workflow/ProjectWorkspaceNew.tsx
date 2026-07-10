import React from "react";
import { WorkflowProvider } from "../../context/WorkflowContext";
import { Project } from "../../api/client";
import Sidebar from "./Sidebar";
import MainContent from "./MainContent";

interface ProjectWorkspaceNewProps {
  project: Project;
  onBack: () => void;
}

export default function ProjectWorkspaceNew({ project, onBack }: ProjectWorkspaceNewProps) {
  return (
    <WorkflowProvider>
      <div className="flex h-full">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <div className="border-b border-neutral-800 px-6 py-3 flex items-center">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-sm font-medium text-neutral-300 hover:text-white transition"
            >
              ← Projects
            </button>
            <div className="ml-4 min-w-0">
              <div className="truncate font-medium text-white">{project.title}</div>
            </div>
          </div>

          {/* Content */}
          <MainContent />
        </div>
      </div>
    </WorkflowProvider>
  );
}
