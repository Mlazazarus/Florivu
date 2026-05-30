import EarnedAchievementsSection from './EarnedAchievementsSection';
import {
  getAvatarBorderClassName,
  getEarnedAchievements,
  getProfileTitle,
} from '../lib/achievements';
import { FriendProfile } from '../types';

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'long',
});

const mediumDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
});

function formatFullDate(value: string) {
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? 'Unknown' : fullDateFormatter.format(parsedDate);
}

function formatMediumDate(value: string) {
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? 'Unknown' : mediumDateFormatter.format(parsedDate);
}

function normalizeExternalUrl(value?: string | null) {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

interface FriendProfileModalProps {
  friend: FriendProfile;
  onClose: () => void;
}

export default function FriendProfileModal({
  friend,
  onClose,
}: FriendProfileModalProps) {
  const displayName = friend.is_placeholder
    ? 'Unknown user'
    : friend.display_name.trim() || 'Florivu user';
  const initial = (displayName.trim() || 'F').charAt(0).toUpperCase();
  const activePhotoUrl = friend.profile_photo_url ?? null;
  const facebookProfileUrl = normalizeExternalUrl(friend.facebook_url);
  const earnedAchievements = getEarnedAchievements(friend.earned_achievement_ids);
  const selectedProfileTitle = getProfileTitle(friend.selected_profile_title_id ?? null);
  const savedPlantsLabel =
    friend.observation_count === 1 ? '1 saved plant' : `${friend.observation_count} saved plants`;
  const earnedAchievementsLabel =
    earnedAchievements.length === 1 ? '1 achievement earned' : `${earnedAchievements.length} achievements earned`;
  const uniquePlantsLabel =
    friend.species_count === 1 ? '1 unique plant' : `${friend.species_count} unique plants`;
  const visibilityLabel = friend.is_public ? 'Public profile' : 'Friends-only profile';
  const homeZipCodeLabel = friend.home_zip_code?.trim() || 'Not shared';
  const facebookStatusLabel = facebookProfileUrl ? 'Link shared' : 'Not shared';
  const housePlantFeatureLabel = friend.featured_house_plant_observation_id
    ? 'House plant selected'
    : 'No house plant featured yet';
  const nonHousePlantFeatureLabel = friend.featured_non_house_plant_observation_id
    ? 'Non-houseplant selected'
    : 'No non-houseplant featured yet';

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label={`${displayName} profile`}
        aria-modal="true"
        className="modal-card friend-profile-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button aria-label="Close profile" className="modal-close" onClick={onClose} type="button">
          &times;
        </button>

        <div className="modal-content">
          <div className="profile-layout friend-profile-page">
            <section className="panel profile-hero friend-profile-page__section">
              <div className="profile-hero__identity">
                <div className="profile-avatar-stack">
                  <div
                    className={`profile-avatar profile-avatar--hero ${getAvatarBorderClassName(
                      friend.selected_avatar_border_id ?? null,
                    )}`.trim()}
                  >
                    {activePhotoUrl ? (
                      <img alt={displayName} className="profile-avatar__image" src={activePhotoUrl} />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </div>
                  <span className="tag">Connected friend</span>
                </div>

                <div className="profile-hero__copy">
                  <p className="eyebrow">Friend profile</p>
                  <h2>{displayName}</h2>
                  {selectedProfileTitle ? (
                    <span className="achievement-reward__title-badge profile-title-badge">
                      {selectedProfileTitle.label}
                    </span>
                  ) : null}
                  <p className="profile-hero__meta">Joined {formatMediumDate(friend.created_at)}</p>
                  <div className="profile-chip-row">
                    <span className="tag">{visibilityLabel}</span>
                    <span className="tag">{savedPlantsLabel}</span>
                    <span className="tag">{uniquePlantsLabel}</span>
                    <span className="tag">{earnedAchievementsLabel}</span>
                  </div>
                  <p className="profile-hero__hint">
                    {friend.is_placeholder
                      ? 'This account has not finished setting up a full Florivu profile yet, so only the basic friend details are available here.'
                      : 'This read-only view follows the same profile layout as a user profile, without the editing or account controls.'}
                  </p>
                </div>
              </div>

              <div className="profile-hero__actions friend-profile-page__actions">
                {facebookProfileUrl ? (
                  <a
                    className="secondary-button friend-profile-modal__social-link"
                    href={facebookProfileUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open Facebook profile
                  </a>
                ) : null}
                <button className="secondary-button" onClick={onClose} type="button">
                  Close profile
                </button>
              </div>
            </section>

            <section className="panel profile-featured-plants">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Featured plants</p>
                  <h3>What they pinned to their profile</h3>
                </div>
              </div>

              <div className="profile-featured-grid">
                <article className="profile-featured-card friend-profile-page__feature-card">
                  <div className="profile-featured-card__preview">
                    <div className="profile-featured-card__placeholder" aria-hidden="true">
                      H
                    </div>
                    <div className="profile-featured-card__meta">
                      <span className="profile-featured-card__eyebrow">Favorite house plant</span>
                      <strong>{housePlantFeatureLabel}</strong>
                      <p>
                        {friend.featured_house_plant_observation_id
                          ? 'This friend pinned one of their saved house plants to the top of their profile.'
                          : 'This friend has not pinned a house plant to their profile yet.'}
                      </p>
                    </div>
                  </div>
                </article>

                <article className="profile-featured-card friend-profile-page__feature-card">
                  <div className="profile-featured-card__preview">
                    <div className="profile-featured-card__placeholder" aria-hidden="true">
                      N
                    </div>
                    <div className="profile-featured-card__meta">
                      <span className="profile-featured-card__eyebrow">
                        Favorite non-houseplant
                      </span>
                      <strong>{nonHousePlantFeatureLabel}</strong>
                      <p>
                        {friend.featured_non_house_plant_observation_id
                          ? 'This friend also selected a non-houseplant to highlight on their profile.'
                          : 'This friend has not highlighted a non-houseplant on their profile yet.'}
                      </p>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <section className="panel friend-profile-page__section">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Collection snapshot</p>
                  <h3>How they use Florivu</h3>
                </div>
              </div>

              <div className="profile-form-grid friend-profile-page__grid">
                <div className="profile-note-card">
                  <span>Unique plants</span>
                  <strong>{friend.species_count}</strong>
                  <p>Distinct species in this friend&apos;s saved collection.</p>
                </div>

                <div className="profile-note-card">
                  <span>Saved plants</span>
                  <strong>{friend.observation_count}</strong>
                  <p>Total saved observations currently attached to this profile.</p>
                </div>

                <div className="profile-note-card">
                  <span>Joined Florivu</span>
                  <strong>{formatFullDate(friend.created_at)}</strong>
                  <p>When this profile first appeared in Florivu.</p>
                </div>

                <div className="profile-note-card">
                  <span>Last profile update</span>
                  <strong>{formatFullDate(friend.updated_at)}</strong>
                  <p>The last time this friend saved profile changes.</p>
                </div>
              </div>
            </section>

            <section className="panel friend-profile-page__section">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Profile details</p>
                  <h3>The information they chose to share</h3>
                </div>
              </div>

              <div className="profile-form-grid friend-profile-page__grid">
                <div className="profile-note-card">
                  <span>Home ZIP code</span>
                  <strong>{homeZipCodeLabel}</strong>
                  <p>
                    {friend.home_zip_code?.trim()
                      ? 'This helps anchor their Florivu profile to a home area.'
                      : 'This friend has not shared a home ZIP code on their profile.'}
                  </p>
                </div>

                <div className="profile-note-card">
                  <span>Facebook profile</span>
                  <strong>{facebookStatusLabel}</strong>
                  <p>
                    {facebookProfileUrl
                      ? `This profile includes a Facebook link${friend.facebook_connected_at ? ` and it was connected ${formatMediumDate(friend.facebook_connected_at)}.` : '.'}`
                      : 'This friend has not shared a Facebook profile link here.'}
                  </p>
                </div>

                <div className="profile-note-card">
                  <span>Profile visibility</span>
                  <strong>{visibilityLabel}</strong>
                  <p>
                    {friend.is_public
                      ? 'This profile can also be discovered outside mutual-friend views.'
                      : 'This profile is being shown here because you are connected friends.'}
                  </p>
                </div>
              </div>
            </section>

            <EarnedAchievementsSection
              achievements={earnedAchievements}
              className="panel profile-achievements"
              description="These are the rewards this friend has already unlocked on Florivu."
              emptyCopy="This friend has not unlocked any profile achievements yet."
              emptyTitle="No earned achievements yet."
              eyebrow="Achievements"
              title="Earned achievements"
              profileInitial={initial}
              profilePhotoAlt={displayName}
              profilePhotoUrl={activePhotoUrl}
              selectedAvatarBorderId={friend.selected_avatar_border_id ?? null}
              selectedProfileTitleId={friend.selected_profile_title_id ?? null}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
