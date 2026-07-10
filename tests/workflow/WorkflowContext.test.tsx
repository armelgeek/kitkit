import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { WorkflowProvider, useWorkflow } from "../../webapp/src/context/WorkflowContext";
import * as apiClient from "../../webapp/src/api/client";

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
      expect(result.current.state.model).toBe("claude-3-5-sonnet");
      expect(result.current.state.language).toBe("en");
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

      expect(result.current.state.currentStep).toBe(1);

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      expect(result.current.state.currentStep).toBe(2);
      expect(result.current.state.screenplayRaw).not.toBe("");
      expect(result.current.state.loading).toBe(false);
    });

    it("approveScreenplay calls beats API with screenplay and scenes", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      const mockBeats = [
        {
          heading: "INT. ROOM",
          description: "A character wakes up",
          entities: [],
          shotPrompts: "Wide shot",
          motionHints: "slow pan",
          voiceover: "Morning light",
        },
      ];

      // First mock generateScreenplay to set up state with screenplay data
      vi.spyOn(apiClient, "generateScreenplay").mockResolvedValue({
        screenplay: "INT. ROOM - MORNING\n\nA character wakes up.",
      });

      const generateBeatsSpy = vi
        .spyOn(apiClient, "generateBeats")
        .mockResolvedValue({ beats: mockBeats });

      // Generate screenplay first to populate state
      act(() => {
        result.current.actions.setIdea("Test idea");
      });

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      expect(result.current.state.screenplayRaw).not.toBe("");

      // Now test approveScreenplay
      await act(async () => {
        await result.current.actions.approveScreenplay();
      });

      // Verify beats API was called
      expect(generateBeatsSpy).toHaveBeenCalledWith(
        result.current.state.screenplayRaw,
        result.current.state.scenes,
        result.current.state.model
      );

      vi.mocked(apiClient.generateScreenplay).mockRestore();
      generateBeatsSpy.mockRestore();
    });

    it("approveScreenplay converts API beats to Beat type correctly", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      const mockApiBeats = [
        {
          heading: "INT. ROOM",
          description: "A character wakes up",
          entities: [{ name: "Character", type: "person", description: "Main actor" }],
          shotPrompts: "Wide shot of room",
          motionHints: "slow camera pan",
          voiceover: "Good morning",
        },
        {
          sceneHeading: "INT. KITCHEN",
          description: "Making breakfast",
          entities: [],
          shotPrompts: "Close up of coffee",
          motionHints: "focus shift",
          voiceover: "Time for coffee",
        },
      ];

      vi.spyOn(apiClient, "generateScreenplay").mockResolvedValue({
        screenplay: "INT. ROOM - MORNING\n\nA character wakes up.\n\nINT. KITCHEN - CONTINUOUS\n\nMaking breakfast.",
      });

      vi.spyOn(apiClient, "generateBeats").mockResolvedValue({ beats: mockApiBeats });

      // Generate screenplay first
      act(() => {
        result.current.actions.setIdea("Test idea");
      });

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      // Call approveScreenplay to test beat conversion
      await act(async () => {
        await result.current.actions.approveScreenplay();
      });

      // Verify beats were converted correctly
      expect(result.current.state.beats).toHaveLength(2);
      expect(result.current.state.beats[0].sceneHeading).toBe("INT. ROOM");
      expect(result.current.state.beats[0].description).toBe("A character wakes up");
      expect(result.current.state.beats[0].entities).toEqual([
        { name: "Character", type: "person", description: "Main actor" },
      ]);
      expect(result.current.state.beats[1].sceneHeading).toBe("INT. KITCHEN");
      expect(result.current.state.beats[1].voiceover).toBe("Time for coffee");

      vi.mocked(apiClient.generateScreenplay).mockRestore();
      vi.mocked(apiClient.generateBeats).mockRestore();
    });

    it("approveScreenplay advances from step 2 to step 3", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      vi.spyOn(apiClient, "generateScreenplay").mockResolvedValue({
        screenplay: "INT. ROOM - MORNING\n\nTest scene.",
      });

      vi.spyOn(apiClient, "generateBeats").mockResolvedValue({
        beats: [
          {
            heading: "INT. ROOM",
            description: "Test scene",
            entities: [],
            shotPrompts: "Wide shot",
            motionHints: "",
            voiceover: "",
          },
        ],
      });

      // Setup: generate screenplay first to populate state
      act(() => {
        result.current.actions.setIdea("Test idea");
      });

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      expect(result.current.state.currentStep).toBe(2);

      await act(async () => {
        await result.current.actions.approveScreenplay();
      });

      expect(result.current.state.currentStep).toBe(3);

      vi.mocked(apiClient.generateScreenplay).mockRestore();
      vi.mocked(apiClient.generateBeats).mockRestore();
    });

    it("approveScreenplay sets error on API failure", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      vi.spyOn(apiClient, "generateScreenplay").mockResolvedValue({
        screenplay: "INT. ROOM - MORNING\n\nTest scene.",
      });

      const errorMessage = "Network error while generating beats";
      vi.spyOn(apiClient, "generateBeats").mockRejectedValue(
        new Error(errorMessage)
      );

      // Setup: generate screenplay first
      act(() => {
        result.current.actions.setIdea("Test idea");
      });

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      await act(async () => {
        await result.current.actions.approveScreenplay();
      });

      expect(result.current.state.error).toBe(errorMessage);
      expect(result.current.state.currentStep).toBe(2); // Should stay on step 2
      expect(result.current.state.loading).toBe(false);

      vi.mocked(apiClient.generateScreenplay).mockRestore();
      vi.mocked(apiClient.generateBeats).mockRestore();
    });

    it("approveScreenplay clears edited beat IDs after generation", async () => {
      const { result } = renderHook(() => useWorkflow(), { wrapper });

      const mockBeats = [
        {
          heading: "INT. ROOM",
          description: "Test scene",
          entities: [],
          shotPrompts: "Wide shot",
          motionHints: "",
          voiceover: "",
        },
      ];

      vi.spyOn(apiClient, "generateScreenplay").mockResolvedValue({
        screenplay: "INT. ROOM - MORNING\n\nTest scene.",
      });

      vi.spyOn(apiClient, "generateBeats").mockResolvedValue({ beats: mockBeats });

      // Setup: generate screenplay first
      act(() => {
        result.current.actions.setIdea("Test idea");
      });

      await act(async () => {
        await result.current.actions.generateScreenplay();
      });

      // Pre-populate editedBeatIds (simulating prior edits)
      act(() => {
        result.current.actions.updateBeat("beat-old-1", {
          id: "beat-old-1",
          sceneHeading: "OLD INT. ROOM",
          description: "Old scene",
          entities: [],
          shotPrompts: "Old shot",
          motionHints: "",
          voiceover: "",
        });
      });

      expect(result.current.state.editedBeatIds.size).toBeGreaterThan(0);

      await act(async () => {
        await result.current.actions.approveScreenplay();
      });

      expect(result.current.state.editedBeatIds.size).toBe(0);

      vi.mocked(apiClient.generateScreenplay).mockRestore();
      vi.mocked(apiClient.generateBeats).mockRestore();
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
});
