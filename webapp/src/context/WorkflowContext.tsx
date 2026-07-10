import React, { createContext, useContext, useState, ReactNode } from "react";
import type { WorkflowState, WorkflowActions, WorkflowStep, Beat, Scene } from "../types/workflow";
import * as apiClient from "../api/client";
import type { Project } from "../api/client";

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
  model: "claude-opus-4-8",
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

function getInitialState(project?: Project): WorkflowState {
  if (!project) return initialState;

  // Pre-fill from project data
  const screenplay = project.script_raw || "";
  const scenes = screenplay ? parseScenes(screenplay) : [];

  return {
    // Step 1 inputs (from project)
    idea: project.idea || "",
    style: project.style || "",
    duration: project.target_duration ? Math.round(project.target_duration / 1000) : 120, // convert ms to seconds
    model: project.video_model || project.image_model || "claude-3-5-sonnet-20241022",
    language: project.script_lang || "English",
    customPromptHeader: "",

    // Step 2 data (from project)
    screenplayRaw: screenplay,
    scenes: scenes,

    // Step 3 data (empty, will be generated or loaded separately)
    beats: [],
    editedBeatIds: new Set(),

    // Step 4 data
    videoStatus: "pending",
    videoUrl: null,
    generationJobId: null,

    // Meta
    currentStep: screenplay ? 2 : 1, // If screenplay exists, start at Step 2
    loading: false,
    error: null,
    loadingMessage: "",
  };
}

interface WorkflowContextType {
  state: WorkflowState;
  actions: WorkflowActions;
}

const WorkflowCtx = createContext<WorkflowContextType | null>(null);

interface WorkflowProviderProps {
  children: ReactNode;
  initialProject?: Project;
}

export function WorkflowProvider({ children, initialProject }: WorkflowProviderProps) {
  const [state, setState] = useState<WorkflowState>(() => getInitialState(initialProject));

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
      const currentState = state;

      setState({
        ...currentState,
        loading: true,
        loadingMessage: "Generating screenplay...",
        error: null,
      });

      // Build prompt from step 1 inputs
      const shotCount = Math.ceil(currentState.duration / 8);
      const wordEstimate = Math.ceil(currentState.duration * 5);

      const prompt = `You are a professional screenwriter. Write a screenplay in FOUNTAIN format.

WRITE THE SCREENPLAY IN ${currentState.language}: all action lines must be in ${currentState.language}

TARGET DURATION: ${currentState.duration}s (≈ ${shotCount} shots, ≈ ${wordEstimate} words)

IDEA / CONTENT: ${currentState.idea}

STYLE / TONE: ${currentState.style}

${currentState.customPromptHeader ? currentState.customPromptHeader + "\n" : ""}

Follow FOUNTAIN format: scene headings (INT./EXT. LOCATION - TIME), action, dialogue.

Output ONLY the screenplay in FOUNTAIN format, no introduction or explanation.`;

      try {
        const result = await apiClient.generateScreenplay(prompt, currentState.model, 120);
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
      const currentState = state;

      setState({
        ...currentState,
        loading: true,
        loadingMessage: "Generating storyboard...",
        error: null,
      });

      try {
        const result = await apiClient.generateBeats(
          currentState.screenplayRaw,
          currentState.scenes,
          currentState.model,
          120,
          currentState.language
        );

        // Convert API beats to Beat type
        const beats = result.beats.map((b: any) => ({
          id: `beat-${Math.random().toString(36).substring(7)}`,
          sceneHeading: b.description?.split('\n')[0] || `Scene ${result.beats.indexOf(b) + 1}`,
          description: b.description || "",
          entities: (b.ref_entity_names || []).map((name: string) => ({
            name,
            type: "unknown",
            description: ""
          })),
          shotPrompts: b.visual_prompt || b.shotPrompts || "",
          motionHints: b.motion_prompt || b.motionHints || "",
          voiceover: b.text || b.voiceover || "",
        }));

        setState((s) => ({
          ...s,
          beats,
          editedBeatIds: new Set(),
          loading: false,
          currentStep: 3,
        }));
      } catch (error: any) {
        setState((s) => ({
          ...s,
          loading: false,
          error: error.message || "Failed to generate storyboard",
        }));
      }
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
      const currentState = state;

      setState({
        ...currentState,
        loading: true,
        loadingMessage: "Starting image generation...",
        error: null,
      });

      try {
        const result = await apiClient.generateImages(currentState.beats, currentState.model);

        setState((s) => ({
          ...s,
          generationJobId: result.jobId,
          videoStatus: "generating",
          loading: false,
          currentStep: 4,
        }));
      } catch (error: any) {
        setState((s) => ({
          ...s,
          loading: false,
          error: error.message || "Failed to start image generation",
        }));
      }
    },

    goToStep: (step: WorkflowStep) => {
      setState((s) => ({ ...s, currentStep: step }));
    },

    pollVideoStatus: async () => {
      if (!state.generationJobId) return;

      try {
        const result = await apiClient.getVideoStatus(state.generationJobId!);

        setState((s) => ({
          ...s,
          videoStatus: result.status,
          videoUrl: result.videoUrl || null,
          error: result.error || null,
        }));
      } catch (error: any) {
        setState((s) => ({
          ...s,
          error: error.message || "Failed to check video status",
        }));
      }
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
