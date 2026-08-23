import React, { useRef } from 'react';
import { Download, RotateCcw, Upload, X } from 'lucide-react';
import { AppData, Plan, PlanProgress } from '../types';
import { getActivityHistory, formatStudyMinutes, getProgressSummary } from '../data/progress';
import { exportAppDataAsJSON, getLocalDateString, normalizeAppData, saveAppData } from '../utils/storage';

interface StatsModalProps {
  appData: AppData;
  plan: Plan;
  progress: PlanProgress;
  onClose: () => void;
  onUpdateData: (newData: AppData) => void;
}

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-faint mb-2 font-mono';

export const StatsModal: React.FC<StatsModalProps> = ({
  appData,
  plan,
  progress,
  onClose,
  onUpdateData
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const summary = getProgressSummary(plan, progress);
  const activity = getActivityHistory(appData.global, 14);
  const goalMinutes = appData.settings.dailyFocusGoal;
  const todayMinutes = appData.global.historyMinutes[getLocalDateString()] ?? 0;

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);

        // v2 full backup
        if (parsed && parsed.version === 2) {
          const restored = normalizeAppData(parsed);
          saveAppData(restored);
          onUpdateData(restored);
          alert('Backup restored successfully.');
          return;
        }

        // Legacy single-plan backup -> merge into the built-in Go roadmap
        if (parsed && Array.isArray(parsed.completedPhases)) {
          const merged = normalizeAppData({
            ...appData,
            progressByPlan: {
              ...appData.progressByPlan,
              'go-roadmap': {
                completedPhases: parsed.completedPhases,
                criteriaChecked:
                  typeof parsed.criteriaChecked === 'object' && parsed.criteriaChecked
                    ? parsed.criteriaChecked
                    : {},
                stepChecked:
                  typeof parsed.stepChecked === 'object' && parsed.stepChecked ? parsed.stepChecked : {},
                userNotes:
                  typeof parsed.userNotes === 'object' && parsed.userNotes ? parsed.userNotes : {},
                lastStudiedPhaseId:
                  typeof parsed.lastStudiedPhaseId === 'number' ? parsed.lastStudiedPhaseId : null
              }
            },
            global: {
              streak: typeof parsed.streak === 'number' ? parsed.streak : appData.global.streak,
              lastActiveDate: parsed.lastActiveDate ?? appData.global.lastActiveDate,
              historyDates: Array.isArray(parsed.historyDates)
                ? parsed.historyDates
                : appData.global.historyDates,
              totalStudyMinutes:
                typeof parsed.totalStudyMinutes === 'number'
                  ? parsed.totalStudyMinutes
                  : appData.global.totalStudyMinutes
            }
          });
          saveAppData(merged);
          onUpdateData(merged);
          alert('Legacy Go roadmap backup restored.');
          return;
        }

        alert('Invalid backup file format.');
      } catch {
        alert('Failed to parse backup file.');
      }
      // Allow re-selecting the same file after a failed attempt
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleResetData = () => {
    if (
      window.confirm(
        'This will permanently erase ALL plans, phase progress, checkmarks, notes, and streak history. Continue?'
      )
    ) {
      const resetState = normalizeAppData({
        version: 2,
        activePlanId: 'go-roadmap',
        customPlans: [],
        settings: appData.settings,
        global: { streak: 0, lastActiveDate: null, historyDates: [], totalStudyMinutes: 0, historyMinutes: {} },
        progressByPlan: {}
      });
      saveAppData(resetState);
      onUpdateData(resetState);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Progress stats"
        className="w-full max-w-lg bg-surface border border-line rounded-xl p-5 sm:p-6 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close stats"
          className="absolute top-3.5 right-3.5 p-1.5 text-muted hover:text-text rounded-md hover:bg-hover transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-base font-semibold text-text">Progress</h2>
        <p className="text-xs text-muted mt-0.5">
          Phase {Math.min(summary.completedPhases + 1, Math.max(summary.totalPhases, 1))} of{' '}
          {summary.totalPhases} · {summary.overallPercent}% complete
        </p>

        {/* Overview metrics */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Phases', value: `${summary.completedPhases}/${summary.totalPhases}` },
            { label: 'Steps', value: `${summary.checkedSteps}/${summary.totalSteps}` },
            { label: 'Criteria', value: `${summary.checkedCriteria}/${summary.totalCriteria}` },
            { label: 'Study time', value: formatStudyMinutes(appData.global.totalStudyMinutes) }
          ].map((m) => (
            <div key={m.label} className="p-3 rounded-lg bg-raised border border-line">
              <div className="font-mono text-base text-text">{m.value}</div>
              <div className="text-[11px] text-muted mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Streak */}
        <div className="mt-3 p-3 rounded-lg bg-raised border border-line flex items-center justify-between">
          <div>
            <div className="text-sm text-text">
              <span className="font-mono">{appData.global.streak}</span>{' '}
              {appData.global.streak === 1 ? 'day' : 'days'} streak
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              Any activity today keeps it going.
            </div>
          </div>

          {/* Activity history */}
          <div className="flex items-end gap-1" role="img" aria-label="Last 14 days activity">
            {activity.map((a) => (
              <span
                key={a.date}
                title={a.date}
                className={`w-2 rounded-sm ${
                  a.active ? 'h-6 bg-success' : 'h-3 bg-hover border border-line'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Daily focus goal */}
        {goalMinutes ? (
          <div className="mt-3 p-3 rounded-lg bg-raised border border-line">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-faint font-mono">
                Today's focus
              </span>
              <span className="font-mono text-[11px] text-text">
                {formatStudyMinutes(todayMinutes)} / {formatStudyMinutes(goalMinutes)}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-page overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ease-out ${
                  todayMinutes >= goalMinutes ? 'bg-success' : 'bg-accent'
                }`}
                style={{ width: `${Math.min(100, Math.round((todayMinutes / goalMinutes) * 100))}%` }}
              />
            </div>
            <p className="text-[11px] text-muted mt-1.5">
              {todayMinutes >= goalMinutes
                ? 'Goal hit — nice work!'
                : `${formatStudyMinutes(goalMinutes - todayMinutes)} to go. Set the goal in Settings.`}
            </p>
          </div>
        ) : null}

        {/* Section breakdown */}
        {summary.parts.length > 1 && (
          <div className="mt-3 space-y-1.5">
            <h3 className={labelClass}>By section</h3>
            {summary.parts.map((part) => (
              <div key={part.id} className="p-2.5 rounded-lg bg-raised border border-line">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-text truncate">{part.name}</span>
                  <span className="font-mono text-[11px] text-faint shrink-0">
                    {part.completed}/{part.total}
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full rounded-full bg-page overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-500 ease-out"
                    style={{ width: `${part.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Data management */}
        <div className="mt-5 pt-4 border-t border-line flex flex-wrap gap-2">
          <button
            id="export-data-btn"
            onClick={() => exportAppDataAsJSON(appData)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line hover:border-line-strong hover:bg-hover text-muted hover:text-text text-xs font-medium transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export backup
          </button>
          <button
            id="import-data-btn"
            onClick={handleImportClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line hover:border-line-strong hover:bg-hover text-muted hover:text-text text-xs font-medium transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
            aria-hidden="true"
          />
          <button
            id="reset-data-btn"
            onClick={handleResetData}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-danger/30 text-danger/80 hover:text-danger hover:border-danger/60 text-xs font-medium transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset all data
          </button>
        </div>
      </div>
    </div>
  );
};

