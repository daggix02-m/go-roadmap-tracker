import React, { useState } from 'react';
import { X } from 'lucide-react';
import { HabitColor, HABIT_COLORS } from '../types';

interface AddHabitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (title: string, emoji: string, color: HabitColor, targetMinutes?: number) => void;
}

const EMOJI_OPTIONS = [
  '💪', '📚', '🧠', '🏃', '💤', '🥗', '💧', '🎯',
  '✍️', '🎵', '🧘', '🌿', '⏰', '📝', '🏋️', '🚴',
];

/**
 * Modal for adding a new habit — Grit-style with emoji picker,
 * color selector, and optional daily target.
 */
export const AddHabitModal: React.FC<AddHabitModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);
  const [color, setColor] = useState<HabitColor>('blue');
  const [targetMinutes, setTargetMinutes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const target = targetMinutes ? parseInt(targetMinutes, 10) : undefined;
    onAdd(title.trim(), emoji, color, target && target > 0 ? target : undefined);

    // Reset form
    setTitle('');
    setEmoji(EMOJI_OPTIONS[0]);
    setColor('blue');
    setTargetMinutes('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-xl border border-line bg-surface shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Add new habit"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-text">New Habit</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-hover transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-faint" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-faint mb-1.5">
              Icon
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`w-8 h-8 rounded-md flex items-center justify-center text-lg transition-[transform,background-color] cursor-pointer ${
                    emoji === e
                      ? 'bg-accent/20 ring-2 ring-accent'
                      : 'bg-raised hover:bg-hover'
                  }`}
                  aria-label={`Select emoji ${e}`}
                  aria-pressed={emoji === e}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label
              htmlFor="habit-title"
              className="block text-[11px] font-mono uppercase tracking-wider text-faint mb-1.5"
            >
              Habit name
            </label>
            <input
              id="habit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Exercise, Read, Meditate"
              className="w-full px-2.5 py-2 rounded-md bg-raised border border-line text-xs text-text focus:outline-none focus:border-accent/60"
              autoFocus
            />
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-faint mb-1.5">
              Color
            </label>
            <div className="flex items-center gap-1.5">
              {HABIT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  className={`w-6 h-6 rounded-md ${c.cssClass} transition-[transform,opacity] cursor-pointer ${
                    color === c.id
                      ? 'ring-2 ring-offset-2 ring-offset-surface ring-text/60'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  aria-label={`Select color ${c.label}`}
                  aria-pressed={color === c.id}
                />
              ))}
            </div>
          </div>

          {/* Optional target */}
          <div>
            <label
              htmlFor="habit-target"
              className="block text-[11px] font-mono uppercase tracking-wider text-faint mb-1.5"
            >
              Daily target (optional)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="habit-target"
                type="number"
                min="1"
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(e.target.value)}
                placeholder="Minutes"
                className="w-24 px-2.5 py-2 rounded-md bg-raised border border-line text-xs text-text focus:outline-none focus:border-accent/60"
              />
              <span className="text-[11px] text-faint">minutes/day</span>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!title.trim()}
            className="w-full px-3 py-2 rounded-md bg-accent text-white text-xs font-semibold transition-opacity hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Add Habit
          </button>
        </form>
      </div>
    </div>
  );
};
