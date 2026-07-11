export type WorkflowStep = 1 | 2 | 2.6 | 3 | 4 | 4.5 | 5;

export interface Entity {
  id: string;
  name: string;
  type: "character" | "location" | "prop";
  description: string;
  ref_prompt: string;
  imageUrl?: string;
  imageMediaId?: string;
}

export interface GeneratedImage {
  beat_id: string;
  beat_index: number;
  visual_prompt: string;
  enhanced_prompt: string;
  consistency_notes: string;
  image_url?: string;
}

export interface Beat {
  id: string;
  shotId?: string;  // DB shot ID for persistence
  sceneHeading: string;
  description: string;
  entities: Array<{ name: string; type: string; description: string }>;
  shotPrompts: string;
  motionHints: string;
  voiceover: string;
  characterNames?: string[];
  continuityNotes?: string;  // Narrative context from previous/next beats
  beatIndex?: number;  // Position in sequence (1/N)
  totalBeats?: number;  // Total number of beats
  tone?: string;  // Emotional tone: tense, mysterious, romantic, etc.
  characterArcs?: Record<string, string>;  // Character name → emotional journey in this beat
  transitionPrompt?: string;  // How to transition FROM this beat to next
}

export interface Scene {
  heading: string;
  body: string;
}

export interface WorkflowState {
  // Step 1 inputs
  idea: string;
  style: string;
  duration: number; // in seconds
  model: string;
  language: string;
  aspect_ratio: string;
  customPromptHeader: string;

  // Step 2 data
  screenplayRaw: string;
  scenes: Scene[];

  // Step 3 data
  beats: Beat[];
  editedBeatIds: Set<string>;

  // Step 3.5 data (Characters, Locations, Props for consistency)
  characters: Array<{
    id: string;
    name: string;
    description: string;
    image_prompt?: string;
    reference_image_url?: string;
  }>;
  locations: Array<{
    id: string;
    name: string;
    description: string;
    image_prompt?: string;
    reference_image_url?: string;
  }>;
  props: Array<{
    id: string;
    name: string;
    description: string;
    image_prompt?: string;
    reference_image_url?: string;
  }>;

  // Step 4 data (Assets/Entities)
  entities: Entity[];

  // Step 4.5 data (Generated Images)
  generatedImages: GeneratedImage[];

  // Step 5 data (Video generation)
  videoStatus: "pending" | "generating" | "done" | "error";
  videoUrl: string | null;
  generationJobId: string | null;

  // Meta
  projectId: string | null;      // studio project ID (db)
  flowProjectId: string | null;  // Flow API project ID
  currentStep: WorkflowStep;
  loading: boolean;
  error: string | null;
  loadingMessage: string;
}

export interface WorkflowActions {
  setIdea: (idea: string) => void;
  setStyle: (style: string) => void;
  setDuration: (duration: number) => void;
  setModel: (model: string) => void;
  setLanguage: (language: string) => void;
  setAspectRatio: (ratio: string) => void;
  setCustomPromptHeader: (header: string) => void;
  generateScreenplay: () => Promise<void>;
  showScenes: () => void;
  approveScreenplay: () => Promise<void>;
  redoScreenplay: () => void;
  generateBeats: () => Promise<void>;
  generateAllAssetReferences: () => Promise<void>;
  updateBeat: (beatId: string, updates: Partial<Beat>) => void;
  redoAllBeats: () => Promise<void>;
  createCharacters: (characters: Array<any>) => Promise<void>;
  createLocations: (locations: Array<any>) => Promise<void>;
  createProps: (props: Array<any>) => Promise<void>;
  extractAndGenerateAssets: () => Promise<void>;
  approveStoryboard: () => Promise<void>;
  proceedToVideo: () => void;
  goToStep: (step: WorkflowStep) => void;
  pollVideoStatus: () => Promise<void>;
  setError: (error: string | null) => void;
  resetWorkflow: () => void;
}
