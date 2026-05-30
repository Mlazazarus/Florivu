import { useState } from 'react';
import {
  type AchievementStatus,
  getAvatarBorderClassName,
} from '../lib/achievements';

type AchievementStatusFilter = 'achieved' | 'not-achieved';
type AchievementRewardFilter = AchievementStatus['reward']['kind'];

interface AchievementsPanelProps {
  achievements: AchievementStatus[];
  profileInitial: string;
  profilePhotoUrl: string | null;
  selectedAvatarBorderId: string | null;
  selectedProfileTitleId: string | null;
}

const achievementStatusFilterOptions: Array<{ label: string; value: AchievementStatusFilter }> = [
  { label: 'Achieved', value: 'achieved' },
  { label: 'Not achieved', value: 'not-achieved' },
];

const achievementRewardFilterOptions: Array<{ label: string; value: AchievementRewardFilter }> = [
  { label: 'Titles', value: 'title' },
  { label: 'Borders', value: 'avatar-border' },
];

function rewardTypeLabel(achievement: AchievementStatus) {
  return achievement.reward.kind === 'avatar-border' ? 'Avatar border' : 'Profile title';
}

function toggleFilter<T extends string>(currentFilters: T[], nextValue: T) {
  return currentFilters.includes(nextValue)
    ? currentFilters.filter((filter) => filter !== nextValue)
    : [...currentFilters, nextValue];
}

function matchesAchievementFilters(
  achievement: AchievementStatus,
  statusFilters: AchievementStatusFilter[],
  rewardFilters: AchievementRewardFilter[],
) {
  const matchesStatus =
    statusFilters.length === 0 ||
    statusFilters.some((filter) =>
      filter === 'achieved' ? achievement.unlocked : !achievement.unlocked,
    );
  const matchesReward =
    rewardFilters.length === 0 ||
    rewardFilters.includes(achievement.reward.kind);

  return matchesStatus && matchesReward;
}

