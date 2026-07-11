import React, { createContext, useContext, useState, ReactNode } from "react";
import type { WorkflowState, WorkflowActions, WorkflowStep, Beat, Scene } from "../types/workflow";
import * as apiClient from "../api/client";
import type { Project } from "../api/client";

// Extract character names from screenplay (FOUNTAIN format dialogue)
function extractCharacters(screenplay: string): Array<{ name: string; description: string }> {
  const chars = new Map<string, boolean>();
  const lines = screenplay.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // FOUNTAIN character line: all caps, no special formatting
    if (trimmed && /^[A-Z][A-Z\s\-']*$/.test(trimmed) && trimmed.length < 50) {
      chars.set(trimmed, true);
    }
  }

  return Array.from(chars.keys())
    .filter(name => name.length > 1)
    .map(name => ({
      name: name.trim(),
      description: `Character: ${name}`,
    }));
}

// Generate style prefix for prompts (like material.scenePrefix)
function getStylePrefix(style: string): string {
  const prefixes: Record<string, string> = {
    "realistic": "Photorealistic, professional cinematography, studio lighting, high detail, sharp focus.",
    "anime": "Anime style, vibrant colors, expressive features, dramatic lighting, detailed backgrounds.",
    "3d pixar": "3D CGI Pixar style, smooth shading, warm color palette, cinematic lighting, detailed textures.",
    "stop motion": "Stop-motion style, tactile textures, practical lighting, handcrafted aesthetic, rich colors.",
    "minecraft": "Minecraft voxel style, blocky geometry, bright solid colors, low-poly aesthetic.",
    "oil painting": "Oil painting style, thick brushstrokes, artistic composition, soft lighting, muted tones.",
  };

  const normalized = style.toLowerCase();
  for (const [key, value] of Object.entries(prefixes)) {
    if (normalized.includes(key.toLowerCase())) {
      return value;
    }
  }

  return `${style} style.`;
}

// Extract location names from FOUNTAIN headings (INT./EXT. LOCATION - TIME)
function extractLocations(screenplay: string): Array<{ name: string; description: string }> {
  const locs = new Map<string, boolean>();
  const lines = screenplay.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // FOUNTAIN scene heading: INT./EXT. LOCATION - TIME
    if (/^(INT\.|EXT\.|INTR\.|EXTR\.)/i.test(trimmed) && trimmed.includes("-")) {
      const parts = trimmed.split("-");
      if (parts.length > 0) {
        const location = parts[0].replace(/^(INT\.|EXT\.|INTR\.|EXTR\.)/i, "").trim();
        if (location.length > 1) {
          locs.set(location, true);
        }
      }
    }
  }

  return Array.from(locs.keys()).map(name => ({
    name: name.trim(),
    description: `Location: ${name}`,
  }));
}

// Extract props from screenplay (simple heuristic: words in parentheses/action descriptions)
function extractProps(screenplay: string): Array<{ name: string; description: string }> {
  const props = new Map<string, boolean>();
  const propPattern = /\(([a-zA-Z\s\-]+)\)/g;

  let match;
  while ((match = propPattern.exec(screenplay)) !== null) {
    const prop = match[1].trim();
    if (prop.length > 1 && prop.length < 50 && !/^[A-Z][A-Z\s]*$/.test(prop)) {
      props.set(prop, true);
    }
  }

  return Array.from(props.keys()).map(name => ({
    name: name.trim(),
    description: `Prop: ${name}`,
  }));
}

// Fast character matching per beat (Option 1)
function quickMatchCharactersByBeat(
  beats: any[],
  characters: Array<{ name: string }>
): Array<{ beat_index: number; character_names: string[] }> {
  return beats.map((beat, idx) => {
    const beatText = `${beat.description} ${beat.shotPrompts}`.toLowerCase();
    const matched = characters.filter(char =>
      beatText.includes(char.name.toLowerCase())
    );
    return {
      beat_index: idx,
      character_names: matched.map(c => c.name),
    };
  });
}

