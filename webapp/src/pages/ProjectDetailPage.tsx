import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, type Project } from "../api/client";
import ProjectWorkspaceNew from "../components/workflow/ProjectWorkspaceNew";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      navigate("/");
      return;
    }

    const loadProject = async () => {
      try {
        setLoading(true);
        const projects = await api.listProjects();
        const found = projects.projects.find((p) => p.id === id);
        if (!found) {
          setErr("Project not found");
          setTimeout(() => navigate("/"), 2000);
          return;
        }
        setProject(found);
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-neutral-700 border-t-indigo-600 mx-auto" />
          <p className="text-neutral-400">Loading project...</p>
        </div>
      </div>
    );
  }

  if (err || !project) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950">
        <div className="text-center">
          <p className="mb-4 text-red-400">
            {err || "Project not found"}
          </p>
          <button
            onClick={() => navigate("/")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
          >
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <ProjectWorkspaceNew project={project} onBack={() => navigate("/")} />
  );
}
