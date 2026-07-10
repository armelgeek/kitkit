import React, { createContext, useContext, useState, ReactNode } from "react";
import type { WorkflowState, WorkflowActions, WorkflowStep, Beat } from "../types/workflow";

const initialState: WorkflowState = {
  // Step 1 inputs
  idea: "",
  style: "",
  duration: 120,
  model: "claude-3-5-sonnet",
  language: "en",
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
      setState((s) => ({
        ...s,
        loading: true,
        loadingMessage: "Generating screenplay...",
      }));
      // ponytail: mock implementation, calls real API endpoint when wired
      const mockScreenplay = "INT. COFFEE SHOP - DAY\n\nA barista prepares coffee.";
      setState((s) => ({
        ...s,
        screenplayRaw: mockScreenplay,
        loading: false,
        currentStep: 2,
      }));
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