function formatAchievementFilterSummary(
  statusFilters: AchievementStatusFilter[],
  rewardFilters: AchievementRewardFilter[],
) {
  const labels = [
    ...achievementStatusFilterOptions
      .filter((option) => statusFilters.includes(option.value))
      .map((option) => option.label.toLowerCase()),
    ...achievementRewardFilterOptions
      .filter((option) => rewardFilters.includes(option.value))
      .map((option) => option.label.toLowerCase()),
  ];

  if (labels.length === 0) {
    return 'all achievements';
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export default function AchievementsPanel({
  achievements,
  profileInitial,
  profilePhotoUrl,
  selectedAvatarBorderId,
  selectedProfileTitleId,
}: AchievementsPanelProps) {
  const [statusFilters, setStatusFilters] = useState<AchievementStatusFilter[]>([]);
  const [rewardFilters, setRewardFilters] = useState<AchievementRewardFilter[]>([]);
  const unlockedCount = achievements.filter((achievement) => achievement.unlocked).length;
  const unlockedCosmeticCount = achievements.filter((achievement) => achievement.unlocked).length;
  const sortedAchievements = [...achievements].sort(
    (left, right) =>
      Number(right.unlocked) - Number(left.unlocked) ||
      right.progressRatio - left.progressRatio ||
      left.targetValue - right.targetValue,
  );
  const filteredAchievements = sortedAchievements.filter((achievement) =>
    matchesAchievementFilters(achievement, statusFilters, rewardFilters),
  );
  const hasActiveFilters = statusFilters.length > 0 || rewardFilters.length > 0;
  const activeFilterSummary = formatAchievementFilterSummary(statusFilters, rewardFilters);

  return (
    <div className="achievement-layout">
      <section className="panel achievement-overview">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Achievements</p>
            <h2>Progress unlocks cosmetics</h2>
          </div>
        </div>

        <div className="achievement-overview__stats">
          <div className="achievement-overview__stat">
            <span>Unlocked</span>
            <strong>{unlockedCount}</strong>
          </div>
          <div className="achievement-overview__stat">
            <span>Total available</span>
            <strong>{achievements.length}</strong>
          </div>
          <div className="achievement-overview__stat">
            <span>Cosmetics earned</span>
            <strong>{unlockedCosmeticCount}</strong>
          </div>
        </div>

        <p className="achievement-overview__copy">
          Earn rewards by growing your collection, cataloging more species and families, traveling farther, and staying connected with friends.
        </p>

        <div className="achievement-controls">
          <div className="achievement-filter-row">
            <div className="achievement-filter-set">
              <span className="achievement-filter-set__label">Status</span>
              <div className="collection-filter-group" aria-label="Filter achievements by status">
                {achievementStatusFilterOptions.map((option) => {
                  const isActive = statusFilters.includes(option.value);

                  return (
                    <button
                      aria-pressed={isActive}
                      className={
                        isActive
                          ? 'collection-filter-chip collection-filter-chip--active'
                          : 'collection-filter-chip'
                      }
                      key={option.value}
                      onClick={() =>
                        setStatusFilters((currentFilters) =>
                          toggleFilter(currentFilters, option.value),
                        )
                      }
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="achievement-filter-set">
              <span className="achievement-filter-set__label">Reward</span>
              <div className="collection-filter-group" aria-label="Filter achievements by reward">
                {achievementRewardFilterOptions.map((option) => {
                  const isActive = rewardFilters.includes(option.value);

                  return (
                    <button
                      aria-pressed={isActive}
                      className={
                        isActive
                          ? 'collection-filter-chip collection-filter-chip--active'
                          : 'collection-filter-chip'
                      }
                      key={option.value}
                      onClick={() =>
                        setRewardFilters((currentFilters) =>
                          toggleFilter(currentFilters, option.value),
                        )
                      }
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="achievement-results-row">
            <span className="collection-results-summary achievement-results-summary">
              Showing {filteredAchievements.length} of {achievements.length} achievements
              {hasActiveFilters ? ` with ${activeFilterSummary}` : ''}
            </span>

            {hasActiveFilters ? (
              <button
                className="secondary-button achievement-controls__reset"
                onClick={() => {
                  setStatusFilters([]);
                  setRewardFilters([]);
                }}
                type="button"
              >
                Show all achievements
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {filteredAchievements.length === 0 ? (
        <div className="empty-state achievement-empty-state">
          <strong>No achievements match these filters.</strong>
          <span>Try a different combination or show everything again.</span>
          <button
            className="secondary-button"
            onClick={() => {
              setStatusFilters([]);
              setRewardFilters([]);
            }}
            type="button"
          >
            Show all achievements
          </button>
        </div>
      ) : (
        <section className="achievement-grid">
          {filteredAchievements.map((achievement) => {
            const isEquipped =
              achievement.reward.kind === 'avatar-border'
                ? achievement.reward.avatarBorderId === selectedAvatarBorderId
                : achievement.reward.profileTitleId === selectedProfileTitleId;
            const progressWidth = `${Math.round(achievement.progressRatio * 100)}%`;
            const remainingValue = Math.max(achievement.targetValue - achievement.currentValue, 0);
            const cardClassName = [
              'achievement-card',
              achievement.unlocked ? 'achievement-card--unlocked' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <article className={cardClassName} key={achievement.id}>
                <div className="achievement-card__topline">
                  <span className="achievement-card__state">
                    {achievement.unlocked ? 'Unlocked' : 'In progress'}
                  </span>
                  {isEquipped ? <span className="achievement-card__equipped">Equipped</span> : null}
                </div>

                <div className="achievement-card__copy">
                  {achievement.accentLabel ? (
                    <span className="achievement-card__eyebrow">{achievement.accentLabel}</span>
                  ) : null}
                  <h3>{achievement.name}</h3>
                  <p>{achievement.description}</p>
                  {achievement.flavorText ? (
                    <p className="achievement-card__flavor">{achievement.flavorText}</p>
                  ) : null}
                </div>

                <div className="achievement-reward">
                  {achievement.reward.kind === 'avatar-border' ? (
                    <span
                      className={`achievement-reward__preview ${getAvatarBorderClassName(
                        achievement.reward.avatarBorderId,
                      )}`.trim()}
                    >
                      {profilePhotoUrl ? (
                        <img alt="Your profile preview" src={profilePhotoUrl} />
                      ) : (
                        <span>{profileInitial}</span>
                      )}
                    </span>
                  ) : (
                    <span className="achievement-reward__title-badge">{achievement.reward.label}</span>
                  )}

                  <div className="achievement-reward__copy">
                    <span>{rewardTypeLabel(achievement)}</span>
                    <strong>{achievement.reward.label}</strong>
                    <p>{achievement.reward.description}</p>
                  </div>
                </div>

                <div className="achievement-progress">
                  <div className="achievement-progress__labels">
                    <span>{achievement.currentValue} complete</span>
                    <span>{remainingValue} needed</span>
                  </div>
                  <div className="achievement-progress__track" aria-hidden="true">
                    <span style={{ width: progressWidth }} />
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
