import React from 'react';
import { Trophy } from 'lucide-react';
import { Achievement } from '../types';

interface AchievementBadgesProps {
  achievements: Achievement[];
}

/**
 * Achievement badges display — shows unlocked and locked achievements
 * in a compact horizontal scroll.
 */
export const AchievementBadges: React.FC<AchievementBadgesProps> = ({
  achievements,
}) => {
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <section
      aria-label="Achievements"
      className="rounded-lg border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-warning" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight text-text">
            Achievements
          </h2>
        </div>
        <span className="text-[11px] font-mono text-faint">
          {unlockedCount}/{achievements.length}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {achievements.map((achievement) => (
          <div
            key={achievement.id}
            className={`flex-shrink-0 w-20 p-2 rounded-lg border text-center transition-colors ${
              achievement.unlocked
                ? 'bg-warning/10 border-warning/30'
                : 'bg-raised border-line opacity-50'
            }`}
            title={`${achievement.title}: ${achievement.description}`}
          >
            <div className="text-xl mb-1">{achievement.icon}</div>
            <div className="text-[10px] font-medium text-text leading-tight">
              {achievement.title}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
