export type WorkflowStep = 1 | 2 | 3 | 4;

export interface Beat {
  id: string;
  sceneHeading: string;
  description: string;
  entities: Array<{ name: string; type: string; description: string }>;
  shotPrompts: string;
  motionHints: string;
  voiceover: string;
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
  customPromptHeader: string;

  // Step 2 data
  screenplayRaw: string;
  scenes: Scene[];

  // Step 3 data
  beats: Beat[];
  editedBeatIds: Set<string>;

  // Step 4 data
  videoStatus: "pending" | "generating" | "done" | "error";
  videoUrl: string | null;
  generationJobId: string | null;

  // Meta
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
  setCustomPromptHeader: (header: string) => void;
  generateScreenplay: () => Promise<void>;
  approveScreenplay: () => Promise<void>;
  redoScreenplay: () => void;
  updateBeat: (beatId: string, updates: Partial<Beat>) => void;
  redoAllBeats: () => Promise<void>;
  approveStoryboard: () => Promise<void>;
  goToStep: (step: WorkflowStep) => void;
  pollVideoStatus: () => Promise<void>;
  setError: (error: string | null) => void;
  resetWorkflow: () => void;
}
