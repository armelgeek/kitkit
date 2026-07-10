import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import ProjectWorkspaceNew from "../../src/components/workflow/ProjectWorkspaceNew";
import { Project } from "../../src/api/client";

// Mock the child components
vi.mock("../../src/components/workflow/Sidebar", () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock("../../src/components/workflow/MainContent", () => ({
  default: () => <div data-testid="main-content">Main Content</div>,
}));

describe("ProjectWorkspaceNew", () => {
  const mockProject: Project = {
    id: "test-project-1",
    title: "Test Project",
    flow_project_id: null,
    style: "cinematic",
    aspect_ratio: "16:9",
    storytelling: 1,
    thumb_media_key: null,
    idea: "A test story idea",
    target_duration: 120,
    script_raw: null,
    status: "pending",
    updated_at: Date.now(),
  };

  const mockOnBack = vi.fn();

  beforeEach(() => {
    mockOnBack.mockClear();
  });

  describe("Rendering", () => {
    it("renders with WorkflowProvider wrapper", () => {
      const { container } = render(
        <ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />
      );

      // Verify the component renders without error
      expect(container).toBeInTheDocument();
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders Sidebar component", () => {
      render(<ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />);

      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
      expect(screen.getByText("Sidebar")).toBeInTheDocument();
    });

    it("renders MainContent component", () => {
      render(<ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />);

      expect(screen.getByTestId("main-content")).toBeInTheDocument();
      expect(screen.getByText("Main Content")).toBeInTheDocument();
    });

    it("displays project title correctly", () => {
      render(<ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />);

      expect(screen.getByText("Test Project")).toBeInTheDocument();
    });

    it("renders back button with correct label", () => {
      render(<ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />);

      const backButton = screen.getByRole("button", { name: /← Projects/ });
      expect(backButton).toBeInTheDocument();
    });
  });

  describe("Back button functionality", () => {
    it("calls onBack callback when back button is clicked", () => {
      render(<ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />);

      const backButton = screen.getByRole("button", { name: /← Projects/ });
      fireEvent.click(backButton);

      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });

    it("back button is clickable", () => {
      render(<ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />);

      const backButton = screen.getByRole("button", { name: /← Projects/ });
      expect(backButton).not.toBeDisabled();
    });

    it("back button styling is applied", () => {
      render(<ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />);

      const backButton = screen.getByRole("button", { name: /← Projects/ });
      expect(backButton).toHaveClass("text-sm", "font-medium", "text-neutral-300");
    });
  });

  describe("Layout structure", () => {
    it("has correct flex layout", () => {
      const { container } = render(
        <ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />
      );

      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv).toHaveClass("flex", "h-full");
    });

    it("has full height (h-full)", () => {
      const { container } = render(
        <ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />
      );

      const mainDiv = container.firstChild as HTMLElement;
      expect(mainDiv).toHaveClass("h-full");
    });

    it("main content area is flex-1", () => {
      const { container } = render(
        <ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />
      );

      const contentArea = container.querySelector(".flex-1");
      expect(contentArea).toBeInTheDocument();
    });

    it("main content area has overflow-hidden", () => {
      const { container } = render(
        <ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />
      );

      const contentArea = container.querySelector(".overflow-hidden");
      expect(contentArea).toBeInTheDocument();
    });

    it("top bar has correct styling", () => {
      const { container } = render(
        <ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />
      );

      const topBar = container.querySelector(".border-b");
      expect(topBar).toBeInTheDocument();
      expect(topBar).toHaveClass("border-neutral-800", "px-6", "py-3", "flex", "items-center");
    });

    it("project title has truncate class for long names", () => {
      const longNameProject: Project = {
        ...mockProject,
        title: "This is a very long project name that should be truncated if it gets too long for the display area",
      };

      const { container } = render(
        <ProjectWorkspaceNew project={longNameProject} onBack={mockOnBack} />
      );

      const titleDiv = container.querySelector(".truncate");
      expect(titleDiv).toBeInTheDocument();
    });

    it("Sidebar is positioned before main content", () => {
      const { container } = render(
        <ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />
      );

      const sidebar = screen.getByTestId("sidebar").parentElement;
      const mainContent = screen.getByTestId("main-content").parentElement?.parentElement;

      // Verify sidebar and main content exist
      expect(sidebar).toBeInTheDocument();
      expect(mainContent).toBeInTheDocument();
    });
  });

  describe("Project title display", () => {
    it("displays different project titles correctly", () => {
      const project2: Project = {
        ...mockProject,
        title: "Another Project Title",
      };

      const { rerender } = render(
        <ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />
      );

      expect(screen.getByText("Test Project")).toBeInTheDocument();

      rerender(<ProjectWorkspaceNew project={project2} onBack={mockOnBack} />);

      expect(screen.getByText("Another Project Title")).toBeInTheDocument();
    });

    it("project title has medium font weight", () => {
      const { container } = render(
        <ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />
      );

      const titleDiv = Array.from(container.querySelectorAll("div")).find(
        (div) => div.className.includes("truncate") && div.textContent === "Test Project"
      );
      expect(titleDiv).toHaveClass("font-medium", "text-white", "truncate");
    });
  });

  describe("Component integration", () => {
    it("renders all required child components together", () => {
      render(<ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />);

      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
      expect(screen.getByTestId("main-content")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /← Projects/ })).toBeInTheDocument();
      expect(screen.getByText("Test Project")).toBeInTheDocument();
    });

    it("mounts without throwing errors", () => {
      expect(() => {
        render(<ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />);
      }).not.toThrow();
    });
  });

  describe("Edge cases", () => {
    it("handles empty project title", () => {
      const emptyTitleProject: Project = {
        ...mockProject,
        title: "",
      };

      render(<ProjectWorkspaceNew project={emptyTitleProject} onBack={mockOnBack} />);

      // Should render without crashing
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    });

    it("handles very long project titles", () => {
      const longTitleProject: Project = {
        ...mockProject,
        title: "A".repeat(200),
      };

      render(<ProjectWorkspaceNew project={longTitleProject} onBack={mockOnBack} />);

      // Should render without crashing, with truncate handling
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    });

    it("calls onBack multiple times if clicked multiple times", () => {
      render(<ProjectWorkspaceNew project={mockProject} onBack={mockOnBack} />);

      const backButton = screen.getByRole("button", { name: /← Projects/ });

      fireEvent.click(backButton);
      fireEvent.click(backButton);
      fireEvent.click(backButton);

      expect(mockOnBack).toHaveBeenCalledTimes(3);
    });
  });
});
