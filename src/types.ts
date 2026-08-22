export type RoadmapPart = 'A' | 'B' | 'C' | 'D';

export interface Phase {
  id: number;
  part: RoadmapPart;
  partTitle: string;
  title: string;
  shortTitle: string;
  dense: boolean; // Marked harder/denser in the roadmap
  what: string;
  estimatedHours: number;
  concepts: string[];
  docLinks?: { title: string; url: string }[];
  steps: string[];
  exit: string[];
  proTip?: string;
  codeSnippet?: string;
}

export interface UserState {
  completedPhases: number[];
  criteriaChecked: Record<string, boolean>; // key: `${phaseId}_${criteriaIdx}`
  stepChecked: Record<string, boolean>; // key: `${phaseId}_${stepIdx}`
  userNotes: Record<number, string>; // phaseId -> notes/snippets
  streak: number;
  lastActiveDate: string | null; // YYYY-MM-DD
  historyDates: string[]; // List of active days
  dailyReminderEnabled: boolean;
  dailyReminderTime: string; // HH:MM (e.g. "09:00", "20:00")
  lastStudiedPhaseId: number | null;
  totalStudyMinutes: number;
}

export interface FilterState {
  part: 'ALL' | RoadmapPart | 'DENSE' | 'INCOMPLETE' | 'COMPLETED';
  searchQuery: string;
}

// ---------------------------------------------------------------------------
// Multi-plan model (v2)
// ---------------------------------------------------------------------------

/** Accent colors available to plans — subset of the existing theme palette. */
export type AccentColor = 'accent' | 'success' | 'warning' | 'danger';

export interface PlanSection {
  id: string;
  title: string;
}

/** Generic phase — most curriculum fields are optional so simple checklist-style plans work too. */
export interface PlanPhase {
  id: number;
  section: string;
  title: string;
  shortTitle?: string;
  dense?: boolean;
  what?: string;
  estimatedHours?: number;
  concepts?: string[];
  docLinks?: { title: string; url: string }[];
  steps: string[];
  exit: string[];
  proTip?: string;
  codeSnippet?: string;
  codeLanguage?: string;
}

export interface Plan {
  id: string;
  name: string;
  emoji: string;
  accent: AccentColor;
  description?: string;
  /** Intro card copy shown above the phase list. */
  method?: string;
  /** Numbered working-principle steps shown under the method text. */
  principle?: { step: string }[];
  /** Renders the matching cheatsheet button (e.g. 'go'). */
  cheatsheetId?: string;
  builtIn?: boolean;
  sections: PlanSection[];
  phases: PlanPhase[];
}

/** Per-plan progress. Keys like `${phaseId}_${idx}` are scoped inside one plan. */
export interface PlanProgress {
  completedPhases: number[];
  criteriaChecked: Record<string, boolean>;
  stepChecked: Record<string, boolean>;
  userNotes: Record<number, string>;
  lastStudiedPhaseId: number | null;
}

export interface AppSettings {
  dailyReminderEnabled: boolean;
  dailyReminderTime: string; // HH:MM 24h — displayed as 12h in the UI
}

/** Streak/history shared across all plans. */
export interface GlobalActivity {
  streak: number;
  lastActiveDate: string | null;
  historyDates: string[];
  totalStudyMinutes: number;
}

/** Root persisted state (storage key version 2). */
export interface AppData {
  version: 2;
  activePlanId: string;
  customPlans: Plan[];
  settings: AppSettings;
  global: GlobalActivity;
  progressByPlan: Record<string, PlanProgress>;
}
