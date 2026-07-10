import React, { createContext, useContext, useState, ReactNode } from "react";
import type { WorkflowState, WorkflowActions, WorkflowStep, Beat, Scene } from "../types/workflow";
import { generateScreenplay as apiGenerateScreenplay } from "../api/client";

// Helper: Parse scenes from FOUNTAIN format screenplay
function parseScenes(screenplay: string): Scene[] {
  const scenes: Scene[] = [];
  // ponytail: simple scene parser splits on FOUNTAIN scene headings (INT./EXT.)
  const lines = screenplay.split("\n");
  let currentHeading = "";
  let currentBody = "";

  for (const line of lines) {
    const trimmed = line.trim();
    // FOUNTAIN scene heading: starts with INT. or EXT., ends with - TIME
    if (/^(INT\.|EXT\.|INTR\.|EXTR\.)/i.test(trimmed) && trimmed.includes("-")) {
      // Save previous scene if exists
      if (currentHeading) {
        scenes.push({
          heading: currentHeading,
          body: currentBody.trim(),
        });
      }
      currentHeading = trimmed;
      currentBody = "";
    } else if (currentHeading) {
      // Accumulate body lines
      currentBody += (currentBody ? "\n" : "") + line;
    }
  }

  // Save final scene
  if (currentHeading) {
    scenes.push({
      heading: currentHeading,
      body: currentBody.trim(),
    });
  }

  return scenes;
}

const initialState: WorkflowState = {
  // Step 1 inputs
  idea: "",
  style: "",
  duration: 120,
  model: "claude-3-5-sonnet-20241022",
  language: "English",
  customPromptHeader: "",

  // Step 2 data
  screenplayRaw: "",
  scenes: [],

  // Step 3 data
  beats: [],
  editedBeatIds: new Set(),

  // Step 4 data
  videoStatus: "pending",
  videoUrl: null,
  generationJobId: null,

  // Meta
  currentStep: 1,
  loading: false,
  error: null,
  loadingMessage: "",
};

interface WorkflowContextType {
  state: WorkflowState;
  actions: WorkflowActions;
}

const WorkflowCtx = createContext<WorkflowContextType | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkflowState>(initialState);

  const actions: WorkflowActions = {
    setIdea: (idea: string) => {
      setState((s) => ({ ...s, idea }));
    },

    setStyle: (style: string) => {
      setState((s) => ({ ...s, style }));
    },

    setDuration: (duration: number) => {
      setState((s) => ({ ...s, duration }));
    },

    setModel: (model: string) => {
      setState((s) => ({ ...s, model }));
    },

    setLanguage: (language: string) => {
      setState((s) => ({ ...s, language }));
    },

    setCustomPromptHeader: (header: string) => {
      setState((s) => ({ ...s, customPromptHeader: header }));
    },

    generateScreenplay: async () => {
      let capturedState: WorkflowState | null = null;

      // Capture current state before async operations
      setState((s) => {
        capturedState = s;
        return {
          ...s,
          loading: true,
          loadingMessage: "Generating screenplay...",
          error: null,
        };
      });

      if (!capturedState) return;

      // Build prompt from step 1 inputs
      const shotCount = Math.ceil(capturedState.duration / 8);
      const wordEstimate = Math.ceil(capturedState.duration * 5);

      const prompt = `You are a professional screenwriter. Write a screenplay in FOUNTAIN format.

WRITE THE SCREENPLAY IN ${capturedState.language}: all action lines must be in ${capturedState.language}

TARGET DURATION: ${capturedState.duration}s (≈ ${shotCount} shots, ≈ ${wordEstimate} words)

IDEA / CONTENT: ${capturedState.idea}

STYLE / TONE: ${capturedState.style}

${capturedState.customPromptHeader ? capturedState.customPromptHeader + "\n" : ""}

Follow FOUNTAIN format: scene headings (INT./EXT. LOCATION - TIME), action, dialogue.

Output ONLY the screenplay in FOUNTAIN format, no introduction or explanation.`;

      try {
        const result = await apiGenerateScreenplay(prompt, capturedState.model, 120);
        const screenplay = result.screenplay;
        const parsedScenes = parseScenes(screenplay);

        setState((s) => ({
          ...s,
          screenplayRaw: screenplay,
          scenes: parsedScenes,
          loading: false,
          currentStep: 2,
        }));
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error generating screenplay";
        setState((s) => ({
          ...s,
          loading: false,
          error: errorMessage,
        }));
      }
    },

    approveScreenplay: async () => {
      setState((s) => ({ ...s, currentStep: 3 }));
    },

    redoScreenplay: () => {
      setState((s) => ({
        ...s,
        screenplayRaw: "",
        scenes: [],
        currentStep: 1,
      }));
    },

    updateBeat: (beatId: string, updates: Partial<Beat>) => {
      setState((s) => ({
        ...s,
        beats: s.beats.map((b) => (b.id === beatId ? { ...b, ...updates } : b)),
        editedBeatIds: new Set([...s.editedBeatIds, beatId]),
      }));
    },

    redoAllBeats: async () => {
      setState((s) => ({
        ...s,
        beats: [],
        editedBeatIds: new Set(),
        currentStep: 2,
      }));
    },

    approveStoryboard: async () => {
      setState((s) => ({
        ...s,
        currentStep: 4,
        videoStatus: "generating",
      }));
    },

    goToStep: (step: WorkflowStep) => {
      setState((s) => ({ ...s, currentStep: step }));
    },

    pollVideoStatus: async () => {
      // ponytail: stub, will be implemented when wired to real API
    },

    setError: (error: string | null) => {
      setState((s) => ({ ...s, error }));
    },

    resetWorkflow: () => {
      setState(initialState);
    },
  };

  return (
    <WorkflowCtx.Provider value={{ state, actions }}>
      {children}
    </WorkflowCtx.Provider>
  );
}

export function useWorkflow() {
  const ctx = useContext(WorkflowCtx);
  if (!ctx) {
    throw new Error("useWorkflow must be used within WorkflowProvider");
  }
  return ctx;
}
