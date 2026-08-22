import React, { useRef } from 'react';
import { Download, RotateCcw, Upload, X } from 'lucide-react';
import { UserState } from '../types';
import { getActivityHistory, formatStudyMinutes, getProgressSummary } from '../data/progress';
import { exportUserDataAsJSON, DEFAULT_USER_STATE, saveUserState } from '../utils/storage';

interface StatsModalProps {
  userState: UserState;
  onClose: () => void;
  onUpdateState: (newState: UserState) => void;
}

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-faint mb-2 font-mono';

export const StatsModal: React.FC<StatsModalProps> = ({ userState, onClose, onUpdateState }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const progress = getProgressSummary(userState);
  const activity = getActivityHistory(userState, 14);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data && Array.isArray(data.completedPhases)) {
          const updatedState: UserState = {
            ...DEFAULT_USER_STATE,
            ...userState,
            ...data
          };
          saveUserState(updatedState);
          onUpdateState(updatedState);
          alert('Progress restored successfully.');
        } else {
          alert('Invalid backup file format.');
        }
      } catch {
        alert('Failed to parse backup file.');
      }
    };
    reader.readAsText(file);
  };

  const handleResetData = () => {
    if (
      window.confirm(
        'This will permanently erase all phase progress, checkmarks, notes, and streak history. Continue?'
      )
    ) {
      const resetState: UserState = {
        ...DEFAULT_USER_STATE,
        dailyReminderEnabled: userState.dailyReminderEnabled,
        dailyReminderTime: userState.dailyReminderTime
      };
      saveUserState(resetState);
      onUpdateState(resetState);
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
          Phase {Math.min(progress.completedPhases + 1, progress.totalPhases)} of{' '}
          {progress.totalPhases} · {progress.overallPercent}% complete
        </p>

        {/* Overview metrics */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Phases', value: `${progress.completedPhases}/${progress.totalPhases}` },
            { label: 'Steps', value: `${progress.checkedSteps}/${progress.totalSteps}` },
            { label: 'Criteria', value: `${progress.checkedCriteria}/${progress.totalCriteria}` },
            { label: 'Study time', value: formatStudyMinutes(userState.totalStudyMinutes) }
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
              <span className="font-mono">{userState.streak}</span>{' '}
              {userState.streak === 1 ? 'day' : 'days'} streak
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              Any activity today keeps it going.
            </div>
          </div>
          {/* Last 14 days */}
          <div className="flex items-end gap-[3px]" aria-hidden>
            {activity.map((d) => (
              <span
                key={d.date}
                title={d.date}
                className={`w-[7px] h-4 rounded-sm ${
                  d.active ? 'bg-success' : 'bg-line'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Part breakdown */}
        <div className="mt-6">
          <h3 className={labelClass}>By part</h3>
          <div className="space-y-3">
            {progress.parts.map((p) => (
              <div key={p.part}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-text/90">{p.name}</span>
                  <span className="font-mono text-faint">
                    {p.completed}/{p.total}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={p.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${p.name} progress`}
                  className="h-1 w-full rounded-full bg-page overflow-hidden border border-line"
                >
                  <div
                    className="h-full bg-accent transition-all duration-500"
                    style={{ width: `${p.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Data management */}
        <div className="mt-6 pt-4 border-t border-line">
          <h3 className={labelClass}>Data</h3>
          <p className="text-xs text-muted mb-3 leading-relaxed">
            Progress is stored locally in your browser. Export a JSON backup to move it to another
            device.
          </p>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
            aria-hidden
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => exportUserDataAsJSON(userState)}
              className="py-2 px-3 rounded-md bg-raised hover:bg-hover border border-line hover:border-line-strong text-text text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export backup
            </button>

            <button
              onClick={handleImportClick}
              className="py-2 px-3 rounded-md bg-raised hover:bg-hover border border-line hover:border-line-strong text-text text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import backup
            </button>
          </div>

          <button
            onClick={handleResetData}
            className="mt-3 text-xs text-danger hover:underline flex items-center gap-1 cursor-pointer font-medium"
          >
            <RotateCcw className="w-3 h-3" />
            Reset all progress
          </button>
        </div>
      </div>
    </div>
  );
};
