import { FormEvent, useEffect, useState } from 'react';
import FriendProfileModal from './FriendProfileModal';
import { getAvatarBorderClassName } from '../lib/achievements';
import { sendFriendInviteEmail } from '../lib/friendInviteEmailApi';
import { FriendProfile, UserProfile } from '../types';

interface FriendsPanelProps {
  addBusy: boolean;
  completedReferralCount: number;
  friends: FriendProfile[];
  incomingRequests: UserProfile[];
  inviteSenderName: string;
  inviteSenderUserId: string;
  loading: boolean;
  requestBusy: boolean;
  searchBusy: boolean;
  searchResults: UserProfile[];
  storageMode: 'supabase' | 'local';
  onAddFriend: (displayName: string) => Promise<void>;
  onAcceptRequest: (request: UserProfile) => Promise<void>;
  onRejectRequest: (friendUserId: string) => Promise<void>;
  onSearchQuery: (query: string) => Promise<void>;
}

export default function FriendsPanel({
  addBusy,
  completedReferralCount,
  friends,
  incomingRequests,
  inviteSenderName,
  inviteSenderUserId,
  loading,
  requestBusy,
  searchBusy,
  searchResults,
  storageMode,
  onAddFriend,
  onAcceptRequest,
  onRejectRequest,
  onSearchQuery,
}: FriendsPanelProps) {
  const [displayName, setDisplayName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<FriendProfile | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<{
    tone: 'error' | 'success';
    message: string;
  } | null>(null);
  const [inviteSending, setInviteSending] = useState(false);
  const trimmedDisplayName = displayName.trim();
  const trimmedInviteEmail = inviteEmail.trim();
  const inviteSenderLabel = inviteSenderName.trim() || 'A fellow plant collector';

  const configuredInviteUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim() || '';
  const runtimeInviteUrl =
    typeof window === 'undefined'
      ? ''
      : (() => {
          const hostname = window.location.hostname;
          if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            hostname === '[::1]'
          ) {
            return '';
          }

          return window.location.origin;
        })();
  const inviteAppUrl = configuredInviteUrl || runtimeInviteUrl;
  const personalizedInviteUrl =
    !inviteAppUrl || !inviteSenderUserId.trim()
      ? inviteAppUrl
      : (() => {
          try {
            const url = new URL(inviteAppUrl);
            url.searchParams.set('invite', inviteSenderUserId.trim());
            url.searchParams.set('invite_name', inviteSenderLabel);
            return url.toString();
          } catch {
            return inviteAppUrl;
          }
        })();

  const getDisplayName = (profile: UserProfile) =>
    profile.is_placeholder ? 'Unknown user' : profile.display_name;
  const getStatusCopy = (profile: UserProfile) =>
    profile.is_placeholder ? 'This account has not finished setting up a profile yet.' : 'Wants to connect with you.';
  const formatFriendStats = (friend: FriendProfile) => {
    const speciesLabel = `${friend.species_count} unique plants`;
    const observationLabel =
      friend.observation_count === 1
        ? '1 saved plant'
        : `${friend.observation_count} saved plants`;

    return `${speciesLabel} | ${observationLabel}`;
  };
  const isValidInviteEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void onSearchQuery(displayName).catch(() => undefined);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [displayName, onSearchQuery]);

  useEffect(() => {
    if (!selectedFriend) {
      return;
    }

    const nextSelectedFriend =
      friends.find((friend) => friend.user_id === selectedFriend.user_id) ?? null;
    setSelectedFriend(nextSelectedFriend);
  }, [friends, selectedFriend]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await onAddFriend(displayName);
      setDisplayName('');
    } catch {
      return;
    }
  };

  const handleAddSuggestedFriend = async (suggestedDisplayName: string) => {
    try {
      await onAddFriend(suggestedDisplayName);
      setDisplayName('');
    } catch {
      return;
    }
  };

  const handleOpenFriendProfile = (friend: FriendProfile) => {
    setSelectedFriend(friend);
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isValidInviteEmail(trimmedInviteEmail)) {
      setInviteFeedback({
        tone: 'error',
        message: 'Enter a valid email address to send an invite.',
      });
      return;
    }

    setInviteSending(true);

    try {
      const result = await sendFriendInviteEmail({
        appUrl: inviteAppUrl,
        email: trimmedInviteEmail,
        senderName: inviteSenderLabel,
        senderUserId: inviteSenderUserId,
      });

      setInviteFeedback({
        tone: result.sent ? 'success' : 'error',
        message: result.message,
      });

      if (result.sent) {
        setInviteEmail('');
      }
    } catch (error) {
      setInviteFeedback({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'Unable to send the Florivu invite email.',
      });
    } finally {
      setInviteSending(false);
    }
  };

  return (
    <section className="panel friends-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Plant Friends</p>
          <h2>Grow your circle</h2>
          <p className="friends-panel__copy">
            Invite people by email, connect with existing members by name, and keep track of the
            friends who are building collections alongside you.
          </p>
        </div>
      </div>

      <section className="friends-panel__section" aria-labelledby="email-invite-heading">
        <div className="friends-panel__section-header">
          <div>
            <h3 id="email-invite-heading">Invite someone by email</h3>
            <p className="friends-panel__section-copy">
              Use this when a friend has not joined Florivu yet. We will send the invite email for
              you. If they create an account from your invite and add you back, it counts toward
              Seed Spreader and Dandilion.
            </p>
          </div>
          <span className="tag">Email invite</span>
        </div>

        <form className="friends-email-form" onSubmit={handleInviteSubmit}>
          <label className="field friends-email-form__field">
            <span>Recipient email</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => {
                setInviteEmail(event.target.value);
                if (inviteFeedback) {
                  setInviteFeedback(null);
                }
              }}
              placeholder="friend@example.com"
              type="email"
              value={inviteEmail}
            />
          </label>
          <button
            className="secondary-button"
            disabled={inviteSending || !trimmedInviteEmail}
            type="submit"
          >
            {inviteSending ? 'Sending...' : 'Send invite email'}
          </button>
        </form>

        <p className="field-hint friends-panel__hint">
          {personalizedInviteUrl
            ? `Your invite email will point people to ${personalizedInviteUrl}.`
            : 'Tip: set VITE_PUBLIC_APP_URL in deployed builds so invite emails include the right Florivu link.'}
        </p>

        {inviteFeedback ? (
          <div
            aria-live="polite"
            className={`friends-panel__notice friends-panel__notice--${inviteFeedback.tone}`}
            role="status"
          >
            {inviteFeedback.message}
          </div>
        ) : null}
      </section>

      <section className="friends-panel__section" aria-labelledby="add-friend-heading">
        <div className="friends-panel__section-header">
          <div>
            <h3 id="add-friend-heading">Add someone already on Florivu</h3>
            <p className="friends-panel__section-copy">
              Search by display name to send an in-app invite to an existing Florivu account.
            </p>
          </div>
        </div>

        <form className="friends-add-form" onSubmit={handleSubmit}>
          <label className="field friends-add-form__field">
            <span>Find a friend</span>
            <input
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Search by display name"
              value={displayName}
            />
          </label>
          <button className="primary-button" disabled={addBusy || !trimmedDisplayName} type="submit">
            {addBusy ? 'Sending...' : 'Send invite'}
          </button>
        </form>

        {trimmedDisplayName ? (
          <div className="friends-search-results" aria-live="polite">
            {searchBusy ? (
              <div className="empty-state friends-search-results__state">
                <strong>Searching for plant friends...</strong>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="empty-state friends-search-results__state">
                <strong>No matching people found.</strong>
                <span>Try a different spelling or invite them by email instead.</span>
              </div>
            ) : (
              searchResults.map((profile) => {
                const initial = (profile.display_name.trim() || 'U').charAt(0).toUpperCase();

                return (
                  <button
                    className="friend-search-option"
                    key={profile.user_id}
                    onClick={() => void handleAddSuggestedFriend(profile.display_name)}
                    type="button"
                  >
                    <div
                      className={`profile-avatar friend-search-option__avatar ${getAvatarBorderClassName(
                        profile.selected_avatar_border_id ?? null,
                      )}`.trim()}
                    >
                      {profile.profile_photo_url ? (
                        <img
                          alt={profile.display_name}
                          className="profile-avatar__image"
                          src={profile.profile_photo_url}
                        />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>
                    <div className="friend-search-option__meta">
                      <strong className="friend-search-option__name">{profile.display_name}</strong>
                      <span>Tap to send an invite</span>
                    </div>
                    <span className="friend-search-option__cta">Invite</span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </section>

      {incomingRequests.length > 0 ? (
        <section className="friends-panel__section" aria-labelledby="incoming-requests-heading">
          <div className="friends-panel__section-header">
            <div>
              <h3 id="incoming-requests-heading">Incoming invites</h3>
              <p className="friends-panel__section-copy">
                These people already added you. Add them back to become connected friends.
              </p>
            </div>
            <span className="tag">{incomingRequests.length}</span>
          </div>

          <div className="friends-request-grid">
            {incomingRequests.map((request) => {
              const displayName = getDisplayName(request);
              const initial = (displayName.trim() || 'R').charAt(0).toUpperCase();

              return (
                <article className="friend-card friend-card--request" key={request.user_id}>
                  <div className="friend-card__identity">
                    <div
                      className={`profile-avatar friend-card__avatar ${getAvatarBorderClassName(
                        request.selected_avatar_border_id ?? null,
                      )}`.trim()}
                    >
                      {request.profile_photo_url ? (
                        <img
                          alt={displayName}
                          className="profile-avatar__image"
                          src={request.profile_photo_url}
                        />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>
                    <div className="friend-card__meta">
                      <strong>{displayName}</strong>
                      <span>{getStatusCopy(request)}</span>
                    </div>
                  </div>
                  <div className="friend-card__actions">
                    <button
                      className="secondary-button friend-card__action"
                      disabled={requestBusy}
                      onClick={() => void onAcceptRequest(request)}
                      type="button"
                    >
                      {requestBusy ? 'Working...' : 'Accept'}
                    </button>
                    <button
                      className="danger-button friend-card__action"
                      disabled={requestBusy}
                      onClick={() => void onRejectRequest(request.user_id)}
                      type="button"
                    >
                      {requestBusy ? 'Working...' : 'Ignore'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="profile-chip-row">
        <span className="tag">{friends.length} connected friends</span>
        <span className="tag">{incomingRequests.length} incoming invites</span>
        <span className="tag">{Math.min(completedReferralCount, 2)}/2 Seed Spreader referrals</span>
        <span className="tag">{Math.min(completedReferralCount, 5)}/5 Dandilion referrals</span>
        <span className="tag">
          {storageMode === 'local' ? 'Saved on this device' : 'Synced to your account'}
        </span>
      </div>

      <section className="friends-panel__section" aria-labelledby="mutual-friends-heading">
        <div className="friends-panel__section-header">
          <div>
            <h3 id="mutual-friends-heading">Connected friends</h3>
            <p className="friends-panel__section-copy">
              These are the people you and the other user have both added. Tap a card to open
              their profile.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <strong>Loading your friends...</strong>
          </div>
        ) : friends.length === 0 ? (
          <div className="empty-state">
            <strong>No connected friends yet.</strong>
            <span>Invites stay one-way until the other person adds you back.</span>
          </div>
        ) : (
          <div className="friends-grid">
            {friends.map((friend) => {
              const displayName = getDisplayName(friend);
              const initial = (displayName.trim() || 'F').charAt(0).toUpperCase();

              return (
                <button
                  aria-haspopup="dialog"
                  aria-label={`View profile for ${displayName}`}
                  className="friend-card friend-card--interactive"
                  key={friend.user_id}
                  onClick={() => handleOpenFriendProfile(friend)}
                  type="button"
                >
                  <span
                    className={`profile-avatar friend-card__avatar ${getAvatarBorderClassName(
                      friend.selected_avatar_border_id ?? null,
                    )}`.trim()}
                  >
                    {friend.profile_photo_url ? (
                      <img
                        alt={displayName}
                        className="profile-avatar__image"
                        src={friend.profile_photo_url}
                      />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </span>
                  <span className="friend-card__meta">
                    <strong>{displayName}</strong>
                    <span className="friend-card__stats">{formatFriendStats(friend)}</span>
                  </span>
                  <span className="friend-card__cta">View profile</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedFriend ? (
        <FriendProfileModal friend={selectedFriend} onClose={() => setSelectedFriend(null)} />
      ) : null}
    </section>
  );
}
