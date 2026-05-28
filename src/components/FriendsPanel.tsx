import { FormEvent, useEffect, useState } from 'react';
import { FriendProfile, UserProfile } from '../types';

interface FriendsPanelProps {
  addBusy: boolean;
  friends: FriendProfile[];
  incomingRequests: UserProfile[];
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
  friends,
  incomingRequests,
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
  const trimmedDisplayName = displayName.trim();

  const getDisplayName = (profile: UserProfile) =>
    profile.is_placeholder ? 'Unknown user' : profile.display_name;
  const getStatusCopy = (profile: UserProfile) =>
    profile.is_placeholder ? 'No profile has been set up yet.' : 'Wants to connect with you.';
  const formatFriendStats = (friend: FriendProfile) => {
    const speciesLabel = `${friend.species_count} species`;
    const observationLabel =
      friend.observation_count === 1
        ? '1 observation'
        : `${friend.observation_count} observations`;

    return `${speciesLabel} | ${observationLabel}`;
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void onSearchQuery(displayName).catch(() => undefined);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [displayName, onSearchQuery]);

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

  return (
    <section className="panel friends-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Friends</p>
          <h2>Incoming requests and mutual friends</h2>
          <p className="friends-panel__copy">
            Incoming requests appear first. Add someone back to turn a one-way request into a
            mutual friend.
          </p>
        </div>
      </div>

      <form className="friends-add-form" onSubmit={handleSubmit}>
        <label className="field friends-add-form__field">
          <span>Search display names</span>
          <input
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Type part of a display name"
            value={displayName}
          />
        </label>
        <button className="primary-button" disabled={addBusy || !trimmedDisplayName} type="submit">
          {addBusy ? 'Adding friend...' : 'Add selected name'}
        </button>
      </form>

      {trimmedDisplayName ? (
        <div className="friends-search-results" aria-live="polite">
          {searchBusy ? (
            <div className="empty-state friends-search-results__state">
              <strong>Searching display names...</strong>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="empty-state friends-search-results__state">
              <strong>No matching users found.</strong>
              <span>Try a different spelling or a shorter partial name.</span>
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
                  <div className="profile-avatar friend-search-option__avatar">
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
                    <span>Tap to add this user</span>
                  </div>
                  <span className="friend-search-option__cta">Add</span>
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {incomingRequests.length > 0 ? (
        <section className="friends-panel__section" aria-labelledby="incoming-requests-heading">
          <div className="friends-panel__section-header">
            <div>
              <h3 id="incoming-requests-heading">Incoming requests</h3>
              <p className="friends-panel__section-copy">
                These people already added you. Add them back to make it mutual.
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
                    <div className="profile-avatar friend-card__avatar">
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
                      {requestBusy ? 'Working...' : 'Add back'}
                    </button>
                    <button
                      className="danger-button friend-card__action"
                      disabled={requestBusy}
                      onClick={() => void onRejectRequest(request.user_id)}
                      type="button"
                    >
                      {requestBusy ? 'Working...' : 'Reject'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="profile-chip-row">
        <span className="tag">{friends.length} mutual friends</span>
        <span className="tag">{incomingRequests.length} incoming requests</span>
        <span className="tag">
          {storageMode === 'local' ? 'Local fallback store' : 'Supabase'}
        </span>
      </div>

      <section className="friends-panel__section" aria-labelledby="mutual-friends-heading">
        <div className="friends-panel__section-header">
          <div>
            <h3 id="mutual-friends-heading">Mutual friends</h3>
            <p className="friends-panel__section-copy">
              These are the people you and the other user both added.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <strong>Loading friends...</strong>
          </div>
        ) : friends.length === 0 ? (
          <div className="empty-state">
            <strong>No mutual friends yet.</strong>
            <span>Friend additions stay one-way until the other user adds you back.</span>
          </div>
        ) : (
          <div className="friends-grid">
            {friends.map((friend) => {
              const displayName = getDisplayName(friend);
              const initial = (displayName.trim() || 'F').charAt(0).toUpperCase();

              return (
                <article className="friend-card" key={friend.user_id}>
                  <div className="profile-avatar friend-card__avatar">
                    {friend.profile_photo_url ? (
                      <img
                        alt={displayName}
                        className="profile-avatar__image"
                        src={friend.profile_photo_url}
                      />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </div>
                  <div className="friend-card__meta">
                    <strong>{displayName}</strong>
                    <span className="friend-card__stats">{formatFriendStats(friend)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
