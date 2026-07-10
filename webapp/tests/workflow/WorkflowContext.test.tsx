import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { WorkflowProvider, useWorkflow } from "../../src/context/WorkflowContext";
import * as apiClient from "../../src/api/client";

describe("WorkflowContext", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(WorkflowProvider, {}, children)
  );

  describe("Initial state", () => {
    it("should have default values", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      expect(result.current.state.currentStep).toBe(1);
      expect(result.current.state.idea).toBe("");
      expect(result.current.state.style).toBe("");
      expect(result.current.state.duration).toBe(120);
      expect(result.current.state.model).toBe("claude-3-5-sonnet-20241022");
      expect(result.current.state.language).toBe("English");
      expect(result.current.state.customPromptHeader).toBe("");
      expect(result.current.state.screenplayRaw).toBe("");
      expect(result.current.state.scenes).toEqual([]);
      expect(result.current.state.beats).toEqual([]);
      expect(result.current.state.videoStatus).toBe("pending");
      expect(result.current.state.videoUrl).toBe(null);
      expect(result.current.state.generationJobId).toBe(null);
      expect(result.current.state.loading).toBe(false);
      expect(result.current.state.error).toBe(null);
      expect(result.current.state.loadingMessage).toBe("");
    });
  });

  describe("State mutations", () => {
    it("setIdea updates idea", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      act(() => {
        result.current.actions.setIdea("A story about space");
      });

      expect(result.current.state.idea).toBe("A story about space");
    });

    it("setStyle updates style", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      act(() => {
        result.current.actions.setStyle("cinematic");
      });

      expect(result.current.state.style).toBe("cinematic");
    });

    it("setDuration updates duration", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      act(() => {
        result.current.actions.setDuration(180);
      });

      expect(result.current.state.duration).toBe(180);
    });

    it("setModel updates model", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      act(() => {
        result.current.actions.setModel("claude-3-opus");
      });

      expect(result.current.state.model).toBe("claude-3-opus");
    });

    it("setLanguage updates language", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      act(() => {
        result.current.actions.setLanguage("fr");
      });

      expect(result.current.state.language).toBe("fr");
    });

    it("setCustomPromptHeader updates customPromptHeader", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      act(() => {
        result.current.actions.setCustomPromptHeader("Custom header text");
      });

      expect(result.current.state.customPromptHeader).toBe("Custom header text");
    });
  });

  describe("Step navigation", () => {
    it("goToStep changes currentStep", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      act(() => {
        result.current.actions.goToStep(2);
      });

      expect(result.current.state.currentStep).toBe(2);

      act(() => {
        result.current.actions.goToStep(3);
      });

      expect(result.current.state.currentStep).toBe(3);

      act(() => {
        result.current.actions.goToStep(4);
      });

      expect(result.current.state.currentStep).toBe(4);
    });

    it("goToStep works for all valid steps", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      const steps: [1, 2, 3, 4] = [1, 2, 3, 4];
      for (const step of steps) {
        act(() => {
          result.current.actions.goToStep(step);
        });
        expect(result.current.state.currentStep).toBe(step);
      }
    });
  });

  describe("Workflow transitions", () => {
    it("generateScreenplay sets loading and advances to step 2", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });
      const mockScreenplay = "INT. COFFEE SHOP - DAY\n\nA barista prepares coffee.";

      vi.spyOn(apiClient, "generateScreenplay").mockResolvedValue({
        screenplay: mockScreenplay,
      });

      expect(result.current.state.currentStep).toBe(1);

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      expect(result.current.state.currentStep).toBe(2);
      expect(result.current.state.screenplayRaw).not.toBe("");
      expect(result.current.state.loading).toBe(false);
    });

    it("approveScreenplay advances from step 2 to step 3", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      // Setup: go to step 2 first
      act(() => {
        result.current.actions.goToStep(2);
      });

      await act(async () => {
        await result.current.actions.approveScreenplay();
      });

      expect(result.current.state.currentStep).toBe(3);
    });

    it("approveStoryboard advances from step 3 to step 4 and sets videoStatus", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      // Setup: go to step 3 first
      act(() => {
        result.current.actions.goToStep(3);
      });

      expect(result.current.state.videoStatus).toBe("pending");

      await act(async () => {
        await result.current.actions.approveStoryboard();
      });

      expect(result.current.state.currentStep).toBe(4);
      expect(result.current.state.videoStatus).toBe("generating");
    });
  });

  describe("Reset workflow", () => {
    it("resetWorkflow returns to initial state", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      // Modify state
      act(() => {
        result.current.actions.setIdea("Test idea");
        result.current.actions.setStyle("dramatic");
        result.current.actions.setDuration(300);
        result.current.actions.goToStep(3);
      });

      // Verify changes
      expect(result.current.state.idea).toBe("Test idea");
      expect(result.current.state.style).toBe("dramatic");
      expect(result.current.state.duration).toBe(300);
      expect(result.current.state.currentStep).toBe(3);

      // Reset
      act(() => {
        result.current.actions.resetWorkflow();
      });

      // Verify initial state restored
      expect(result.current.state.idea).toBe("");
      expect(result.current.state.style).toBe("");
      expect(result.current.state.duration).toBe(120);
      expect(result.current.state.currentStep).toBe(1);
      expect(result.current.state.loading).toBe(false);
      expect(result.current.state.error).toBe(null);
    });
  });

  describe("Error handling", () => {
    it("setError updates error state", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      act(() => {
        result.current.actions.setError("Something went wrong");
      });

      expect(result.current.state.error).toBe("Something went wrong");

      act(() => {
        result.current.actions.setError(null);
      });

      expect(result.current.state.error).toBe(null);
    });

    it("useWorkflow throws when used outside provider", () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = () => {};

      expect(() => {
        renderHook(() => useWorkflow());
      }).toThrow("useWorkflow must be used within WorkflowProvider");

      console.error = originalError;
    });
  });

  describe("Beat management", () => {
    it("updateBeat modifies beat and tracks edited IDs", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      const beatId = "beat-1";
      act(() => {
        result.current.actions.updateBeat(beatId, {
          id: beatId,
          sceneHeading: "INT. ROOM",
          description: "Test",
          entities: [],
          shotPrompts: "Test shot",
          motionHints: "",
          voiceover: "",
        });
      });

      expect(result.current.state.editedBeatIds.has(beatId)).toBe(true);
    });

    it("redoAllBeats clears beats and edited IDs", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      // Setup beats
      act(() => {
        result.current.actions.updateBeat("beat-1", {
          id: "beat-1",
          sceneHeading: "INT. ROOM",
          description: "Test",
          entities: [],
          shotPrompts: "Test",
          motionHints: "",
          voiceover: "",
        });
      });

      expect(result.current.state.editedBeatIds.size).toBeGreaterThan(0);

      await act(async () => {
        await result.current.actions.redoAllBeats();
      });

      expect(result.current.state.beats).toEqual([]);
      expect(result.current.state.editedBeatIds.size).toBe(0);
      expect(result.current.state.currentStep).toBe(2);
    });
  });

  describe("Redo screenplay", () => {
    it("redoScreenplay clears screenplay and goes back to step 1", () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      // Setup
      act(() => {
        result.current.actions.goToStep(2);
        result.current.actions.setIdea("Test idea");
      });

      expect(result.current.state.screenplayRaw).toBe("");

      // Manually set screenplay for testing
      act(() => {
        result.current.actions.redoScreenplay();
      });

      expect(result.current.state.screenplayRaw).toBe("");
      expect(result.current.state.scenes).toEqual([]);
      expect(result.current.state.currentStep).toBe(1);
    });
  });

  describe("Screenplay generation API integration", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("generateScreenplay advances to step 2 on success", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });
      const mockScreenplay = "INT. COFFEE SHOP - DAY\n\nA barista prepares coffee.";

      vi.spyOn(apiClient, "generateScreenplay").mockResolvedValue({
        screenplay: mockScreenplay,
      });

      expect(result.current.state.currentStep).toBe(1);

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      expect(result.current.state.currentStep).toBe(2);
      expect(result.current.state.loading).toBe(false);
    });

    it("generateScreenplay sets error on API failure", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });
      const errorMessage = "API call failed";

      vi.spyOn(apiClient, "generateScreenplay").mockRejectedValue(
        new Error(errorMessage)
      );

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      expect(result.current.state.error).toBe(errorMessage);
      expect(result.current.state.currentStep).toBe(1);
      expect(result.current.state.loading).toBe(false);
    });

    it("generateScreenplay stores screenplay and parses scenes", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });
      const mockScreenplay = `INT. COFFEE SHOP - DAY

A barista prepares coffee.

EXT. STREET - MORNING

People walk by.

INT. APARTMENT - NIGHT

A person writes in a journal.`;

      vi.spyOn(apiClient, "generateScreenplay").mockResolvedValue({
        screenplay: mockScreenplay,
      });

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      expect(result.current.state.screenplayRaw).toBe(mockScreenplay);
      expect(result.current.state.scenes.length).toBeGreaterThan(0);
      expect(result.current.state.scenes[0].heading).toContain("INT. COFFEE SHOP");
      expect(result.current.state.scenes[0].body).toContain("barista");
    });

    it("generateScreenplay clears previous error", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });
      const mockScreenplay = "INT. COFFEE SHOP - DAY\n\nA barista prepares coffee.";

      // Set initial error
      act(() => {
        result.current.actions.setError("Previous error");
      });

      expect(result.current.state.error).toBe("Previous error");

      vi.spyOn(apiClient, "generateScreenplay").mockResolvedValue({
        screenplay: mockScreenplay,
      });

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      expect(result.current.state.error).toBeNull();
    });

    it("generateScreenplay parses multiple scenes from FOUNTAIN format", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });
      const mockScreenplay = `INT. OFFICE - DAY
A professional at a desk.

EXT. PARK - SUNSET
Children playing.`;

      vi.spyOn(apiClient, "generateScreenplay").mockResolvedValue({
        screenplay: mockScreenplay,
      });

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      // Verify multiple scenes are parsed correctly
      expect(result.current.state.scenes.length).toBe(2);
      expect(result.current.state.scenes[0].heading).toContain("OFFICE");
      expect(result.current.state.scenes[1].heading).toContain("PARK");
    });
  });
});
