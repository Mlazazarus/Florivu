import {
  type AchievementDefinition,
  getAvatarBorderClassName,
} from '../lib/achievements';

interface EarnedAchievementsSectionProps {
  achievements: AchievementDefinition[];
  className?: string;
  description: string;
  emptyCopy: string;
  emptyTitle: string;
  eyebrow?: string;
  profileInitial: string;
  profilePhotoAlt: string;
  profilePhotoUrl: string | null;
  selectedAvatarBorderId?: string | null;
  selectedProfileTitleId?: string | null;
  title: string;
}

function rewardTypeLabel(achievement: AchievementDefinition) {
  return achievement.reward.kind === 'avatar-border' ? 'Avatar border' : 'Profile title';
}

export default function EarnedAchievementsSection({
  achievements,
  className,
  description,
  emptyCopy,
  emptyTitle,
  eyebrow,
  profileInitial,
  profilePhotoAlt,
  profilePhotoUrl,
  selectedAvatarBorderId = null,
  selectedProfileTitleId = null,
  title,
}: EarnedAchievementsSectionProps) {
  const earnedCountLabel =
    achievements.length === 1 ? '1 achievement earned' : `${achievements.length} achievements earned`;

  return (
    <section className={className}>
      <div className="panel-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h3>{title}</h3>
          <p className="achievement-overview__copy">{description}</p>
        </div>
        <span className="tag profile-achievements__count">{earnedCountLabel}</span>
      </div>

      {achievements.length === 0 ? (
        <div className="empty-state achievement-empty-state">
          <strong>{emptyTitle}</strong>
          <span>{emptyCopy}</span>
        </div>
      ) : (
        <div className="achievement-grid">
          {achievements.map((achievement) => {
            const isEquipped =
              achievement.reward.kind === 'avatar-border'
                ? achievement.reward.avatarBorderId === selectedAvatarBorderId
                : achievement.reward.profileTitleId === selectedProfileTitleId;

            return (
              <article className="achievement-card achievement-card--unlocked" key={achievement.id}>
                <div className="achievement-card__topline">
                  <span className="achievement-card__state">Unlocked</span>
                  {isEquipped ? <span className="achievement-card__equipped">Equipped</span> : null}
                </div>

                <div className="achievement-card__copy">
                  <h3>{achievement.name}</h3>
                  <p>{achievement.description}</p>
                </div>

                <div className="achievement-reward">
                  {achievement.reward.kind === 'avatar-border' ? (
                    <span
                      className={`achievement-reward__preview ${getAvatarBorderClassName(
                        achievement.reward.avatarBorderId,
                      )}`.trim()}
                    >
                      {profilePhotoUrl ? (
                        <img alt={profilePhotoAlt} src={profilePhotoUrl} />
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
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
