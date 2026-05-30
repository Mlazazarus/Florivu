import { User } from '@supabase/supabase-js';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import EarnedAchievementsSection from './EarnedAchievementsSection';
import {
  type AchievementDefinition,
  AvatarBorderDefinition,
  ProfileTitleDefinition,
  getAvatarBorderClassName,
} from '../lib/achievements';
import { connectFacebookAccount, isFacebookLoginConfigured } from '../lib/facebook';
import { Observation, UserProfile } from '../types';

const joinedDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
});

const AUTO_SAVE_DELAY_MS = 500;

export interface ProfilePanelSaveValues {
  displayName: string;
  profilePhotoFile: File | null;
  profilePhotoUrl: string | null;
  selectedAvatarBorderId: string | null;
  selectedProfileTitleId: string | null;
  featuredHousePlantObservationId: string | null;
  featuredNonHousePlantObservationId: string | null;
  homeZipCode: string;
  facebookUrl: string;
  facebookUserId: string;
  facebookName: string;
  facebookConnectedAt: string;
  isPublic: boolean;
}

export interface ProfilePanelSaveOptions {
  silent?: boolean;
}

type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error';
type FeaturedPlantPickerMode = 'house' | 'nonHouse';

function sortFeaturedPlantCandidates(observations: Observation[]) {
  return [...observations].sort((left, right) => {
    const favoriteDelta = Number(right.is_favorite) - Number(left.is_favorite);
    if (favoriteDelta !== 0) {
      return favoriteDelta;
    }

    const dateDelta =
      new Date(right.date_found).getTime() - new Date(left.date_found).getTime();
    if (dateDelta !== 0) {
      return dateDelta;
    }

    return left.common_name.localeCompare(right.common_name, undefined, {
      sensitivity: 'base',
    });
  });
}

function buildDraftSignature(values: ProfilePanelSaveValues) {
  return JSON.stringify({
    displayName: values.displayName,
    profilePhotoUrl: values.profilePhotoUrl,
    selectedAvatarBorderId: values.selectedAvatarBorderId,
    selectedProfileTitleId: values.selectedProfileTitleId,
    featuredHousePlantObservationId: values.featuredHousePlantObservationId,
    featuredNonHousePlantObservationId: values.featuredNonHousePlantObservationId,
    homeZipCode: values.homeZipCode,
    facebookUrl: values.facebookUrl,
    facebookUserId: values.facebookUserId,
    facebookName: values.facebookName,
    facebookConnectedAt: values.facebookConnectedAt,
    isPublic: values.isPublic,
    profilePhotoFile: values.profilePhotoFile
      ? {
          lastModified: values.profilePhotoFile.lastModified,
          name: values.profilePhotoFile.name,
          size: values.profilePhotoFile.size,
          type: values.profilePhotoFile.type,
        }
      : null,
  });
}

function buildPersistedProfileSignature(profile: UserProfile) {
  return JSON.stringify({
    displayName: profile.display_name,
    profilePhotoUrl: profile.profile_photo_url ?? null,
    selectedAvatarBorderId: profile.selected_avatar_border_id ?? null,
    selectedProfileTitleId: profile.selected_profile_title_id ?? null,
    featuredHousePlantObservationId: profile.featured_house_plant_observation_id ?? null,
    featuredNonHousePlantObservationId:
      profile.featured_non_house_plant_observation_id ?? null,
    homeZipCode: profile.home_zip_code ?? '',
    facebookUrl: profile.facebook_url ?? '',
    facebookUserId: profile.facebook_user_id ?? '',
    facebookName: profile.facebook_name ?? '',
    facebookConnectedAt: profile.facebook_connected_at ?? '',
    isPublic: profile.is_public,
    profilePhotoFile: null,
  });
}

interface ProfilePanelProps {
  deleteBusy: boolean;
  earnedAchievements: AchievementDefinition[];
  observationCount: number;
  observations: Observation[];
  profile: UserProfile;
  saveBusy: boolean;
  storageMode: 'supabase' | 'local';
  unlockedAvatarBorders: AvatarBorderDefinition[];
  unlockedProfileTitles: ProfileTitleDefinition[];
  uniqueSpeciesCount: number;
  user: User;
  onDeleteAccount: () => Promise<void>;
  onSave: (values: ProfilePanelSaveValues, options?: ProfilePanelSaveOptions) => Promise<void>;
}

