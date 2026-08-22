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