// AI enrichment for unidentified beats (Option 2)
async function aiEnrichCharactersByBeat(
  unidentifiedBeats: any[],
  allBeats: any[],
  characters: Array<{ name: string; description: string }>,
  model: string
): Promise<Array<{ beat_index: number; character_names: string[] }>> {
  const beatDescriptions = unidentifiedBeats
    .map(
      (b) =>
        `Beat ${b.beat_index}: ${b.description}\nVisual Prompt: ${b.shotPrompts}`
    )
    .join("\n\n");

  const charList = characters.map((c) => `- ${c.name}: ${c.description}`).join("\n");

  const prompt = `For each beat, identify which characters appear based on the descriptions:

Available characters:
${charList}

Beats:
${beatDescriptions}

Return ONLY JSON: {
  "beat_characters": [
    {"beat_index": 0, "character_names": ["CharName1", "CharName2"]},
    ...
  ]
}`;

  try {
    const response = await fetch(`/api/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: "claude",
        prompt: prompt,
        model: model,
        timeout: 30,
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (!data.ok || !data.stdout) return [];

    const jsonMatch = data.stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.beat_characters || [];
  } catch (err) {
    console.warn("AI enrichment failed:", err);
    return [];
  }
}

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
  aspect_ratio: "VIDEO_ASPECT_RATIO_LANDSCAPE",
  customPromptHeader: "",

  // Step 2 data
  screenplayRaw: "",
  scenes: [],

  // Step 3 data
  beats: [],
  editedBeatIds: new Set(),

  // Step 3.5 data (Characters, Locations, Props)
  characters: [],
  locations: [],
  props: [],

  // Step 4 data (Assets)
  entities: [],

  // Step 4.5 data (Generated Images)
  generatedImages: [],

  // Step 5 data (Video)
  videoStatus: "pending",
  videoUrl: null,
  generationJobId: null,

  // Meta
  projectId: null,
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
    aspect_ratio: project.aspect_ratio || "VIDEO_ASPECT_RATIO_LANDSCAPE",
    customPromptHeader: project.prompt_header || "",

    // Step 2 data (from project)
    screenplayRaw: screenplay,
    scenes: scenes,

    // Step 3 data
    beats: [],
    editedBeatIds: new Set(),

    // Step 3.5 data (Characters, Locations, Props)
    characters: [],
    locations: [],
    props: [],

    // Step 4 data (Assets)
    entities: [],

    // Step 4.5 data (Generated Images)
    generatedImages: [],

    // Step 5 data (Video)
    videoStatus: "pending",
    videoUrl: null,
    generationJobId: null,

    // Meta
    projectId: project.id || null,
    flowProjectId: project.flow_project_id || null,
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
  const stateRef = React.useRef(state);

  // Keep ref in sync with state
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Auto-trigger approveScreenplay when projectId is set (ponytail: skip if beats exist = already done)
  React.useEffect(() => {
    if (state.projectId && state.screenplayRaw && !state.loading && state.currentStep === 2 && state.beats.length === 0) {
      console.log("Provider: Auto-triggering approveScreenplay, projectId:", state.projectId);
      // Schedule for next tick so state is fully synced
      setTimeout(() => {
        actions.approveScreenplay();
      }, 0);
    }
  }, [state.projectId, state.screenplayRaw, state.beats.length]);

  // Auto-trigger asset reference generation (ponytail: skip if entities exist = already done)
  React.useEffect(() => {
    if (state.currentStep === 2.6 && (state.characters.length > 0 || state.locations.length > 0 || state.props.length > 0) && !state.loading && state.entities.length === 0) {
      console.log("Provider: Auto-triggering generateAllAssetReferences");
      setTimeout(() => {
        actions.generateAllAssetReferences();
      }, 0);
    }
  }, [state.currentStep, state.characters.length, state.locations.length, state.props.length, state.entities.length]);

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

    setAspectRatio: (aspect_ratio: string) => {
      setState((s) => ({ ...s, aspect_ratio }));
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
        // 1. Create Flow project via studio endpoint (saves to DB)
        let projectId: string | null = null;
        let flowProjectId: string | null = null;
        try {
          console.log("generateScreenplay: creating project with:", {
            title: currentState.idea || `Video Flow ${Date.now()}`,
            script_lang: currentState.language,
            image_text_lang: currentState.language,
            aspect_ratio: currentState.aspect_ratio,
          });

          const projectResponse = await fetch(`/api/studio/projects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: currentState.idea || `Video Flow ${Date.now()}`,
              script_lang: currentState.language,
              image_text_lang: currentState.language,
              aspect_ratio: currentState.aspect_ratio,
            }),
          });

          console.log("generateScreenplay: project response status:", projectResponse.status);

          if (projectResponse.ok) {
            const projectData = await projectResponse.json();
            projectId = projectData.id;
            flowProjectId = projectData.flow_project_id;
            console.log("generateScreenplay: Created project in DB:", projectId, "Flow ID:", flowProjectId);
          } else {
            const errorText = await projectResponse.text();
            console.warn("generateScreenplay: Failed to create project:", projectResponse.statusText, errorText);
          }
        } catch (e) {
          console.error("generateScreenplay: Error creating project:", e);
        }

        if (!projectId) {
          throw new Error("Failed to create project");
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

        // 3. Save screenplay to project in DB
        await fetch(`/api/studio/projects/${projectId}/script`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: screenplay }),
        });

        console.log("generateScreenplay: saving to state, projectId:", projectId, "flowProjectId:", flowProjectId);
        setState((s) => {
          console.log("setState in generateScreenplay, setting projectId to:", projectId);
          return {
            ...s,
            projectId,
            flowProjectId,
            screenplayRaw: screenplay,
            scenes: parsedScenes,
            loading: false,
            currentStep: 2,
          };
        });
        console.log("generateScreenplay: state updated");
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
      const currentState = stateRef.current;
      console.log("approveScreenplay: started");
      console.log("approveScreenplay: current state projectId:", currentState.projectId);

      if (!currentState.projectId) {
        console.log("approveScreenplay: ERROR - no projectId!");
        setState((s) => ({
          ...s,
          error: "No project ID — cannot save beats",
        }));
        return;
      }

      setState({
        ...currentState,
        loading: true,
        loadingMessage: "Extracting assets from screenplay...",
        error: null,
      });

      try {
        console.log("approveScreenplay: extracting assets from screenplay via AI");

        setState((s) => ({
          ...s,
          loadingMessage: "Analyzing screenplay to extract characters, locations, and props...",
        }));

        // Use AI to extract and describe assets with visual style consideration
        const extractionPrompt = `Analyze this screenplay and extract all characters, locations, and props. IMPORTANT: Describe each in the style of "${currentState.style}".

Extract:
1. CHARACTERS: Every named character with detailed physical description (clothing, hair, build, age, distinctive features) that matches the "${currentState.style}" visual style. One default outfit per character.
2. LOCATIONS: Every unique location with detailed visual description matching the "${currentState.style}" aesthetic
3. PROPS: Every significant prop mentioned with description in the "${currentState.style}" style

Return JSON:
{
  "characters": [{"name": "...", "description": "detailed appearance for ${currentState.style} style"}],
  "locations": [{"name": "...", "description": "visual details for ${currentState.style} style"}],
  "props": [{"name": "...", "description": "prop details for ${currentState.style} style"}]
}

Remember: Descriptions must be visual and consistent with "${currentState.style}" style.

SCREENPLAY:
${currentState.screenplayRaw}`;

        const aiResponse = await fetch(`/api/agent/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: "claude",
            prompt: extractionPrompt,
            model: currentState.model,
            timeout: 60,
          }),
        });

        if (!aiResponse.ok) throw new Error("AI extraction failed");
        const aiData = await aiResponse.json();

        // Parse JSON from markdown-wrapped response
        let jsonStr = aiData.stdout || "{}";
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }
        const extractedJson = JSON.parse(jsonStr);

        const extractedChars = extractedJson.characters || [];
        const extractedLocs = extractedJson.locations || [];
        const extractedProps = extractedJson.props || [];

        console.log("approveScreenplay: AI extracted", extractedChars.length, "characters");

        // Save to DB
        const charPromises = extractedChars.map(char =>
          fetch(`/api/studio/projects/${currentState.projectId}/characters`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: currentState.projectId,
              name: char.name,
              description: char.description,
            }),
          }).then(r => r.json())
        );

        const locPromises = extractedLocs.map(loc =>
          fetch(`/api/studio/projects/${currentState.projectId}/locations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: currentState.projectId,
              name: loc.name,
              description: loc.description,
            }),
          }).then(r => r.json())
        );

        const propPromises = extractedProps.map(prop =>
          fetch(`/api/studio/projects/${currentState.projectId}/props`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: currentState.projectId,
              name: prop.name,
              description: prop.description,
            }),
          }).then(r => r.json())
        );

        const savedChars = await Promise.all(charPromises);
        const savedLocs = await Promise.all(locPromises);
        const savedProps = await Promise.all(propPromises);

        console.log("approveScreenplay: setting state to step 2.6");
        setState((s) => ({
          ...s,
          characters: savedChars,
          locations: savedLocs,
          props: savedProps,
          loading: false,
          currentStep: 2.6,  // Go to Review & Manage Assets step
        }));
        console.log("approveScreenplay: state set, should be at 2.6 now");
      } catch (error: any) {
        console.error("approveScreenplay error:", error);
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
      setState((s) => {
        const updatedBeats = s.beats.map((b) =>
          b.id === beatId ? { ...b, ...updates } : b
        );
        const beat = updatedBeats.find((b) => b.id === beatId);

        // Save to DB if shot ID exists
        if (beat?.shotId) {
          fetch(`/api/studio/shots/${beat.shotId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: beat.description,
              visual_prompt: beat.shotPrompts,
              motion_prompt: beat.motionHints,
            }),
          }).catch((e) => console.warn("Failed to update shot in DB:", e));
        }

        return {
          ...s,
          beats: updatedBeats,
          editedBeatIds: new Set([...s.editedBeatIds, beatId]),
        };
      });
    },

    redoAllBeats: async () => {
      setState((s) => ({
        ...s,
        beats: [],
        editedBeatIds: new Set(),
        currentStep: 2,
      }));
    },

    createCharacters: async (charactersList: Array<any>) => {
      const currentState = state;
      if (!currentState.projectId || !currentState.flowProjectId) return;

      try {
        const createdChars: any[] = [];
        for (const char of charactersList) {
          let mediaId = null;

          // If reference_image_url exists, try to use it as media_id for now
          // TODO: Eventually upload the image to Flow and get proper media_id
          if (char.reference_image_url) {
            mediaId = char.reference_image_url;
          }

          const res = await fetch(`/api/studio/projects/${currentState.projectId}/characters`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: char.name,
              description: char.description,
              image_prompt: char.image_prompt,
              reference_image_url: char.reference_image_url,
              media_id: mediaId, // Store media_id for Flow reference
            }),
          });
          if (res.ok) {
            createdChars.push(await res.json());
          }
        }
        setState((s) => ({
          ...s,
          characters: createdChars,
        }));
      } catch (err) {
        console.warn("Failed to create characters:", err);
      }
    },

    createLocations: async (locationsList: Array<any>) => {
      const currentState = state;
      if (!currentState.projectId) return;

      try {
        const createdLocs: any[] = [];
        for (const loc of locationsList) {
          let mediaId = null;
          if (loc.reference_image_url) {
            mediaId = loc.reference_image_url;
          }

          const res = await fetch(`/api/studio/projects/${currentState.projectId}/locations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: loc.name,
              description: loc.description,
              image_prompt: loc.image_prompt,
              reference_image_url: loc.reference_image_url,
              media_id: mediaId,
            }),
          });
          if (res.ok) {
            createdLocs.push(await res.json());
          }
        }
        setState((s) => ({
          ...s,
          locations: createdLocs,
        }));
      } catch (err) {
        console.warn("Failed to create locations:", err);
      }
    },

    createProps: async (propsList: Array<any>) => {
      const currentState = state;
      if (!currentState.projectId) return;

      try {
        const createdProps: any[] = [];
        for (const prop of propsList) {
          let mediaId = null;
          if (prop.reference_image_url) {
            mediaId = prop.reference_image_url;
          }

          const res = await fetch(`/api/studio/projects/${currentState.projectId}/props`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: prop.name,
              description: prop.description,
              image_prompt: prop.image_prompt,
              reference_image_url: prop.reference_image_url,
              media_id: mediaId,
            }),
          });
          if (res.ok) {
            createdProps.push(await res.json());
          }
        }
        setState((s) => ({
          ...s,
          props: createdProps,
        }));
      } catch (err) {
        console.warn("Failed to create props:", err);
      }
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

    generateAllAssetReferences: async () => {
      console.log("🔍 generateAllAssetReferences: STARTED");
      const currentState = stateRef.current;
      const { projectId } = currentState;

      if (!projectId) {
        console.log("⏭️  generateAllAssetReferences: SKIPPED (no projectId)");
        return;
      }

      setState(s => ({ ...s, loading: true, loadingMessage: "Generating reference images..." }));

      try {
        // Call backend endpoint to generate + save all asset references
        const response = await fetch(`/api/studio/projects/${projectId}/generate-asset-references`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          throw new Error(`Backend error: ${response.status}`);
        }

        const result = await response.json();
        console.log(`✅ Generated ${result.generated} reference images:`, result.assets);

        setState(s => ({ ...s, loading: false }));
      } catch (err) {
        console.error("Asset reference generation failed:", err);
        setState(s => ({ ...s, loading: false, error: `Failed to generate reference images: ${err}` }));
      }
    },

    generateBeats: async () => {
      const currentState = state;

      setState({
        ...currentState,
        loading: true,
        loadingMessage: "Generating storyboard beats...",
        error: null,
      });

      try {
        console.log("generateBeats: starting with style and asset context");

        // Build asset context for beats generation
        const assetContext = `
VISUAL STYLE: ${currentState.style}

KEY CHARACTERS:
${currentState.characters.map(c => `- ${c.name}: ${c.description}`).join("\n")}

KEY LOCATIONS:
${currentState.locations.map(l => `- ${l.name}: ${l.description}`).join("\n")}

KEY PROPS:
${currentState.props.map(p => `- ${p.name}: ${p.description}`).join("\n")}
`;

        const result = await apiClient.generateBeats(
          currentState.screenplayRaw,
          currentState.scenes,
          currentState.model,
          120,
          currentState.language,
          assetContext  // Pass asset context to beat generation
        );

        // Convert API beats to Beat type with full narrative context
        const beats = result.beats.map((b: any, idx: number) => {
          const prevBeat = idx > 0 ? result.beats[idx - 1] : null;
          const nextBeat = idx < result.beats.length - 1 ? result.beats[idx + 1] : null;

          // Add narrative continuity context
          let continuityNotes = "";
          if (prevBeat) {
            continuityNotes += `Previous: ${(prevBeat.description || "").substring(0, 80)}... `;
          }
          if (nextBeat) {
            continuityNotes += `Next: ${(nextBeat.description || "").substring(0, 80)}...`;
          }

          return {
            id: `beat-${Math.random().toString(36).substring(7)}`,
            sceneHeading: b.description?.split('\n')[0] || `Scene ${idx + 1}`,
            description: b.description || "",
            entities: (b.ref_entity_names || []).map((name: string) => ({
              name,
              type: "unknown",
              description: ""
            })),
            shotPrompts: b.visual_prompt || b.shotPrompts || "",
            motionHints: b.motion_prompt || b.motionHints || "",
            voiceover: b.text || b.voiceover || "",
            characterNames: [] as string[],
            continuityNotes: continuityNotes,
            beatIndex: idx + 1,  // 1-based index
            totalBeats: result.beats.length,
            tone: b.tone || "neutral",  // Will be enriched by AI
            characterArcs: {},  // Will be enriched by AI
            transitionPrompt: idx < result.beats.length - 1 ? "" : "Resolution/closing",
          };
        });

        // Enrich beats with tone and character arcs via AI
        setState((s) => ({
          ...s,
          loadingMessage: "Analyzing beat tone and character development...",
        }));

        const beatsText = beats
          .map((b, idx) => `Beat ${idx + 1}/${beats.length}: ${b.description}`)
          .join("\n\n");

        const enrichmentPrompt = `Analyze each beat and extract:
1. TONE: emotional atmosphere (tense, mysterious, romantic, comedic, etc.)
2. CHARACTER ARCS: how each character feels/evolves in THIS beat

Characters: ${currentState.characters.map(c => c.name).join(", ")}

BEATS:
${beatsText}

Return JSON:
{
  "beats": [
    {
      "index": 0,
      "tone": "tense, mysterious",
      "characterArcs": {
        "CharacterName": "confused and searching",
        "OtherChar": "calm but suspicious"
      },
      "transitionNote": "from confusion to discovery"
    }
  ]
}`;

        try {
          const enrichResponse = await fetch(`/api/agent/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agent: "claude",
              prompt: enrichmentPrompt,
              model: currentState.model,
              timeout: 60,
            }),
          });

          if (enrichResponse.ok) {
            const enrichData = await enrichResponse.json();
            let enrichedBeats = [];
            try {
              const stdout = enrichData.stdout || "";
              const jsonMatch = stdout.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                enrichedBeats = JSON.parse(jsonMatch[0]).beats || [];
              }
            } catch (e) {
              console.warn("Could not parse beat enrichment:", e);
            }

            // Apply enrichment to beats
            beats.forEach((beat, idx) => {
              const enriched = enrichedBeats.find((e: any) => e.index === idx);
              if (enriched) {
                beat.tone = enriched.tone;
                beat.characterArcs = enriched.characterArcs || {};
                beat.transitionPrompt = enriched.transitionNote;
              }
            });
          }
        } catch (e) {
          console.warn("Beat enrichment failed, continuing:", e);
        }

        // Fast character matching
        const quickMatches = quickMatchCharactersByBeat(beats, currentState.characters);
        const unidentifiedBeats = quickMatches.filter(m => m.character_names.length === 0);

        // AI enrichment for unidentified beats
        let allMatches = [...quickMatches];
        if (unidentifiedBeats.length > 0 && currentState.characters.length > 0) {
          setState((s) => ({
            ...s,
            loadingMessage: `Analyzing ${unidentifiedBeats.length} beats for character identification...`,
          }));

          const enriched = await aiEnrichCharactersByBeat(
            beats.filter((b, idx) => unidentifiedBeats.some(u => u.beat_index === idx)),
            beats,
            currentState.characters,
            currentState.model
          );

          allMatches = quickMatches.map(m => {
            const enrichedResult = enriched.find((e: any) => e.beat_index === m.beat_index);
            return enrichedResult || m;
          });
        }

        // Apply character names to beats
        const beatsWithCharacters = beats.map((beat, idx) => ({
          ...beat,
          characterNames: allMatches[idx]?.character_names || [],
        }));

        console.log("generateBeats: setting beats, going to step 3");
        setState((s) => ({
          ...s,
          beats: beatsWithCharacters,
          loading: false,
          currentStep: 3,
        }));
      } catch (error: any) {
        console.error("generateBeats error:", error);
        setState((s) => ({
          ...s,
          loading: false,
          error: error.message || "Failed to generate beats",
        }));
      }
    },

    approveStoryboard: async () => {
      const currentState = state;

      setState({
        ...currentState,
        loading: true,
        loadingMessage: "Refining visual prompts with character/location consistency and style...",
        error: null,
      });

      try {
        // Build complete reference context with style + media_ids
        const referenceContext = {
          style: currentState.style,
          characters: currentState.characters.map(c => ({
            name: c.name,
            description: c.description,
            reference_url: c.reference_image_url,
            media_id: (c as any).media_id,  // Pass media_id for Flow
          })),
          locations: currentState.locations.map(l => ({
            name: l.name,
            description: l.description,
            reference_url: l.reference_image_url,
            media_id: (l as any).media_id,
          })),
          props: currentState.props.map(p => ({
            name: p.name,
            description: p.description,
            reference_url: p.reference_image_url,
            media_id: (p as any).media_id,
          })),
        };

        // Build style prefix (like material.scenePrefix)
        const stylePrefix = getStylePrefix(currentState.style);

        // Refine beat prompts with style + assets + tone + character arcs + continuity
        const refinedBeats = currentState.beats.map((beat, idx) => {
          const usedAssets = [
            ...(beat.characterNames || []),
            ...currentState.locations.filter(l => beat.description?.includes(l.name)).map(l => l.name),
            ...currentState.props.filter(p => beat.description?.includes(p.name)).map(p => p.name),
          ];

          // Build complete narrative context
          let narrativeContext = "";

          // Beat position and tone
          if (beat.beatIndex && beat.totalBeats) {
            narrativeContext += `\n[Beat ${beat.beatIndex}/${beat.totalBeats}]`;
          }
          if (beat.tone) {
            narrativeContext += `\n[TONE: ${beat.tone}]`;
          }

          // Character emotional arcs
          if (beat.characterArcs && Object.keys(beat.characterArcs).length > 0) {
            narrativeContext += "\n[CHARACTER STATES:";
            Object.entries(beat.characterArcs).forEach(([char, arc]) => {
              narrativeContext += `\n  ${char}: ${arc}`;
            });
            narrativeContext += "\n]";
          }

          // Transition notes
          if (beat.transitionPrompt) {
            narrativeContext += `\n[TRANSITION: ${beat.transitionPrompt}]`;
          }

          // Narrative continuity from adjacent beats
          if (beat.continuityNotes) {
            narrativeContext += `\n[Context: ${beat.continuityNotes}]`;
          }

          // Opening/closing markers
          if (idx === 0) {
            narrativeContext += "\n[OPENING: Establish world, mood, and stakes]";
          } else if (idx === currentState.beats.length - 1) {
            narrativeContext += "\n[CLOSING: Provide resolution and emotional payoff]";
          }

          return {
            ...beat,
            shotPrompts: `${stylePrefix}\n${beat.shotPrompts}${usedAssets.length > 0 ? `\nAssets: ${usedAssets.join(", ")}` : ""}${narrativeContext}`,
          };
        });

        const result = await apiClient.generateImages(
          refinedBeats,
          currentState.model,
          currentState.flowProjectId,
          referenceContext
        );

        // Save generated images to shots in DB
        try {
          for (const img of result.images) {
            const beat = currentState.beats.find((b) => b.id === img.beat_id);
            if (beat?.shotId && img.image_url) {
              // TODO: upload image to Flow and get media_id, then save to shot
              // For now, just save the URL as placeholder
              await fetch(`/api/studio/shots/${beat.shotId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  // image_media_id will be set after Flow upload
                }),
              }).catch((e) => console.warn("Failed to save image reference:", e));
            }
          }
        } catch (saveError) {
          console.warn("Failed to sync images to DB:", saveError);
        }

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
