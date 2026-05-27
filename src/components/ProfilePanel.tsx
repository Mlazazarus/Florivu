import { User } from '@supabase/supabase-js';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Observation, UserProfile } from '../types';

const joinedDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
});

export interface ProfilePanelSaveValues {
  displayName: string;
  profilePhotoFile: File | null;
  profilePhotoUrl: string | null;
  homeZipCode: string;
  facebookUrl: string;
  isPublic: boolean;
}

interface ProfilePanelProps {
  deleteBusy: boolean;
  observationCount: number;
  observations: Observation[];
  profile: UserProfile;
  saveBusy: boolean;
  storageMode: 'supabase' | 'local';
  uniqueSpeciesCount: number;
  user: User;
  onDeleteAccount: () => Promise<void>;
  onSave: (values: ProfilePanelSaveValues) => Promise<void>;
}

export default function ProfilePanel({
  deleteBusy,
  observationCount,
  observations,
  profile,
  saveBusy,
  storageMode,
  uniqueSpeciesCount,
  user,
  onDeleteAccount,
  onSave,
}: ProfilePanelProps) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [homeZipCode, setHomeZipCode] = useState(profile.home_zip_code ?? '');
  const [facebookUrl, setFacebookUrl] = useState(profile.facebook_url ?? '');
  const [isPublic, setIsPublic] = useState(profile.is_public);
  const [selectedProfilePhotoUrl, setSelectedProfilePhotoUrl] = useState(profile.profile_photo_url ?? null);
  const [selectedProfilePhotoFile, setSelectedProfilePhotoFile] = useState<File | null>(null);
  const [uploadedPhotoPreviewUrl, setUploadedPhotoPreviewUrl] = useState<string | null>(null);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayName(profile.display_name);
    setHomeZipCode(profile.home_zip_code ?? '');
    setFacebookUrl(profile.facebook_url ?? '');
    setIsPublic(profile.is_public);
    setSelectedProfilePhotoUrl(profile.profile_photo_url ?? null);
    setSelectedProfilePhotoFile(null);
    setUploadedPhotoPreviewUrl(null);
  }, [profile]);

  useEffect(() => {
    if (!selectedProfilePhotoFile) {
      setUploadedPhotoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedProfilePhotoFile);
    setUploadedPhotoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedProfilePhotoFile]);

  const activePhotoUrl = uploadedPhotoPreviewUrl ?? selectedProfilePhotoUrl;
  const profileInitial = (displayName.trim() || user.email || 'P').charAt(0).toUpperCase();
  const joinedDate = joinedDateFormatter.format(new Date(user.created_at));
  const privacyLabel = isPublic ? 'Public profile' : 'Private profile';

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!nextFile) {
      return;
    }

    setSelectedProfilePhotoFile(nextFile);
    setSelectedProfilePhotoUrl(null);
    setShowCollectionPicker(false);
  };

  const handleChooseCollectionPhoto = (photoUrl: string) => {
    setSelectedProfilePhotoFile(null);
    setSelectedProfilePhotoUrl(photoUrl);
    setShowCollectionPicker(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave({
      displayName,
      profilePhotoFile: selectedProfilePhotoFile,
      profilePhotoUrl: selectedProfilePhotoUrl,
      homeZipCode,
      facebookUrl,
      isPublic,
    });
  };

  return (
    <form className="profile-layout" onSubmit={handleSubmit}>
      <section className="profile-hero panel">
        <div className="profile-hero__identity">
          <div className="profile-avatar profile-avatar--hero">
            {activePhotoUrl ? (
              <img alt={displayName || 'Profile'} className="profile-avatar__image" src={activePhotoUrl} />
            ) : (
              <span>{profileInitial}</span>
            )}
          </div>

          <div className="profile-hero__copy">
            <p className="eyebrow">Profile</p>
            <h2>{displayName.trim() || 'PlantDex user'}</h2>
            <p className="profile-hero__meta">Joined {joinedDate}</p>
            <div className="profile-chip-row">
              <span className="tag">{privacyLabel}</span>
              <span className="tag">{observationCount} observations</span>
              <span className="tag">{uniqueSpeciesCount} species</span>
            </div>
            <p className="profile-hero__hint">
              {storageMode === 'local'
                ? 'Profile edits are being stored in the local fallback server right now.'
                : 'Profile edits are stored with your PlantDex account.'}
            </p>
          </div>
        </div>

        <div className="profile-hero__actions">
          <input
            accept="image/*"
            className="sr-only"
            onChange={handleFileSelection}
            ref={fileInputRef}
            type="file"
          />
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()} type="button">
            Upload profile photo
          </button>
          <button
            className="secondary-button"
            onClick={() => setShowCollectionPicker((value) => !value)}
            type="button"
          >
            {showCollectionPicker ? 'Hide collection photos' : 'Choose from collection'}
          </button>
          <button
            className="ghost-link"
            onClick={() => {
              setSelectedProfilePhotoFile(null);
              setSelectedProfilePhotoUrl(null);
            }}
            type="button"
          >
            Use initials avatar
          </button>
        </div>
      </section>

      {showCollectionPicker ? (
        <section className="panel profile-photo-picker">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Collection photos</p>
              <h3>Pick a saved plant photo</h3>
            </div>
          </div>

          {observations.length === 0 ? (
            <div className="empty-state">
              <strong>No saved plant photos yet.</strong>
              <span>Save a plant to your collection first, then you can reuse it as a profile photo.</span>
            </div>
          ) : (
            <div className="profile-photo-grid">
              {observations.map((observation) => {
                const isSelected =
                  !selectedProfilePhotoFile && selectedProfilePhotoUrl === observation.photo_url;

                return (
                  <button
                    className={
                      isSelected
                        ? 'profile-photo-option profile-photo-option--active'
                        : 'profile-photo-option'
                    }
                    key={observation.id}
                    onClick={() => handleChooseCollectionPhoto(observation.photo_url)}
                    type="button"
                  >
                    <img alt={observation.common_name} src={observation.photo_url} />
                    <span>{observation.common_name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <section className="panel profile-editor">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Edit profile</p>
            <h3>Identity and privacy</h3>
          </div>
        </div>

        <div className="profile-form-grid">
          <label className="field">
            <span>Display name</span>
            <input
              maxLength={40}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Your display name"
              value={displayName}
            />
          </label>

          <label className="field">
            <span>Home ZIP code</span>
            <input
              inputMode="numeric"
              maxLength={10}
              onChange={(event) => setHomeZipCode(event.target.value)}
              placeholder="92101"
              value={homeZipCode}
            />
          </label>

          <label className="field field--wide">
            <span>Facebook profile</span>
            <input
              onChange={(event) => setFacebookUrl(event.target.value)}
              placeholder="https://facebook.com/your-profile"
              value={facebookUrl}
            />
          </label>

          <div className="profile-toggle-card">
            <span>Visibility</span>
            <label className="profile-toggle">
              <input
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
                type="checkbox"
              />
              <strong>{isPublic ? 'Public' : 'Private'}</strong>
            </label>
            <p>
              Public profiles are ready for future friend discovery and sharing. Private profiles stay account-only.
            </p>
          </div>

          <div className="profile-note-card">
            <span>Future integration</span>
            <strong>Facebook linking</strong>
            <p>
              Save your Facebook profile now so the account is ready when social integration is connected later.
            </p>
          </div>
        </div>

        <div className="profile-editor__actions">
          <button className="primary-button" disabled={saveBusy} type="submit">
            {saveBusy ? 'Saving profile...' : 'Save profile'}
          </button>
        </div>
      </section>

      <section className="profile-secondary-grid">
        <div className="panel profile-placeholder-card">
          <p className="eyebrow">Friends</p>
          <h3>Friends list</h3>
          <p className="profile-placeholder-copy">
            This is reserved for the future social graph. Friend requests, shared collections, and discovery can live here later.
          </p>
          <div className="profile-friends-empty">
            <strong>No friends connected yet</strong>
            <span>Future feature</span>
          </div>
        </div>

        <div className="panel profile-danger-card">
          <p className="eyebrow">Danger zone</p>
          <h3>Delete account</h3>
          <p className="profile-placeholder-copy">
            This permanently removes your Supabase auth user when the local server has a service-role key configured.
          </p>
          <button className="danger-button" disabled={deleteBusy} onClick={() => void onDeleteAccount()} type="button">
            {deleteBusy ? 'Deleting account...' : 'Delete account'}
          </button>
        </div>
      </section>
    </form>
  );
}
