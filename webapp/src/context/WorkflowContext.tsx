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

  // Step 4 data (Assets)
  entities: [],

  // Step 4.5 data (Generated Images)
  generatedImages: [],

  // Step 5 data (Video)
  videoStatus: "pending",
  videoUrl: null,
  generationJobId: null,

  // Meta
  flowProjectId: null,
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
        loadingMessage: "Creating Flow project and generating screenplay...",
        error: null,
      });

      try {
        // 1. Create Flow project first
        let flowProjectId: string | null = null;
        try {
          const projectResponse = await fetch(`/api/flow/create-project`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: `Video Flow ${Date.now()}`,
            }),
          });

          if (projectResponse.ok) {
            const projectData = await projectResponse.json();
            flowProjectId = projectData.flow_project_id || projectData.project_id;
            console.log("Created Flow project:", flowProjectId);
          } else {
            console.warn("Failed to create Flow project:", projectResponse.statusText);
          }
        } catch (e) {
          console.error("Error creating Flow project:", e);
        }

        // 2. Generate screenplay
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

        const result = await apiClient.generateScreenplay(prompt, currentState.model, 120);
        const screenplay = result.screenplay;
        const parsedScenes = parseScenes(screenplay);

        setState((s) => ({
          ...s,
          flowProjectId,
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

    showScenes: () => {
      setState((s) => ({
        ...s,
        currentStep: 2.5 as any,
      }));
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

    extractAndGenerateAssets: async () => {
      const currentState = state;

      setState({
        ...currentState,
        loading: true,
        loadingMessage: "Extracting entities and generating asset references...",
        error: null,
      });

      try {
        // Extract unique entities from beats
        const entityMap = new Map<string, any>();
        const characterDescriptions: Record<string, string> = {};
        const locationDescriptions: Record<string, string> = {};
        const propDescriptions: Record<string, string> = {};

        currentState.beats.forEach((beat) => {
          beat.entities.forEach((entity) => {
            if (!entityMap.has(entity.name)) {
              entityMap.set(entity.name, {
                name: entity.name,
                type: entity.type as "character" | "location" | "prop",
                description: entity.description,
              });

              if (entity.type === "character") {
                characterDescriptions[entity.name] = entity.description;
              } else if (entity.type === "location") {
                locationDescriptions[entity.name] = entity.description;
              } else if (entity.type === "prop") {
                propDescriptions[entity.name] = entity.description;
              }
            }
          });
        });

        // Convert to array and create ref prompts
        const entities = Array.from(entityMap.values()).map((e, idx) => {
          let ref_prompt = "";

          if (e.type === "character") {
            ref_prompt = `Character reference sheet: ${e.name}. ${e.description}. Create a full character design with:
- Full body front view
- Turnaround angles (front, 3/4, side, back)
- Facial expressions (neutral, happy, sad, angry)
- Detailed costume and distinctive features
All on plain white background, professional character design sheet.`;
          } else if (e.type === "location") {
            ref_prompt = `Location reference sheet: ${e.name}. ${e.description}. Create establishing shots showing:
- Wide establishing view
- Reverse angle view
- Overhead/bird's eye view
- Close detail view
As a 2x2 grid showing the same location from 4 camera angles, consistent architecture and lighting.`;
          } else if (e.type === "prop") {
            ref_prompt = `Prop design sheet: ${e.name}. ${e.description}. Create multiple angles showing:
- Front view
- 3/4 angle
- Side view
- Top-down view
Studio lighting, isolated on white background, professional product reference sheet.`;
          }

          return {
            id: `entity-${idx}`,
            name: e.name,
            type: e.type,
            description: e.description,
            ref_prompt,
          };
        });

        setState((s) => ({
          ...s,
          entities,
          loading: false,
          currentStep: 4,
        }));
      } catch (error: any) {
        setState((s) => ({
          ...s,
          loading: false,
          error: error.message || "Failed to extract and generate assets",
        }));
      }
    },

    approveStoryboard: async () => {
      const currentState = state;

      setState({
        ...currentState,
        loading: true,
        loadingMessage: "Generating and enhancing image prompts...",
        error: null,
      });

      try {
        const result = await apiClient.generateImages(
          currentState.beats,
          currentState.model,
          currentState.flowProjectId
        );

        setState((s) => ({
          ...s,
          generatedImages: result.images,
          generationJobId: result.jobId,
          loading: false,
          currentStep: 4.5 as any,
        }));
      } catch (error: any) {
        setState((s) => ({
          ...s,
          loading: false,
          error: error.message || "Failed to generate images",
        }));
      }
    },

    proceedToVideo: () => {
      setState((s) => ({
        ...s,
        videoStatus: "generating",
        currentStep: 5,
      }));
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
