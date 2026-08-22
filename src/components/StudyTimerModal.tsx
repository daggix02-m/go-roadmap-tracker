import React, { useState, useEffect, useRef } from 'react';
import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { UserState } from '../types';
import { ROADMAP_DATA } from '../data/roadmapData';
import { recordStudyActivity } from '../utils/storage';

interface StudyTimerModalProps {
  userState: UserState;
  onClose: () => void;
  onUpdateState: (newState: UserState) => void;
}

export const StudyTimerModal: React.FC<StudyTimerModalProps> = ({
  userState,
  onClose,
  onUpdateState
}) => {
  const [selectedDuration, setSelectedDuration] = useState<number>(25 * 60);
  const [timeLeft, setTimeLeft] = useState<number>(selectedDuration);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [mode, setMode] = useState<'study' | 'break'>('study');
  const [completedSessions, setCompletedSessions] = useState<number>(0);

  const activePhase =
    ROADMAP_DATA.find((p) => !userState.completedPhases.includes(p.id)) || ROADMAP_DATA[0];

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, mode, selectedDuration]);

  useEffect(() => {
    if (!isRunning) return;
    document.title = `${formatTime(timeLeft)} — Focus timer`;
    return () => {
      document.title = 'Go Backend Roadmap Tracker';
    };
  }, [timeLeft, isRunning]);

  const handleTimerComplete = () => {
    setIsRunning(false);
    if (mode === 'study') {
      const minutesStudied = Math.round(selectedDuration / 60);
      const updated = recordStudyActivity(userState, activePhase.id, minutesStudied);
      onUpdateState(updated);
      setCompletedSessions((prev) => prev + 1);

      try {
        const audioCtx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      } catch {
        // Audio not available
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Focus session complete', {
          body: `${minutesStudied} min logged for phase ${activePhase.id} — ${activePhase.shortTitle}.`,
          icon: '/icon.svg'
        });
      }
    }
  };

  const handleSelectPreset = (minutes: number, isBreak = false) => {
    setIsRunning(false);
    setMode(isBreak ? 'break' : 'study');
    setSelectedDuration(minutes * 60);
    setTimeLeft(minutes * 60);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(selectedDuration);
  };

  function formatTime(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const presets: { minutes: number; label: string; isBreak?: boolean }[] = [
    { minutes: 15, label: '15m' },
    { minutes: 25, label: '25m' },
    { minutes: 50, label: '50m' },
    { minutes: 5, label: '5m break', isBreak: true }
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Focus timer"
        className="w-full max-w-sm bg-surface border border-line rounded-xl p-5 sm:p-6 relative flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close timer"
          className="absolute top-3.5 right-3.5 p-1.5 text-muted hover:text-text rounded-md hover:bg-hover transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-base font-semibold text-text">Focus timer</h2>
        <p className="text-xs text-muted mt-0.5 mb-5 max-w-[16rem] truncate">
          Phase {activePhase.id} · {activePhase.shortTitle}
        </p>

        {/* Presets */}
        <div className="flex items-center gap-1.5 mb-6 flex-wrap justify-center">
          {presets.map((p) => {
            const active =
              mode === (p.isBreak ? 'break' : 'study') && selectedDuration === p.minutes * 60;
            return (
              <button
                key={p.label}
                onClick={() => handleSelectPreset(p.minutes, p.isBreak)}
                aria-pressed={active}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? p.isBreak
                      ? 'bg-success text-page'
                      : 'bg-accent text-page'
                    : 'border border-line text-muted hover:text-text hover:bg-hover'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Time display */}
        <div className="w-full aspect-square max-w-[13rem] rounded-full border border-line flex flex-col items-center justify-center mb-6 bg-page">
          <span
            className={`font-mono text-5xl tracking-tight tabular-nums ${
              timeLeft === 0 ? 'text-success' : 'text-text'
            }`}
          >
            {formatTime(timeLeft)}
          </span>
          <span className="mt-2 font-mono text-[11px] uppercase tracking-wider text-faint">
            {mode === 'study' ? 'Focus' : 'Break'}
            {completedSessions > 0 && ` · ${completedSessions} done`}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 w-full max-w-xs justify-center">
          <button
            onClick={() => setIsRunning(!isRunning)}
            disabled={timeLeft === 0 && !isRunning}
            className={`flex-1 py-2.5 px-4 rounded-md font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              isRunning
                ? 'border border-line text-text hover:bg-hover'
                : 'bg-text text-page hover:opacity-85'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-4 h-4" /> Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> {timeLeft < selectedDuration ? 'Resume' : 'Start'}
              </>
            )}
          </button>

          <button
            onClick={handleReset}
            aria-label="Reset timer"
            className="p-2.5 rounded-md border border-line text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-4 text-xs text-muted">Completed sessions count toward today's streak.</p>
      </div>
    </div>
  );
};