export default function ProfilePanel({
  deleteBusy,
  earnedAchievements,
  observationCount,
  observations,
  profile,
  saveBusy,
  storageMode,
  unlockedAvatarBorders,
  unlockedProfileTitles,
  uniqueSpeciesCount,
  user,
  onDeleteAccount,
  onSave,
}: ProfilePanelProps) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [homeZipCode, setHomeZipCode] = useState(profile.home_zip_code ?? '');
  const [facebookUrl, setFacebookUrl] = useState(profile.facebook_url ?? '');
  const [facebookUserId, setFacebookUserId] = useState(profile.facebook_user_id ?? '');
  const [facebookName, setFacebookName] = useState(profile.facebook_name ?? '');
  const [facebookConnectedAt, setFacebookConnectedAt] = useState(profile.facebook_connected_at ?? '');
  const [isPublic, setIsPublic] = useState(profile.is_public);
  const [selectedProfilePhotoUrl, setSelectedProfilePhotoUrl] = useState(profile.profile_photo_url ?? null);
  const [selectedAvatarBorderId, setSelectedAvatarBorderId] = useState(
    profile.selected_avatar_border_id ?? null,
  );
  const [selectedProfileTitleId, setSelectedProfileTitleId] = useState(
    profile.selected_profile_title_id ?? null,
  );
  const [featuredHousePlantObservationId, setFeaturedHousePlantObservationId] = useState(
    profile.featured_house_plant_observation_id ?? null,
  );
  const [featuredNonHousePlantObservationId, setFeaturedNonHousePlantObservationId] = useState(
    profile.featured_non_house_plant_observation_id ?? null,
  );
  const [selectedProfilePhotoFile, setSelectedProfilePhotoFile] = useState<File | null>(null);
  const [uploadedPhotoPreviewUrl, setUploadedPhotoPreviewUrl] = useState<string | null>(null);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const [showBorderPicker, setShowBorderPicker] = useState(false);
  const [activeFeaturedPlantPicker, setActiveFeaturedPlantPicker] =
    useState<FeaturedPlantPickerMode | null>(null);
  const [connectingFacebook, setConnectingFacebook] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleteEmailInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmationEmail, setDeleteConfirmationEmail] = useState('');
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle');
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const queuedAutoSaveRef = useRef(false);
  const skipNextAutoSaveRef = useRef(true);
  const saveBusyRef = useRef(saveBusy);
  const connectingFacebookRef = useRef(connectingFacebook);
  const latestSaveValuesRef = useRef<ProfilePanelSaveValues | null>(null);
  const latestDraftSignatureRef = useRef('');
  const latestProfileRef = useRef(profile);

  useEffect(() => {
    skipNextAutoSaveRef.current = true;
    setDisplayName(profile.display_name);
    setHomeZipCode(profile.home_zip_code ?? '');
    setFacebookUrl(profile.facebook_url ?? '');
    setFacebookUserId(profile.facebook_user_id ?? '');
    setFacebookName(profile.facebook_name ?? '');
    setFacebookConnectedAt(profile.facebook_connected_at ?? '');
    setIsPublic(profile.is_public);
    setSelectedProfilePhotoUrl(profile.profile_photo_url ?? null);
    setSelectedAvatarBorderId(profile.selected_avatar_border_id ?? null);
    setSelectedProfileTitleId(profile.selected_profile_title_id ?? null);
    setFeaturedHousePlantObservationId(profile.featured_house_plant_observation_id ?? null);
    setFeaturedNonHousePlantObservationId(
      profile.featured_non_house_plant_observation_id ?? null,
    );
    setSelectedProfilePhotoFile(null);
    setUploadedPhotoPreviewUrl(null);
    setShowCollectionPicker(false);
    setShowBorderPicker(false);
    setActiveFeaturedPlantPicker(null);
    setShowDeleteDialog(false);
    setDeleteConfirmationEmail('');
    if (!autoSaveInFlightRef.current) {
      setAutoSaveState('idle');
    }
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

  useEffect(() => {
    saveBusyRef.current = saveBusy;
  }, [saveBusy]);

  useEffect(() => {
    connectingFacebookRef.current = connectingFacebook;
  }, [connectingFacebook]);

  useEffect(() => {
    if (!showDeleteDialog) {
      return;
    }

    deleteEmailInputRef.current?.focus();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleteBusy) {
        setShowDeleteDialog(false);
        setDeleteConfirmationEmail('');
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [deleteBusy, showDeleteDialog]);

  const activePhotoUrl = uploadedPhotoPreviewUrl ?? selectedProfilePhotoUrl;
  const profileInitial = (displayName.trim() || user.email || 'P').charAt(0).toUpperCase();
  const joinedDate = joinedDateFormatter.format(new Date(user.created_at));
  const privacyLabel = isPublic ? 'Visible to friends' : 'Only you';
  const facebookConnectedLabel = facebookConnectedAt
    ? joinedDateFormatter.format(new Date(facebookConnectedAt))
    : '';
  const selectedProfileTitle =
    unlockedProfileTitles.find((title) => title.id === selectedProfileTitleId) ?? null;
  const housePlantObservations = sortFeaturedPlantCandidates(
    observations.filter((observation) => observation.is_house_plant),
  );
  const nonHousePlantObservations = sortFeaturedPlantCandidates(
    observations.filter((observation) => !observation.is_house_plant),
  );
  const featuredHousePlant =
    housePlantObservations.find((observation) => observation.id === featuredHousePlantObservationId) ??
    null;
  const featuredNonHousePlant =
    nonHousePlantObservations.find(
      (observation) => observation.id === featuredNonHousePlantObservationId,
    ) ?? null;
  const activeFeaturedPlantOptions =
    activeFeaturedPlantPicker === 'house' ? housePlantObservations : nonHousePlantObservations;
  const normalizedUserEmail = user.email?.trim().toLowerCase() ?? '';
  const normalizedDeleteConfirmationEmail = deleteConfirmationEmail.trim().toLowerCase();
  const emailConfirmationRequired = normalizedUserEmail.length > 0;
  const earnedAchievementsLabel =
    earnedAchievements.length === 1 ? '1 achievement earned' : `${earnedAchievements.length} achievements earned`;
  const deleteConfirmationMatches =
    !emailConfirmationRequired || normalizedDeleteConfirmationEmail === normalizedUserEmail;
  const showDeleteEmailMismatch =
    deleteConfirmationEmail.trim().length > 0 && !deleteConfirmationMatches;

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!nextFile) {
      return;
    }

    setSelectedProfilePhotoFile(nextFile);
    setSelectedProfilePhotoUrl(null);
    setShowCollectionPicker(false);
    queueAutoSave(
      buildSaveValues({
        profilePhotoFile: nextFile,
        profilePhotoUrl: null,
      }),
      150,
    );
  };

  const handleChooseCollectionPhoto = (photoUrl: string) => {
    setSelectedProfilePhotoFile(null);
    setSelectedProfilePhotoUrl(photoUrl);
    setShowCollectionPicker(false);
    queueAutoSave(
      buildSaveValues({
        profilePhotoFile: null,
        profilePhotoUrl: photoUrl,
      }),
      150,
    );
  };

  const toggleBorderPicker = () => {
    setShowCollectionPicker(false);
    setShowBorderPicker((value) => !value);
  };

  const toggleCollectionPicker = () => {
    setShowBorderPicker(false);
    setShowCollectionPicker((value) => !value);
  };

  const buildSaveValues = (
    overrides: Partial<ProfilePanelSaveValues> = {},
  ): ProfilePanelSaveValues => ({
    displayName,
    profilePhotoFile: selectedProfilePhotoFile,
    profilePhotoUrl: selectedProfilePhotoUrl,
    selectedAvatarBorderId,
    selectedProfileTitleId,
    featuredHousePlantObservationId,
    featuredNonHousePlantObservationId,
    homeZipCode,
    facebookUrl,
    facebookUserId,
    facebookName,
    facebookConnectedAt,
    isPublic,
    ...overrides,
  });

  const runAutoSave = async () => {
    if (autoSaveInFlightRef.current) {
      queuedAutoSaveRef.current = true;
      return;
    }

    if (
      !latestSaveValuesRef.current ||
      latestDraftSignatureRef.current === buildPersistedProfileSignature(latestProfileRef.current)
    ) {
      return;
    }

    autoSaveInFlightRef.current = true;
    setAutoSaveState('saving');

    try {
      await onSave(latestSaveValuesRef.current, { silent: true });
      skipNextAutoSaveRef.current = true;
      setAutoSaveState('saved');
    } catch {
      setAutoSaveState('error');
    } finally {
      autoSaveInFlightRef.current = false;

      if (queuedAutoSaveRef.current) {
        queuedAutoSaveRef.current = false;

        if (
          latestDraftSignatureRef.current !== buildPersistedProfileSignature(latestProfileRef.current)
        ) {
          void runAutoSave();
        }
      }
    }
  };

  const queueAutoSave = (nextValues: ProfilePanelSaveValues, delay = AUTO_SAVE_DELAY_MS) => {
    latestSaveValuesRef.current = nextValues;
    latestDraftSignatureRef.current = buildDraftSignature(nextValues);

    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
    }

    if (saveBusyRef.current || connectingFacebookRef.current || autoSaveInFlightRef.current) {
      queuedAutoSaveRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      autoSaveTimeoutRef.current = null;
      void runAutoSave();
    }, delay);

    autoSaveTimeoutRef.current = timeoutId;
  };

  useEffect(() => {
    latestProfileRef.current = profile;
    latestDraftSignatureRef.current = buildPersistedProfileSignature(profile);
    latestSaveValuesRef.current = buildSaveValues({
      displayName: profile.display_name,
      facebookConnectedAt: profile.facebook_connected_at ?? '',
      facebookName: profile.facebook_name ?? '',
      facebookUrl: profile.facebook_url ?? '',
      facebookUserId: profile.facebook_user_id ?? '',
      homeZipCode: profile.home_zip_code ?? '',
      isPublic: profile.is_public,
      featuredHousePlantObservationId: profile.featured_house_plant_observation_id ?? null,
      featuredNonHousePlantObservationId:
        profile.featured_non_house_plant_observation_id ?? null,
      profilePhotoFile: null,
      profilePhotoUrl: profile.profile_photo_url ?? null,
      selectedAvatarBorderId: profile.selected_avatar_border_id ?? null,
      selectedProfileTitleId: profile.selected_profile_title_id ?? null,
    });
  }, [profile]);

  useEffect(() => {
    if (
      saveBusy ||
      connectingFacebook ||
      !queuedAutoSaveRef.current ||
      !latestSaveValuesRef.current ||
      latestDraftSignatureRef.current === buildPersistedProfileSignature(latestProfileRef.current)
    ) {
      return;
    }

    queuedAutoSaveRef.current = false;
    void runAutoSave();
  }, [connectingFacebook, runAutoSave, saveBusy]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    void runAutoSave();
  };

  const handleConnectFacebook = async () => {
    setConnectingFacebook(true);
    const previousFacebookUrl = facebookUrl;
    const previousFacebookUserId = facebookUserId;
    const previousFacebookName = facebookName;
    const previousFacebookConnectedAt = facebookConnectedAt;

    try {
      const connection = await connectFacebookAccount();
      setFacebookUserId(connection.userId);
      setFacebookName(connection.name);
      setFacebookConnectedAt(connection.connectedAt);
      if (!facebookUrl.trim()) {
        setFacebookUrl(connection.profileUrl);
      }

      await onSave(
        buildSaveValues({
          facebookConnectedAt: connection.connectedAt,
          facebookName: connection.name,
          facebookUrl: facebookUrl.trim() || connection.profileUrl,
          facebookUserId: connection.userId,
        }),
      );
      skipNextAutoSaveRef.current = true;
      setAutoSaveState('saved');
    } catch (error) {
      setFacebookUrl(previousFacebookUrl);
      setFacebookUserId(previousFacebookUserId);
      setFacebookName(previousFacebookName);
      setFacebookConnectedAt(previousFacebookConnectedAt);
      setAutoSaveState('error');
    } finally {
      setConnectingFacebook(false);
    }
  };

  const handleDisconnectFacebook = async () => {
    const previousFacebookUserId = facebookUserId;
    const previousFacebookName = facebookName;
    const previousFacebookConnectedAt = facebookConnectedAt;
    setFacebookUserId('');
    setFacebookName('');
    setFacebookConnectedAt('');

    try {
      await onSave(
        buildSaveValues({
          facebookConnectedAt: '',
          facebookName: '',
          facebookUserId: '',
        }),
      );
      skipNextAutoSaveRef.current = true;
      setAutoSaveState('saved');
    } catch (error) {
      setFacebookUserId(previousFacebookUserId);
      setFacebookName(previousFacebookName);
      setFacebookConnectedAt(previousFacebookConnectedAt);
      setAutoSaveState('error');
    }
  };

  const openDeleteDialog = () => {
    setDeleteConfirmationEmail('');
    setShowDeleteDialog(true);
  };

  const closeDeleteDialog = () => {
    if (deleteBusy) {
      return;
    }

    setShowDeleteDialog(false);
    setDeleteConfirmationEmail('');
  };

  const handleConfirmDeleteAccount = async () => {
    if (!deleteConfirmationMatches) {
      return;
    }

    await onDeleteAccount();
  };

  const handleChooseFeaturedPlant = (
    pickerMode: FeaturedPlantPickerMode,
    observationId: string | null,
  ) => {
    if (pickerMode === 'house') {
      setFeaturedHousePlantObservationId(observationId);
      queueAutoSave(
        buildSaveValues({
          featuredHousePlantObservationId: observationId,
        }),
        150,
      );
    } else {
      setFeaturedNonHousePlantObservationId(observationId);
      queueAutoSave(
        buildSaveValues({
          featuredNonHousePlantObservationId: observationId,
        }),
        150,
      );
    }

    setActiveFeaturedPlantPicker(null);
  };

  return (
    <>
      <form className="profile-layout" onSubmit={handleSubmit}>
        <section className="profile-hero panel">
          <div className="profile-hero__identity">
            <div className="profile-avatar-stack">
              <div
                className={`profile-avatar profile-avatar--hero ${getAvatarBorderClassName(
                  selectedAvatarBorderId,
                )}`.trim()}
              >
                {activePhotoUrl ? (
                  <img alt={displayName || 'Profile'} className="profile-avatar__image" src={activePhotoUrl} />
                ) : (
                  <span>{profileInitial}</span>
                )}
              </div>
              <button
                aria-expanded={showBorderPicker}
                className="ghost-link profile-avatar__border-button"
                onClick={toggleBorderPicker}
                type="button"
              >
                {showBorderPicker ? 'Hide cosmetics' : 'Change cosmetics'}
              </button>
            </div>

            <div className="profile-hero__copy">
              <p className="eyebrow">Profile</p>
              <h2>{displayName.trim() || 'Florivu user'}</h2>
              {selectedProfileTitle ? (
                <span className="achievement-reward__title-badge profile-title-badge">
                  {selectedProfileTitle.label}
                </span>
              ) : null}
              <p className="profile-hero__meta">Joined {joinedDate}</p>
              <div className="profile-chip-row">
                <span className="tag">{privacyLabel}</span>
                <span className="tag">{observationCount} saved plants</span>
                <span className="tag">{uniqueSpeciesCount} unique plants</span>
                <span className="tag">{earnedAchievementsLabel}</span>
              </div>
              <p className="profile-hero__hint">
                {storageMode === 'local'
                  ? 'Profile updates are being saved on this device until account syncing is available again.'
                  : 'Profile updates are mirrored to this device and your Florivu account.'}
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
              aria-expanded={showCollectionPicker}
              className="secondary-button"
              onClick={toggleCollectionPicker}
              type="button"
            >
              {showCollectionPicker ? 'Hide plant photos' : 'Choose from My Plants'}
            </button>
            <button
              className="ghost-link"
              onClick={() => {
                setSelectedProfilePhotoFile(null);
                setSelectedProfilePhotoUrl(null);
                queueAutoSave(
                  buildSaveValues({
                    profilePhotoFile: null,
                    profilePhotoUrl: null,
                  }),
                  150,
                );
              }}
              type="button"
            >
              Use initials avatar
            </button>
          </div>
        </section>

        {showBorderPicker ? (
          <section className="panel profile-border-picker">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Profile cosmetics</p>
                <h3>Choose your title and avatar border</h3>
              </div>
            </div>

            <div className="profile-cosmetics-group">
              <div>
                <h4>Profile title</h4>
                <p>Unlocked titles appear right under your display name on Florivu profiles.</p>
              </div>

              <div className="profile-border-grid">
                <button
                  className={
                    selectedProfileTitleId === null
                      ? 'profile-border-option profile-border-option--active'
                      : 'profile-border-option'
                  }
                  onClick={() => {
                    setSelectedProfileTitleId(null);
                    queueAutoSave(
                      buildSaveValues({
                        selectedProfileTitleId: null,
                      }),
                      150,
                    );
                  }}
                  type="button"
                >
                  <span className="achievement-reward__title-badge">No title</span>
                  <strong>Florivu default</strong>
                  <span>Show only your display name.</span>
                </button>

                {unlockedProfileTitles.map((title) => (
                  <button
                    className={
                      selectedProfileTitleId === title.id
                        ? 'profile-border-option profile-border-option--active'
                        : 'profile-border-option'
                    }
                    key={title.id}
                    onClick={() => {
                      setSelectedProfileTitleId(title.id);
                      queueAutoSave(
                        buildSaveValues({
                          selectedProfileTitleId: title.id,
                        }),
                        150,
                      );
                    }}
                    type="button"
                  >
                    <span className="achievement-reward__title-badge">{title.label}</span>
                    <strong>{title.label}</strong>
                    <span>{title.description}</span>
                  </button>
                ))}
              </div>

              <p className="profile-border-picker__hint">
                {unlockedProfileTitles.length === 0
                  ? 'Repeat one plant type 3 times, complete 2 referrals, or observe plants in 2 countries to unlock your first title.'
                  : 'Equip any title you have already unlocked from the Achievements menu.'}
              </p>
            </div>

            <div className="profile-cosmetics-group">
              <div>
                <h4>Avatar border</h4>
                <p>Borders frame your profile photo anywhere Florivu shows your avatar.</p>
              </div>

              <div className="profile-border-grid">
                <button
                  className={
                    selectedAvatarBorderId === null
                      ? 'profile-border-option profile-border-option--active'
                      : 'profile-border-option'
                  }
                  onClick={() => {
                    setSelectedAvatarBorderId(null);
                    queueAutoSave(
                      buildSaveValues({
                        selectedAvatarBorderId: null,
                      }),
                      150,
                    );
                  }}
                  type="button"
                >
                  <span className="profile-border-option__preview">
                    {activePhotoUrl ? (
                      <img alt={displayName || 'Profile'} src={activePhotoUrl} />
                    ) : (
                      <span>{profileInitial}</span>
                    )}
                  </span>
                  <strong>Florivu default</strong>
                  <span>There is no frame.</span>
                </button>

                {unlockedAvatarBorders.map((border) => (
                  <button
                    className={
                      selectedAvatarBorderId === border.id
                        ? 'profile-border-option profile-border-option--active'
                        : 'profile-border-option'
                    }
                    key={border.id}
                    onClick={() => {
                      setSelectedAvatarBorderId(border.id);
                      queueAutoSave(
                        buildSaveValues({
                          selectedAvatarBorderId: border.id,
                        }),
                        150,
                      );
                    }}
                    type="button"
                  >
                    <span
                      className={`profile-border-option__preview ${getAvatarBorderClassName(
                        border.id,
                      )}`.trim()}
                    >
                      {activePhotoUrl ? (
                        <img alt={displayName || 'Profile'} src={activePhotoUrl} />
                      ) : (
                        <span>{profileInitial}</span>
                      )}
                    </span>
                    <strong>{border.label}</strong>
                    <span>{border.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <p className="profile-border-picker__hint">
              {unlockedAvatarBorders.length === 0
                ? 'Catalog 5 observations to unlock your first light green border.'
                : 'Unlock more cosmetics from the Achievements menu in the account dropdown.'}
            </p>
          </section>
        ) : null}

        {showCollectionPicker ? (
          <section className="panel profile-photo-picker">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Plant photos</p>
                <h3>Pick a photo from My Plants</h3>
              </div>
            </div>

            {observations.length === 0 ? (
              <div className="empty-state">
                <strong>No saved plant photos yet.</strong>
                <span>Save a plant first, then you can reuse its photo for your profile.</span>
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

        <section className="panel profile-featured-plants">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Featured plants</p>
              <h3>Show off one house plant and one non-houseplant</h3>
            </div>
          </div>

          <div className="profile-featured-grid">
            <article className="profile-featured-card">
              <div className="profile-featured-card__preview">
                {featuredHousePlant ? (
                  <img
                    alt={featuredHousePlant.common_name}
                    className="profile-featured-card__image"
                    src={featuredHousePlant.photo_url}
                  />
                ) : (
                  <div className="profile-featured-card__placeholder" aria-hidden="true">
                    H
                  </div>
                )}
                <div className="profile-featured-card__meta">
                  <span className="profile-featured-card__eyebrow">Favorite house plant</span>
                  <strong>
                    {featuredHousePlant ? featuredHousePlant.common_name : 'No house plant featured yet'}
                  </strong>
                  <p>
                    {featuredHousePlant
                      ? `${featuredHousePlant.scientific_name} - saved ${joinedDateFormatter.format(
                          new Date(featuredHousePlant.date_found),
                        )}`
                      : 'Pick one of your saved house plants to pin to your profile.'}
                  </p>
                </div>
              </div>
              <div className="profile-featured-card__actions">
                <button
                  className="secondary-button"
                  onClick={() =>
                    setActiveFeaturedPlantPicker((current) =>
                      current === 'house' ? null : 'house',
                    )
                  }
                  type="button"
                >
                  {activeFeaturedPlantPicker === 'house'
                    ? 'Hide house plants'
                    : 'Choose house plant'}
                </button>
                {featuredHousePlantObservationId ? (
                  <button
                    className="ghost-link"
                    onClick={() => handleChooseFeaturedPlant('house', null)}
                    type="button"
                  >
                    Clear feature
                  </button>
                ) : null}
              </div>
            </article>

            <article className="profile-featured-card">
              <div className="profile-featured-card__preview">
                {featuredNonHousePlant ? (
                  <img
                    alt={featuredNonHousePlant.common_name}
                    className="profile-featured-card__image"
                    src={featuredNonHousePlant.photo_url}
                  />
                ) : (
                  <div className="profile-featured-card__placeholder" aria-hidden="true">
                    N
                  </div>
                )}
                <div className="profile-featured-card__meta">
                  <span className="profile-featured-card__eyebrow">Favorite non-houseplant</span>
                  <strong>
                    {featuredNonHousePlant
                      ? featuredNonHousePlant.common_name
                      : 'No non-houseplant featured yet'}
                  </strong>
                  <p>
                    {featuredNonHousePlant
                      ? `${featuredNonHousePlant.scientific_name} - saved ${joinedDateFormatter.format(
                          new Date(featuredNonHousePlant.date_found),
                        )}`
                      : 'Pick one of your saved outdoor or wild plants to pin to your profile.'}
                  </p>
                </div>
              </div>
              <div className="profile-featured-card__actions">
                <button
                  className="secondary-button"
                  onClick={() =>
                    setActiveFeaturedPlantPicker((current) =>
                      current === 'nonHouse' ? null : 'nonHouse',
                    )
                  }
                  type="button"
                >
                  {activeFeaturedPlantPicker === 'nonHouse'
                    ? 'Hide non-houseplants'
                    : 'Choose non-houseplant'}
                </button>
                {featuredNonHousePlantObservationId ? (
                  <button
                    className="ghost-link"
                    onClick={() => handleChooseFeaturedPlant('nonHouse', null)}
                    type="button"
                  >
                    Clear feature
                  </button>
                ) : null}
              </div>
            </article>
          </div>

          {activeFeaturedPlantPicker ? (
            <div className="profile-featured-picker">
              <div className="profile-featured-picker__header">
                <strong>
                  {activeFeaturedPlantPicker === 'house'
                    ? 'Choose your featured house plant'
                    : 'Choose your featured non-houseplant'}
                </strong>
                <p>
                  {activeFeaturedPlantPicker === 'house'
                    ? 'Only plants marked as house plants appear here.'
                    : 'Only plants that are not marked as house plants appear here.'}
                </p>
              </div>

              {activeFeaturedPlantOptions.length === 0 ? (
                <div className="empty-state">
                  <strong>No matching plants are ready yet.</strong>
                  <span>
                    {activeFeaturedPlantPicker === 'house'
                      ? 'Mark a saved observation as a house plant in My Plants, then come back to feature it here.'
                      : 'Save a non-houseplant observation to feature it here.'}
                  </span>
                </div>
              ) : (
                <div className="profile-photo-grid">
                  {activeFeaturedPlantOptions.map((observation) => {
                    const isSelected =
                      activeFeaturedPlantPicker === 'house'
                        ? featuredHousePlantObservationId === observation.id
                        : featuredNonHousePlantObservationId === observation.id;

                    return (
                      <button
                        className={
                          isSelected
                            ? 'profile-photo-option profile-photo-option--active'
                            : 'profile-photo-option'
                        }
                        key={observation.id}
                        onClick={() =>
                          handleChooseFeaturedPlant(activeFeaturedPlantPicker, observation.id)
                        }
                        type="button"
                      >
                        <img alt={observation.common_name} src={observation.photo_url} />
                        <span>{observation.common_name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </section>

        <EarnedAchievementsSection
          achievements={earnedAchievements}
          className="panel profile-achievements"
          description="Everything you have already unlocked shows up here so your Florivu profile reflects the progress you have made."
          emptyCopy="Catalog more plants, branch into new families and places, and connect with friends to start unlocking profile rewards."
          emptyTitle="No achievements earned yet."
          eyebrow="Achievements"
          profileInitial={profileInitial}
          profilePhotoAlt={displayName || 'Profile'}
          profilePhotoUrl={activePhotoUrl}
          selectedAvatarBorderId={selectedAvatarBorderId}
          selectedProfileTitleId={selectedProfileTitleId}
          title="Show your earned rewards"
        />

        <section className="panel profile-editor">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Edit profile</p>
            <h3>Your details and visibility</h3>
          </div>
        </div>

        <div className="profile-form-grid">
          <label className="field">
            <span>Display name</span>
            <input
              maxLength={40}
              onChange={(event) => {
                const nextDisplayName = event.target.value;
                setDisplayName(nextDisplayName);
                queueAutoSave(
                  buildSaveValues({
                    displayName: nextDisplayName,
                  }),
                );
              }}
              placeholder="Your display name"
              value={displayName}
            />
          </label>

          <label className="field">
            <span>Home ZIP code</span>
            <input
              inputMode="numeric"
              maxLength={10}
              onChange={(event) => {
                const nextHomeZipCode = event.target.value;
                setHomeZipCode(nextHomeZipCode);
                queueAutoSave(
                  buildSaveValues({
                    homeZipCode: nextHomeZipCode,
                  }),
                );
              }}
              placeholder="92101"
              value={homeZipCode}
            />
          </label>

          <label className="field field--wide">
            <span>Facebook link (optional)</span>
            <input
              onChange={(event) => {
                const nextFacebookUrl = event.target.value;
                setFacebookUrl(nextFacebookUrl);
                queueAutoSave(
                  buildSaveValues({
                    facebookUrl: nextFacebookUrl,
                  }),
                );
              }}
              placeholder="https://facebook.com/your-profile"
              value={facebookUrl}
            />
          </label>

          <div className="profile-note-card profile-note-card--wide">
            <span>Facebook connection</span>
            <strong>
              {facebookConnectedAt
                ? `Connected as ${facebookName || 'Facebook user'}`
                : 'Not connected'}
            </strong>
            <p>
              {facebookConnectedAt
                ? `Connected on ${facebookConnectedLabel}. Florivu can use this to keep your Facebook marketplace details ready.`
                : 'Connect Facebook if you want Florivu to remember your Facebook marketplace identity. This does not publish listings directly.'}
            </p>
            <div className="profile-note-card__actions">
              <button
                className="secondary-button"
                disabled={saveBusy || connectingFacebook || !isFacebookLoginConfigured()}
                onClick={() => void handleConnectFacebook()}
                type="button"
              >
                {connectingFacebook
                  ? 'Connecting Facebook...'
                  : facebookConnectedAt
                    ? 'Reconnect Facebook'
                    : 'Connect Facebook'}
              </button>
              {facebookConnectedAt ? (
                <button
                  className="ghost-link"
                  disabled={saveBusy || connectingFacebook}
                  onClick={() => void handleDisconnectFacebook()}
                  type="button"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
            {!isFacebookLoginConfigured() ? (
              <p className="profile-placeholder-copy">
                Add `VITE_FACEBOOK_APP_ID` to this Florivu build to enable Facebook Login.
              </p>
            ) : null}
          </div>

          <div className="profile-toggle-card">
            <span>Profile visibility</span>
            <label className="profile-toggle">
              <input
                checked={isPublic}
                onChange={(event) => {
                  const nextIsPublic = event.target.checked;
                  setIsPublic(nextIsPublic);
                  queueAutoSave(
                    buildSaveValues({
                      isPublic: nextIsPublic,
                    }),
                    150,
                  );
                }}
                type="checkbox"
              />
              <strong>{isPublic ? 'Visible to friends' : 'Only visible to you'}</strong>
            </label>
            <p>
              Turn this on if you want other Florivu users to find and recognize your profile more easily.
            </p>
          </div>

          <div className="profile-note-card">
            <span>Optional social link</span>
            <strong>Facebook</strong>
            <p>
              Add a Facebook link now if you want it ready for future sharing features.
            </p>
          </div>
        </div>

        <div className="profile-editor__actions">
          <p
            className={
              autoSaveState === 'error'
                ? 'profile-autosave-status profile-autosave-status--error'
                : autoSaveState === 'saved'
                  ? 'profile-autosave-status profile-autosave-status--saved'
                  : 'profile-autosave-status'
            }
            role="status"
          >
            {autoSaveState === 'saving'
              ? 'Saving changes...'
              : autoSaveState === 'saved'
                ? 'Changes saved.'
                : autoSaveState === 'error'
                  ? 'Could not save your last change.'
                  : 'Changes save automatically.'}
          </p>
          {autoSaveState === 'error' ? (
            <button
              className="secondary-button"
              disabled={saveBusy}
              onClick={() => void runAutoSave()}
              type="button"
            >
              Retry save
            </button>
          ) : null}
        </div>
        </section>

        <section className="panel profile-danger-card">
          <p className="eyebrow">Account controls</p>
          <h3>Delete account</h3>
          <p className="profile-placeholder-copy">
            This permanently removes your Florivu account and all of its saved data.
          </p>
          <button className="danger-button" disabled={deleteBusy} onClick={openDeleteDialog} type="button">
            {deleteBusy ? 'Deleting account...' : 'Delete account'}
          </button>
        </section>
      </form>

      {showDeleteDialog ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDeleteDialog}>
          <section
            aria-label="Confirm account deletion"
            aria-modal="true"
            className="modal-card modal-card--compact profile-delete-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-content">
              <p className="eyebrow">Delete account</p>
              <h2>Type your email to confirm</h2>
              <p className="profile-delete-dialog__copy">
                This permanently removes your Florivu account and saved data.
              </p>
              <label className="field">
                <span>Account email</span>
                <input
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect="off"
                  disabled={deleteBusy}
                  onChange={(event) => setDeleteConfirmationEmail(event.target.value)}
                  placeholder={user.email ?? 'Enter your account email'}
                  ref={deleteEmailInputRef}
                  spellCheck={false}
                  value={deleteConfirmationEmail}
                />
              </label>
              {emailConfirmationRequired ? (
                <p
                  className={
                    showDeleteEmailMismatch
                      ? 'profile-delete-dialog__warning'
                      : 'profile-delete-dialog__hint'
                  }
                >
                  Type {user.email} to enable account deletion.
                </p>
              ) : (
                <p className="profile-delete-dialog__hint">
                  This account email is unavailable, so deletion can continue without email matching.
                </p>
              )}
              <div className="modal-actions profile-delete-dialog__actions">
                <button className="secondary-button" disabled={deleteBusy} onClick={closeDeleteDialog} type="button">
                  Cancel
                </button>
                <button
                  className="danger-button"
                  disabled={deleteBusy || !deleteConfirmationMatches}
                  onClick={() => void handleConfirmDeleteAccount()}
                  type="button"
                >
                  {deleteBusy ? 'Deleting account...' : 'Delete account forever'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
