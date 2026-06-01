import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import appLogo from '../florivuLogo.png';
import AchievementsPanel from './components/AchievementsPanel';
import AuthPanel, { type AuthMode } from './components/AuthPanel';
import CareTrackingPanel from './components/CareTrackingPanel';
import CollectionMapView from './components/CollectionMapView';
import FriendsPanel from './components/FriendsPanel';
import MarketplacePanel from './components/MarketplacePanel';
import ObservationCard from './components/ObservationCard';
import ObservationModal from './components/ObservationModal';
import ProfilePanel, {
  type ProfilePanelSaveOptions,
  ProfilePanelSaveValues,
} from './components/ProfilePanel';
import TaxonomyTree from './components/TaxonomyTree';
import { useAuth } from './hooks/useAuth';
import { useCareSchedules } from './hooks/useCareSchedules';
import { useFriends } from './hooks/useFriends';
import { usePlants } from './hooks/usePlants';
import { type SaveProfileInput, useProfile } from './hooks/useProfile';
import {
  type AchievementMetrics,
  getEarnedAchievements,
  getAchievementStatuses,
  getAvatarBorderClassName,
  getEarnedAchievementIds,
  getUnlockedProfileTitles,
  getUnlockedAvatarBorders,
  isAvatarBorderUnlocked,
  isProfileTitleUnlocked,
} from './lib/achievements';
import { deleteAccount } from './lib/accountApi';
import { sendCareAlertEmail } from './lib/careAlertEmailApi';
import {
  describeCareCadence,
  getBrowserTimeZone,
  getCalendarDateKey,
  isCareTaskDue,
  localDateInputToIso,
} from './lib/careTasks';
import { IMAGE_FILE_ACCEPT, prepareImageFile } from './lib/imageFile';
import { resolveObservationLocation } from './lib/observationLocation';
import { findPlantCatalogMatch } from './lib/plantCatalog';
import { identifyPlant } from './lib/plantApi';
import {
  buildObservationGeoMetrics,
  emptyObservationGeoMetrics,
} from './lib/locationMetrics';
import { fetchZipCodeMapLocations, normalizeZipCodeForMap } from './lib/zipCodeMap';
import { uploadPlantPhoto, uploadProfilePhoto } from './lib/storageHelper';
import { formatError, logError, logInfo } from './lib/logger';
import { observationLabelOptions } from './components/ObservationLabels';
import {
  CareTaskSchedule,
  Observation,
  OrganType,
  PlantNetResponse,
  PlantNetResult,
  TaxonomyFamily,
  UserProfile,
} from './types';

type AppTab =
  | 'identify'
  | 'collection'
  | 'care'
  | 'marketplace'
  | 'profile'
  | 'friends'
  | 'achievements'
  | 'settings';
type CollectionLabelFilter = 'is_favorite' | 'is_house_plant';
type CollectionSort = 'newest' | 'favorites-first' | 'house-plants-first' | 'common-name';
type CollectionView = 'gallery' | 'taxonomy' | 'map';

const ACTIVE_TAB_STORAGE_KEY = 'florivu.active-tab';
const SIGNUP_REFERRAL_STORAGE_KEY = 'florivu.signup-referral';
const INVITE_QUERY_KEY = 'invite';
const INVITE_NAME_QUERY_KEY = 'invite_name';
const AUTH_HCAPTCHA_SITE_KEY =
  import.meta.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY?.trim() ||
  import.meta.env.VITE_HCAPTCHA_SITE_KEY?.trim() ||
  '';

type BannerState =
  | { tone: 'error' | 'success'; message: string }
  | null;

interface PendingSignupReferral {
  referredByUserId: string;
  inviterName: string;
  signupEmail?: string;
}

const organs: Array<{ label: string; value: OrganType }> = [
  { label: 'Auto choose', value: 'auto' },
  { label: 'Leaf', value: 'leaf' },
  { label: 'Flower', value: 'flower' },
  { label: 'Fruit', value: 'fruit' },
  { label: 'Bark', value: 'bark' },
];

const collectionFilterOptions: Array<{ label: string; value: CollectionLabelFilter }> =
  observationLabelOptions.map((option) => ({
    label: option.field === 'is_favorite' ? 'Favorites' : 'House plants',
    value: option.field,
  }));

const collectionSortOptions: Array<{ label: string; value: CollectionSort }> = [
  { label: 'Newest', value: 'newest' },
  { label: 'Favorites first', value: 'favorites-first' },
  { label: 'House plants first', value: 'house-plants-first' },
  { label: 'Name A-Z', value: 'common-name' },
];

const collectionViewOptions: Array<{ label: string; value: CollectionView }> = [
  { label: 'Gallery', value: 'gallery' },
  { label: 'Taxonomy', value: 'taxonomy' },
  { label: 'Map', value: 'map' },
];

const tabHeroContent: Record<AppTab, { eyebrow: string; title: string; description: string }> = {
  identify: {
    eyebrow: 'Discover',
    title: 'Find a plant from a photo',
    description:
      'Snap a leaf, bloom, or full plant and Florivu will suggest likely matches with easy-to-read care tips.',
  },
  collection: {
    eyebrow: 'My Plants',
    title: 'Browse your collection your way',
    description:
      'Switch between a gallery of observations, a taxonomy view, and a map built from saved ZIP codes.',
  },
  care: {
    eyebrow: 'Care Tracking',
    title: 'See what your house plants need next',
    description:
      'Review every house plant in one table, spot overdue care at a glance, and mark tasks complete as you work through the shelf.',
  },
  marketplace: {
    eyebrow: 'Marketplace',
    title: 'Turn house plants into ready-to-post listings',
    description:
      'Choose a house plant, set a price, and build a listing draft with Florivu notes before you hand it off to Facebook Marketplace or OfferUp.',
  },
  profile: {
    eyebrow: 'Profile',
    title: 'Make your Florivu profile feel like yours',
    description:
      'Update your photo, name, and sharing settings so friends can recognize you and your collection.',
  },
  friends: {
    eyebrow: 'Plant Friends',
    title: 'Connect with fellow plant people',
    description:
      'Send invites, accept requests, and keep an eye on how the people in your circle are growing their collections.',
  },
  achievements: {
    eyebrow: 'Achievements',
    title: 'Unlock profile cosmetics as you grow',
    description:
      'Turn collection progress into cosmetic rewards like avatar borders and titles, then use them to personalize your Florivu profile.',
  },
  settings: {
    eyebrow: 'Account',
    title: 'Check your account and sync status',
    description:
      'Review where your plants are saved and keep your account details organized in one place.',
  },
};

function resultLabel(result: PlantNetResult) {
  return result.species.commonNames[0] ?? result.species.scientificNameWithoutAuthor;
}

function getResultCatalogMatch(result: PlantNetResult) {
  return findPlantCatalogMatch({
    commonName: resultLabel(result),
    scientificName: result.species.scientificName,
    species: result.species.scientificNameWithoutAuthor,
  });
}

function describeObservationLabels(observation: Pick<Observation, 'is_favorite' | 'is_house_plant'>) {
  const labels: string[] = [];

  if (observation.is_favorite) {
    labels.push('Favorite');
  }

  if (observation.is_house_plant) {
    labels.push('House Plant');
  }

  return labels;
}

function matchesCollectionFilters(
  observation: Observation,
  filters: CollectionLabelFilter[],
) {
  return filters.every((filter) => observation[filter]);
}

function formatCollectionFilterSummary(filters: CollectionLabelFilter[]) {
  if (filters.length === 0) {
    return 'All plants';
  }

  const labels = collectionFilterOptions
    .filter((option) => filters.includes(option.value))
    .map((option) => option.label);

  return labels.join(' and ');
}

function sortCollectionObservations(
  observations: Observation[],
  sort: CollectionSort,
) {
  const byCreatedAtDescending = (left: Observation, right: Observation) =>
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime();

  return [...observations].sort((left, right) => {
    if (sort === 'favorites-first') {
      const favoriteDelta = Number(right.is_favorite) - Number(left.is_favorite);
      return favoriteDelta || byCreatedAtDescending(left, right);
    }

    if (sort === 'house-plants-first') {
      const housePlantDelta = Number(right.is_house_plant) - Number(left.is_house_plant);
      return housePlantDelta || byCreatedAtDescending(left, right);
    }

    if (sort === 'common-name') {
      return (
        left.common_name.localeCompare(right.common_name, undefined, { sensitivity: 'base' }) ||
        byCreatedAtDescending(left, right)
      );
    }

    return byCreatedAtDescending(left, right);
  });
}

function getNormalizedObservationZipCodes(observations: Observation[]) {
  const zipCodes = new Set<string>();

  for (const observation of observations) {
    const normalizedZipCode = normalizeZipCodeForMap(observation.zip_code);
    if (normalizedZipCode) {
      zipCodes.add(normalizedZipCode);
    }
  }

  return zipCodes;
}

function normalizeObservationValue(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function getObservationSpeciesKey(
  observation: Pick<Observation, 'species' | 'scientific_name'>,
) {
  return (
    normalizeObservationValue(observation.species) ??
    normalizeObservationValue(observation.scientific_name)
  );
}

function getObservationFamilyKey(observation: Pick<Observation, 'family'>) {
  return normalizeObservationValue(observation.family);
}

function buildTaxonomyTree(observations: Observation[]): TaxonomyFamily[] {
  const familyMap = new Map<string, Map<string, Map<string, Observation[]>>>();

  for (const observation of observations) {
    if (!familyMap.has(observation.family)) {
      familyMap.set(observation.family, new Map());
    }

    const genusMap = familyMap.get(observation.family)!;
    if (!genusMap.has(observation.genus)) {
      genusMap.set(observation.genus, new Map());
    }

    const speciesMap = genusMap.get(observation.genus)!;
    const key = observation.species || observation.scientific_name;

    if (!speciesMap.has(key)) {
      speciesMap.set(key, []);
    }

    speciesMap.get(key)!.push(observation);
  }

  return Array.from(familyMap.entries())
    .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    .map(([family, genusMap]) => ({
      family,
      genera: Array.from(genusMap.entries())
        .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
        .map(([genus, speciesMap]) => ({
          genus,
          species: Array.from(speciesMap.entries())
            .map(([species, items]) => ({
              species,
              scientificName: items[0].scientific_name,
              observations: items,
            }))
            .sort(
              (left, right) =>
                right.observations.length - left.observations.length ||
                left.scientificName.localeCompare(right.scientificName, undefined, {
                  sensitivity: 'base',
                }),
            ),
        })),
    }));
}

function isAppTab(value: string | null): value is AppTab {
  return (
    value === 'identify' ||
    value === 'collection' ||
    value === 'care' ||
    value === 'marketplace' ||
    value === 'profile' ||
    value === 'friends' ||
    value === 'achievements' ||
    value === 'settings'
  );
}

function getStoredActiveTab(): AppTab {
  if (typeof window === 'undefined') {
    return 'identify';
  }

  const storedValue = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  if (storedValue === 'taxonomy') {
    return 'collection';
  }

  return isAppTab(storedValue) ? storedValue : 'identify';
}

function haveSameItems(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);
  return right.every((value) => leftSet.has(value));
}

function normalizePendingSignupReferral(value: unknown): PendingSignupReferral | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const referredByUserId =
    typeof candidate.referredByUserId === 'string' ? candidate.referredByUserId.trim() : '';
  const inviterName = typeof candidate.inviterName === 'string' ? candidate.inviterName.trim() : '';
  const signupEmail = typeof candidate.signupEmail === 'string' ? candidate.signupEmail.trim() : '';

  if (!referredByUserId) {
    return null;
  }

  return {
    referredByUserId,
    inviterName,
    signupEmail,
  };
}

function readInviteReferralFromUrl(): PendingSignupReferral | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  return normalizePendingSignupReferral({
    referredByUserId: searchParams.get(INVITE_QUERY_KEY),
    inviterName: searchParams.get(INVITE_NAME_QUERY_KEY),
  });
}

function readStoredSignupReferral(): PendingSignupReferral | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(SIGNUP_REFERRAL_STORAGE_KEY);
    return storedValue ? normalizePendingSignupReferral(JSON.parse(storedValue)) : null;
  } catch {
    return null;
  }
}

function writeStoredSignupReferral(referral: PendingSignupReferral) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SIGNUP_REFERRAL_STORAGE_KEY, JSON.stringify(referral));
}

function clearStoredSignupReferral() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(SIGNUP_REFERRAL_STORAGE_KEY);
}

export default function App() {
  const {
    session,
    user,
    loading,
    passwordRecoveryActive,
    requestPasswordReset,
    updatePassword,
    clearPasswordRecovery,
    signIn,
    signOut,
    signUp,
    resendSignUpConfirmation,
  } = useAuth();
  const {
    observations,
    loading: plantsLoading,
    error,
    fetchObservations,
    saveObservation,
    updateObservationLabels,
    updateObservationZipCode,
    deleteObservation,
    getTaxonomyTree,
    storageMode: collectionMode,
  } = usePlants(user?.id);
  const {
    friends,
    incomingRequests,
    loading: friendsLoading,
    adding: friendsAdding,
    responding: friendsResponding,
    searchResults,
    searching: friendsSearching,
    error: friendsError,
    storageMode: friendsMode,
    completedReferralCount,
    fetchFriends,
    searchProfilesByDisplayName,
    addFriendByDisplayName,
    acceptFriendRequest,
    rejectFriendRequest,
  } = useFriends(user?.id);
  const {
    profile,
    loading: profileLoading,
    saving: profileSaving,
    error: profileError,
    storageMode: profileMode,
    fetchProfile,
    saveProfile,
  } = useProfile(user?.id, user?.email);
  const {
    careTasks,
    loading: careTasksLoading,
    saving: careTasksSaving,
    error: careTasksError,
    initialized: careTasksInitialized,
    storageMode: careTasksMode,
    fetchCareTasks,
    syncBundledCareTasks,
    completeCareTask,
  } = useCareSchedules(user?.id);

  const [activeTab, setActiveTab] = useState<AppTab>(() => getStoredActiveTab());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [authCaptchaToken, setAuthCaptchaToken] = useState<string | null>(null);
  const [authCaptchaWidgetKey, setAuthCaptchaWidgetKey] = useState(0);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [organ, setOrgan] = useState<OrganType>('auto');
  const [identifying, setIdentifying] = useState(false);
  const [results, setResults] = useState<PlantNetResponse | null>(null);
  const [savingSpecies, setSavingSpecies] = useState<string | null>(null);
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null);
  const [taxonomyFocusScientificName, setTaxonomyFocusScientificName] = useState<string | null>(null);
  const [collectionFilters, setCollectionFilters] = useState<CollectionLabelFilter[]>([]);
  const [collectionSort, setCollectionSort] = useState<CollectionSort>('newest');
  const [collectionView, setCollectionView] = useState<CollectionView>('gallery');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [careAlertsEnabled, setCareAlertsEnabled] = useState(false);
  const [careAlertEmail, setCareAlertEmail] = useState('');
  const [careAlertTimezone, setCareAlertTimezone] = useState(() => getBrowserTimeZone());
  const [savingCareAlertSettings, setSavingCareAlertSettings] = useState(false);
  const [sendingCareAlertEmail, setSendingCareAlertEmail] = useState(false);
  const [observationGeoMetrics, setObservationGeoMetrics] = useState(
    emptyObservationGeoMetrics,
  );

  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const identifyInFlightRef = useRef(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const achievementSyncInFlightRef = useRef(false);
  const referralSyncInFlightRef = useRef(false);
  const careAlertEmailInFlightRef = useRef(false);

  useEffect(() => {
    logInfo('App', 'Florivu web app mounted.', { origin: window.location.origin });
  }, []);

  const resetAuthCaptcha = useCallback(() => {
    setAuthCaptchaToken(null);
    setAuthCaptchaWidgetKey((currentKey) => currentKey + 1);
  }, []);

  useEffect(() => {
    if (!user?.id || passwordRecoveryActive) {
      return;
    }

    void fetchObservations();
  }, [fetchObservations, passwordRecoveryActive, user?.id]);

  useEffect(() => {
    if (!user?.id || passwordRecoveryActive) {
      return;
    }

    void fetchFriends();
  }, [fetchFriends, passwordRecoveryActive, user?.id]);

  useEffect(() => {
    if (!user?.id || passwordRecoveryActive) {
      return;
    }

    void fetchProfile();
  }, [fetchProfile, passwordRecoveryActive, user?.id]);

  useEffect(() => {
    if (!user?.id || passwordRecoveryActive) {
      return;
    }

    void fetchCareTasks();
  }, [fetchCareTasks, passwordRecoveryActive, user?.id]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    setCareAlertsEnabled(profile.care_alerts_enabled ?? false);
    setCareAlertEmail(profile.care_alert_email ?? user?.email ?? '');
    setCareAlertTimezone(profile.care_alert_timezone ?? getBrowserTimeZone());
  }, [profile, user?.email]);

  useEffect(() => {
    if (!user?.id || !careTasksInitialized || observations.length === 0) {
      return;
    }

    void syncBundledCareTasks(observations.filter((observation) => observation.is_house_plant));
  }, [careTasksInitialized, observations, syncBundledCareTasks, user?.id]);

  const collectionZipCodes = getNormalizedObservationZipCodes(observations);
  const collectionZipCodeKey = Array.from(collectionZipCodes)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    .join('|');

  useEffect(() => {
    if (!collectionZipCodeKey) {
      setObservationGeoMetrics(emptyObservationGeoMetrics);
      return;
    }

    let cancelled = false;
    const zipCodes = collectionZipCodeKey.split('|');

    void fetchZipCodeMapLocations(zipCodes)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setObservationGeoMetrics(buildObservationGeoMetrics(result.locations));
      })
      .catch((geoMetricsError) => {
        if (cancelled) {
          return;
        }

        setObservationGeoMetrics(emptyObservationGeoMetrics);
        logError('App', 'Failed to resolve achievement geography metrics.', geoMetricsError);
      });

    return () => {
      cancelled = true;
    };
  }, [collectionZipCodeKey]);

  useEffect(() => {
    if (!error) {
      return;
    }

    setBanner({ tone: 'error', message: error });
  }, [error]);

  useEffect(() => {
    if (!profileError) {
      return;
    }

    setBanner({ tone: 'error', message: profileError });
  }, [profileError]);

  useEffect(() => {
    if (!friendsError) {
      return;
    }

    setBanner({ tone: 'error', message: friendsError });
  }, [friendsError]);

  useEffect(() => {
    if (!careTasksError) {
      return;
    }

    setBanner({ tone: 'error', message: careTasksError });
  }, [careTasksError]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);

    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!session) {
      setAuthMode('sign-in');
    }

    setPassword('');
    setResetPassword('');
    setResetPasswordConfirm('');
  }, [session]);

  const speciesCounts = new Map<string, number>();
  const familyKeys = new Set<string>();

  for (const observation of observations) {
    const speciesKey = getObservationSpeciesKey(observation);
    if (speciesKey) {
      speciesCounts.set(speciesKey, (speciesCounts.get(speciesKey) ?? 0) + 1);
    }

    const familyKey = getObservationFamilyKey(observation);
    if (familyKey) {
      familyKeys.add(familyKey);
    }
  }

  const uniqueSpeciesCount = speciesCounts.size;
  const uniqueFamilyCount = familyKeys.size;
  const repeatSpeciesCount = Array.from(speciesCounts.values()).reduce(
    (highestCount, speciesCount) => Math.max(highestCount, speciesCount),
    0,
  );
  const favoriteCount = observations.filter((observation) => observation.is_favorite).length;
  const housePlantCount = observations.filter((observation) => observation.is_house_plant).length;
  const achievementMetrics: AchievementMetrics = {
    observationCount: observations.length,
    speciesCount: uniqueSpeciesCount,
    familyCount: uniqueFamilyCount,
    repeatSpeciesCount,
    friendCount: friends.length,
    completedReferralCount,
    housePlantCount,
    cityCount: observationGeoMetrics.cityCount,
    countryCount: observationGeoMetrics.countryCount,
    continentCount: observationGeoMetrics.continentCount,
  };
  const earnedAchievementIds = getEarnedAchievementIds(
    achievementMetrics,
    profile?.earned_achievement_ids,
  );
  const earnedAchievements = getEarnedAchievements(earnedAchievementIds);
  const achievements = getAchievementStatuses(
    achievementMetrics,
    profile?.earned_achievement_ids,
  );
  const unlockedAvatarBorders = getUnlockedAvatarBorders(achievements);
  const unlockedProfileTitles = getUnlockedProfileTitles(achievements);
  const equippedAvatarBorderId =
    profile?.selected_avatar_border_id &&
    isAvatarBorderUnlocked(profile.selected_avatar_border_id, achievements)
      ? profile.selected_avatar_border_id
      : null;
  const equippedProfileTitleId =
    profile?.selected_profile_title_id &&
    isProfileTitleUnlocked(profile.selected_profile_title_id, achievements)
      ? profile.selected_profile_title_id
      : null;
  const filteredObservations = observations.filter((observation) =>
    matchesCollectionFilters(observation, collectionFilters),
  );
  const visibleObservations = sortCollectionObservations(filteredObservations, collectionSort);
  const observationsById = Object.fromEntries(
    observations.map((observation) => [observation.id, observation]),
  );
  const activeCareTasks = careTasks
    .filter(
      (task) =>
        task.task_key !== 'rotate' &&
        observationsById[task.observation_id]?.is_house_plant,
    )
    .sort((left, right) => {
      const dueDelta =
        new Date(left.next_due_at).getTime() - new Date(right.next_due_at).getTime();
      if (dueDelta !== 0) {
        return dueDelta;
      }

      return left.sort_order - right.sort_order;
    });
  const dueCareTasks = activeCareTasks.filter((task) => isCareTaskDue(task));
  const selectedObservationCareTasks = selectedObservation
    ? activeCareTasks.filter((task) => task.observation_id === selectedObservation.id)
    : [];
  const taxonomy = getTaxonomyTree();
  const collectionTaxonomy = buildTaxonomyTree(filteredObservations);
  const filteredZipCodes = getNormalizedObservationZipCodes(filteredObservations);
  const filteredSpeciesCount = new Set(
    filteredObservations.map((observation) => observation.species || observation.scientific_name),
  ).size;
  let mapReadyObservationCount = 0;

  for (const observation of filteredObservations) {
    if (!normalizeZipCodeForMap(observation.zip_code)) {
      continue;
    }

    mapReadyObservationCount += 1;
  }

  const mapReadyLocationCount = filteredZipCodes.size;
  const userEmail = user?.email ?? 'Account';
  const userLabel = profile?.display_name?.trim() || userEmail;
  const userInitial = userLabel.charAt(0).toUpperCase();
  const dueCareTaskCount = dueCareTasks.length;
  const nextDueCareTask = activeCareTasks[0] ?? null;
  const activeAuthMode: AuthMode = passwordRecoveryActive ? 'reset-password' : authMode;
  const showAuthScreen = !session || passwordRecoveryActive;
  const activeCollectionFilterLabel = formatCollectionFilterSummary(collectionFilters);
  const inviteReferral = readInviteReferralFromUrl();
  const inviteReferralName = inviteReferral?.inviterName || 'a Florivu friend';

  const persistProfileSnapshot = useCallback(
    async (overrides: Partial<SaveProfileInput>) => {
      if (!profile) {
        throw new Error('Profile unavailable.');
      }

      return saveProfile({
        display_name: profile.display_name,
        profile_photo_url: profile.profile_photo_url ?? null,
        home_zip_code: profile.home_zip_code ?? null,
        marketplace_zip_code: profile.marketplace_zip_code ?? null,
        facebook_url: profile.facebook_url ?? null,
        facebook_user_id: profile.facebook_user_id ?? null,
        facebook_name: profile.facebook_name ?? null,
        facebook_connected_at: profile.facebook_connected_at ?? null,
        earned_achievement_ids: earnedAchievementIds,
        referred_by_user_id: profile.referred_by_user_id ?? null,
        selected_avatar_border_id: profile.selected_avatar_border_id ?? null,
        selected_profile_title_id: profile.selected_profile_title_id ?? null,
        featured_house_plant_observation_id:
          profile.featured_house_plant_observation_id ?? null,
        featured_non_house_plant_observation_id:
          profile.featured_non_house_plant_observation_id ?? null,
        care_alerts_enabled: profile.care_alerts_enabled ?? false,
        care_alert_email: profile.care_alert_email ?? user?.email ?? null,
        care_alert_timezone: profile.care_alert_timezone ?? getBrowserTimeZone(),
        care_alert_last_sent_at: profile.care_alert_last_sent_at ?? null,
        is_public: profile.is_public,
        ...overrides,
      });
    },
    [earnedAchievementIds, profile, saveProfile, user?.email],
  );

  const handleSaveCareAlertSettings = useCallback(async () => {
    if (!profile) {
      throw new Error('Profile unavailable.');
    }

    setSavingCareAlertSettings(true);

    try {
      await persistProfileSnapshot({
        care_alerts_enabled: careAlertsEnabled,
        care_alert_email: careAlertEmail.trim() || null,
        care_alert_timezone: careAlertTimezone.trim() || getBrowserTimeZone(),
      });
      setBanner({ tone: 'success', message: 'Care alert settings updated.' });
    } catch (saveError) {
      setBanner({ tone: 'error', message: formatError(saveError) });
      throw saveError;
    } finally {
      setSavingCareAlertSettings(false);
    }
  }, [
    careAlertEmail,
    careAlertTimezone,
    careAlertsEnabled,
    persistProfileSnapshot,
    profile,
  ]);

  const handleSendCareAlertEmail = useCallback(
    async (options: { automatic?: boolean } = {}) => {
      if (!profile) {
        throw new Error('Profile unavailable.');
      }

      const recipientEmail = (profile.care_alert_email ?? user?.email ?? '').trim();
      if (!recipientEmail) {
        throw new Error('Add a care alert email address in Settings first.');
      }

      if (dueCareTasks.length === 0) {
        if (!options.automatic) {
          setBanner({ tone: 'success', message: 'No care reminders are due right now.' });
        }
        return;
      }

      if (careAlertEmailInFlightRef.current) {
        return;
      }

      careAlertEmailInFlightRef.current = true;
      setSendingCareAlertEmail(true);

      try {
        const deliveryResult = await sendCareAlertEmail({
          email: recipientEmail,
          displayName: profile.display_name,
          timeZone: profile.care_alert_timezone ?? careAlertTimezone ?? getBrowserTimeZone(),
          tasks: dueCareTasks,
          observationsById,
        });

        if (deliveryResult.sent) {
          await persistProfileSnapshot({
            care_alert_last_sent_at: new Date().toISOString(),
          });
        }

        if (!options.automatic) {
          setBanner({
            tone: deliveryResult.sent ? 'success' : 'error',
            message: deliveryResult.sent
              ? deliveryResult.message
              : `${deliveryResult.message}${deliveryResult.previewText ? ' A preview was generated on the local server.' : ''}`,
          });
        }
      } catch (sendError) {
        if (!options.automatic) {
          setBanner({ tone: 'error', message: formatError(sendError) });
        }
        throw sendError;
      } finally {
        careAlertEmailInFlightRef.current = false;
        setSendingCareAlertEmail(false);
      }
    },
    [
      careAlertTimezone,
      dueCareTasks,
      observationsById,
      persistProfileSnapshot,
      profile,
      user?.email,
    ],
  );

  useEffect(() => {
    if (
      !profile?.care_alerts_enabled ||
      dueCareTasks.length === 0 ||
      !profile.care_alert_email?.trim()
    ) {
      return;
    }

    const timeZone = profile.care_alert_timezone ?? careAlertTimezone ?? getBrowserTimeZone();
    const todayKey = getCalendarDateKey(new Date().toISOString(), timeZone);
    const lastSentKey = profile.care_alert_last_sent_at
      ? getCalendarDateKey(profile.care_alert_last_sent_at, timeZone)
      : null;

    if (lastSentKey === todayKey) {
      return;
    }

    void handleSendCareAlertEmail({ automatic: true }).catch((automaticEmailError) => {
      logError('App', 'Automatic care alert email failed.', automaticEmailError);
    });
  }, [
    careAlertTimezone,
    dueCareTasks.length,
    handleSendCareAlertEmail,
    profile?.care_alert_email,
    profile?.care_alert_last_sent_at,
    profile?.care_alert_timezone,
    profile?.care_alerts_enabled,
  ]);

  useEffect(() => {
    if (
      !user ||
      !profile ||
      profileSaving ||
      achievementSyncInFlightRef.current ||
      referralSyncInFlightRef.current
    ) {
      return;
    }

    const currentEarnedAchievementIds = profile.earned_achievement_ids ?? [];
    if (haveSameItems(earnedAchievementIds, currentEarnedAchievementIds)) {
      return;
    }

    achievementSyncInFlightRef.current = true;

    void saveProfile({
      display_name: profile.display_name,
      profile_photo_url: profile.profile_photo_url ?? null,
      home_zip_code: profile.home_zip_code ?? null,
      marketplace_zip_code: null,
      facebook_url: profile.facebook_url ?? null,
      facebook_user_id: profile.facebook_user_id ?? null,
      facebook_name: profile.facebook_name ?? null,
      facebook_connected_at: profile.facebook_connected_at ?? null,
      earned_achievement_ids: earnedAchievementIds,
      referred_by_user_id: profile.referred_by_user_id ?? null,
      selected_avatar_border_id: profile.selected_avatar_border_id ?? null,
      selected_profile_title_id: profile.selected_profile_title_id ?? null,
      is_public: profile.is_public,
    })
      .catch((achievementError) => {
        logError('App', 'Failed to sync earned achievements.', achievementError);
      })
      .finally(() => {
        achievementSyncInFlightRef.current = false;
      });
  }, [earnedAchievementIds, profile, profileSaving, saveProfile, user]);

  useEffect(() => {
    if (
      !user ||
      !profile ||
      profileSaving ||
      achievementSyncInFlightRef.current ||
      referralSyncInFlightRef.current
    ) {
      return;
    }

    const storedSignupReferral = readStoredSignupReferral();
    if (!storedSignupReferral) {
      return;
    }

    if (
      storedSignupReferral.signupEmail &&
      storedSignupReferral.signupEmail.toLowerCase() !==
        (user.email ? user.email.trim().toLowerCase() : '')
    ) {
      return;
    }

    if (storedSignupReferral.referredByUserId === user.id) {
      clearStoredSignupReferral();
      return;
    }

    if (profile.referred_by_user_id === storedSignupReferral.referredByUserId) {
      clearStoredSignupReferral();
      return;
    }

    if (profile.referred_by_user_id) {
      clearStoredSignupReferral();
      return;
    }

    referralSyncInFlightRef.current = true;

    void saveProfile({
      display_name: profile.display_name,
      profile_photo_url: profile.profile_photo_url ?? null,
      home_zip_code: profile.home_zip_code ?? null,
      marketplace_zip_code: null,
      facebook_url: profile.facebook_url ?? null,
      facebook_user_id: profile.facebook_user_id ?? null,
      facebook_name: profile.facebook_name ?? null,
      facebook_connected_at: profile.facebook_connected_at ?? null,
      earned_achievement_ids: profile.earned_achievement_ids ?? [],
      referred_by_user_id: storedSignupReferral.referredByUserId,
      selected_avatar_border_id: profile.selected_avatar_border_id ?? null,
      selected_profile_title_id: profile.selected_profile_title_id ?? null,
      is_public: profile.is_public,
    })
      .then(() => {
        clearStoredSignupReferral();
        setBanner({
          tone: 'success',
          message: `Invite linked. Add ${storedSignupReferral.inviterName || 'your inviter'} back in Friends to complete the connection.`,
        });
      })
      .catch((referralError) => {
        logError('App', 'Failed to sync signup referral.', referralError);
      })
      .finally(() => {
        referralSyncInFlightRef.current = false;
      });
  }, [profile, profileSaving, saveProfile, user]);

  const handleAuthModeChange = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setBanner(null);
    resetAuthCaptcha();

    if (nextMode !== 'sign-in') {
      setPassword('');
    }

    if (nextMode !== 'reset-password') {
      setResetPassword('');
      setResetPasswordConfirm('');
    }
  };

  const handleResendConfirmationEmail = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setBanner({
        tone: 'error',
        message: 'Enter your email first, then resend the confirmation email.',
      });
      return;
    }

    setBanner(null);
    setAuthBusy(true);

    try {
      await resendSignUpConfirmation(normalizedEmail);
      setBanner({
        tone: 'success',
        message:
          'Confirmation email sent if that account exists. Check spam or junk too, and wait about a minute between resend attempts.',
      });
    } catch (resendError) {
      setBanner({ tone: 'error', message: formatError(resendError) });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setBanner(null);
    let resetCaptchaAfterSubmit = false;

    try {
      if (activeAuthMode === 'forgot-password') {
        if (!email.trim()) {
          setBanner({ tone: 'error', message: 'Enter the email for your Florivu account.' });
          return;
        }

        setAuthBusy(true);
        await requestPasswordReset(email.trim());
        setBanner({
          tone: 'success',
          message: 'Reset link sent. Check your inbox and follow the email instructions.',
        });
        setAuthMode('sign-in');
        setPassword('');
        setResetPassword('');
        setResetPasswordConfirm('');
        return;
      }

      if (activeAuthMode === 'reset-password') {
        if (!resetPassword || !resetPasswordConfirm) {
          setBanner({ tone: 'error', message: 'Enter and confirm your new password.' });
          return;
        }

        if (resetPassword !== resetPasswordConfirm) {
          setBanner({ tone: 'error', message: 'The new passwords do not match.' });
          return;
        }

        setAuthBusy(true);
        await updatePassword(resetPassword);
        clearPasswordRecovery();
        setResetPassword('');
        setResetPasswordConfirm('');
        setBanner({
          tone: 'success',
          message: 'Password updated. You are ready to keep going.',
        });
        return;
      }

      if (!email.trim() || !password.trim()) {
        setBanner({ tone: 'error', message: 'Enter both an email and password.' });
        return;
      }

      setAuthBusy(true);

      if (activeAuthMode === 'sign-up') {
        if (!AUTH_HCAPTCHA_SITE_KEY) {
          setBanner({
            tone: 'error',
            message: 'Account creation is unavailable until hCaptcha is configured for Florivu.',
          });
          return;
        }

        if (!authCaptchaToken) {
          setBanner({
            tone: 'error',
            message: 'Complete the hCaptcha challenge before creating your account.',
          });
          return;
        }

        resetCaptchaAfterSubmit = true;
        const normalizedEmail = email.trim();
        const signUpResult = await signUp(
          normalizedEmail,
          password,
          inviteReferral?.referredByUserId ?? null,
          authCaptchaToken,
        );
        if (inviteReferral) {
          writeStoredSignupReferral({
            ...inviteReferral,
            signupEmail: normalizedEmail.toLowerCase(),
          });
        }
        setBanner({
          tone: 'success',
          message: signUpResult.requiresEmailConfirmation
            ? inviteReferral
              ? `Confirmation email sent to ${normalizedEmail}. Check spam or junk too, then add ${inviteReferralName} back in Friends after you confirm.`
              : `Confirmation email sent to ${normalizedEmail}. Check spam or junk too.`
            : inviteReferral
              ? `Your account is ready. Add ${inviteReferralName} back in Friends.`
              : 'Your account is ready.',
        });
        setPassword('');
      } else {
        await signIn(email.trim(), password);
      }
    } catch (submitError) {
      setBanner({ tone: 'error', message: formatError(submitError) });
    } finally {
      if (resetCaptchaAfterSubmit) {
        resetAuthCaptcha();
      }

      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setBanner({ tone: 'success', message: 'You are signed out.' });
    } catch (signOutError) {
      setBanner({ tone: 'error', message: formatError(signOutError) });
    }
  };

  const openSettings = () => {
    setActiveTab('settings');
    setAccountMenuOpen(false);
  };

  const openProfile = () => {
    setActiveTab('profile');
    setAccountMenuOpen(false);
  };

  const openAchievements = () => {
    setActiveTab('achievements');
    setAccountMenuOpen(false);
  };

  const handleAddFriend = async (displayName: string) => {
    setBanner(null);

    try {
      const result = await addFriendByDisplayName(displayName);

      if (result.isMutual) {
        setBanner({
          tone: 'success',
          message: `You are now connected with ${result.friend.display_name}.`,
        });
        return;
      }

      setBanner({
        tone: 'success',
        message: result.alreadyAdded
          ? `Your invite to ${result.friend.display_name} is still waiting for them to add you back.`
          : `Invite sent to ${result.friend.display_name}. They will appear here once they add you back.`,
      });
    } catch (addError) {
      setBanner({ tone: 'error', message: formatError(addError) });
    }
  };

  const handleAcceptRequest = async (request: UserProfile) => {
    setBanner(null);

    try {
      const result = await acceptFriendRequest(request);

      setBanner({
        tone: 'success',
        message: request.is_placeholder
          ? 'Invite accepted.'
          : `You are now connected with ${result.friend.display_name}.`,
      });
    } catch (acceptError) {
      setBanner({ tone: 'error', message: formatError(acceptError) });
    }
  };

  const handleRejectRequest = async (friendUserId: string) => {
    setBanner(null);

    try {
      await rejectFriendRequest(friendUserId);
      setBanner({
        tone: 'success',
        message: 'Invite ignored.',
      });
    } catch (rejectError) {
      setBanner({ tone: 'error', message: formatError(rejectError) });
    }
  };

  const handleSearchFriends = useCallback(async (query: string) => {
    try {
      await searchProfilesByDisplayName(query);
    } catch {
      return;
    }
  }, [searchProfilesByDisplayName]);

  const handleSaveProfile = async (
    values: ProfilePanelSaveValues,
    options: ProfilePanelSaveOptions = {},
  ) => {
    if (!user) {
      const missingUserError = new Error('Sign in before editing your profile.');
      setBanner({ tone: 'error', message: missingUserError.message });
      throw missingUserError;
    }

    if (!options.silent) {
      setBanner(null);
    }

    try {
      let nextProfilePhotoUrl = values.profilePhotoUrl;
      const housePlantObservationIds = new Set(
        observations.filter((observation) => observation.is_house_plant).map((observation) => observation.id),
      );
      const nonHousePlantObservationIds = new Set(
        observations
          .filter((observation) => !observation.is_house_plant)
          .map((observation) => observation.id),
      );
      const nextFeaturedHousePlantObservationId =
        values.featuredHousePlantObservationId &&
        housePlantObservationIds.has(values.featuredHousePlantObservationId)
          ? values.featuredHousePlantObservationId
          : null;
      const nextFeaturedNonHousePlantObservationId =
        values.featuredNonHousePlantObservationId &&
        nonHousePlantObservationIds.has(values.featuredNonHousePlantObservationId)
          ? values.featuredNonHousePlantObservationId
          : null;
      const nextSelectedAvatarBorderId =
        values.selectedAvatarBorderId &&
        isAvatarBorderUnlocked(values.selectedAvatarBorderId, achievements)
          ? values.selectedAvatarBorderId
          : null;
      const nextSelectedProfileTitleId =
        values.selectedProfileTitleId &&
        isProfileTitleUnlocked(values.selectedProfileTitleId, achievements)
          ? values.selectedProfileTitleId
          : null;

      if (values.profilePhotoFile) {
        const uploadResult = await uploadProfilePhoto(user.id, values.profilePhotoFile);
        nextProfilePhotoUrl = uploadResult.photoUrl;
      }

      await saveProfile({
        display_name: values.displayName,
        profile_photo_url: nextProfilePhotoUrl,
        home_zip_code: values.homeZipCode,
        marketplace_zip_code: null,
        facebook_url: values.facebookUrl,
        facebook_user_id: values.facebookUserId,
        facebook_name: values.facebookName,
        facebook_connected_at: values.facebookConnectedAt,
        earned_achievement_ids: earnedAchievementIds,
        selected_avatar_border_id: nextSelectedAvatarBorderId,
        selected_profile_title_id: nextSelectedProfileTitleId,
        featured_house_plant_observation_id: nextFeaturedHousePlantObservationId,
        featured_non_house_plant_observation_id: nextFeaturedNonHousePlantObservationId,
        is_public: values.isPublic,
      });

      if (!options.silent) {
        setBanner({
          tone: 'success',
          message: 'Profile updated.',
        });
      }
    } catch (saveError) {
      setBanner({ tone: 'error', message: formatError(saveError) });
      throw saveError;
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) {
      return;
    }

    setDeletingAccount(true);
    setBanner(null);

    try {
      await deleteAccount(user.id);
      setBanner({ tone: 'success', message: 'Account deleted.' });

      try {
        await signOut();
      } catch (signOutAfterDeleteError) {
        logError('App', 'Sign out after account deletion failed.', signOutAfterDeleteError);
      }
    } catch (deleteError) {
      setBanner({ tone: 'error', message: formatError(deleteError) });
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    event.target.value = '';

    if (!nextFile) {
      logInfo('App', 'File selection canceled.');
      return;
    }

    setBanner(null);

    try {
      const preparedFile = await prepareImageFile(nextFile);

      logInfo('App', 'File selected for identification.', {
        originalFileName: nextFile.name,
        originalFileType: nextFile.type,
        originalFileSize: nextFile.size,
        preparedFileName: preparedFile.name,
        preparedFileType: preparedFile.type,
        preparedFileSize: preparedFile.size,
      });

      setOriginalFile(nextFile);
      setSelectedFile(preparedFile);
      setResults(null);

      if (preparedFile.name !== nextFile.name || preparedFile.type !== nextFile.type) {
        setBanner({
          tone: 'success',
          message: `${nextFile.name} was converted to JPEG for compatibility.`,
        });
      }
    } catch (selectionError) {
      logError('App', 'File preparation failed.', selectionError);
      setBanner({ tone: 'error', message: formatError(selectionError) });
    }
  };

  const clearSelection = () => {
    logInfo('App', 'Cleared selected file and results.');
    setOriginalFile(null);
    setSelectedFile(null);
    setResults(null);
    setSavingSpecies(null);
  };

  const handleIdentify = async () => {
    if (identifyInFlightRef.current) {
      logInfo('App', 'Identify action ignored because a request is already in flight.');
      return;
    }

    if (!selectedFile) {
      setBanner({ tone: 'error', message: 'Select a photo before identifying.' });
      return;
    }

    identifyInFlightRef.current = true;
    setIdentifying(true);
    setBanner(null);
    logInfo('App', 'Identify action triggered.', {
      fileName: selectedFile.name,
      organ,
    });

    try {
      const nextResults = await identifyPlant(selectedFile, organ);
      setResults(nextResults);
      setBanner({
        tone: 'success',
        message: `We found ${nextResults.results.length} likely matches.`,
      });
    } catch (identifyError) {
      logError('App', 'Identify action failed.', identifyError);
      setBanner({ tone: 'error', message: formatError(identifyError) });
    } finally {
      identifyInFlightRef.current = false;
      setIdentifying(false);
    }
  };

  const handleSaveResult = async (result: PlantNetResult) => {
    if (!user || !selectedFile) {
      setBanner({ tone: 'error', message: 'Sign in and choose a photo before saving.' });
      return;
    }

    const speciesName = result.species.scientificNameWithoutAuthor;
    const catalogMatch = getResultCatalogMatch(result);
    setSavingSpecies(speciesName);
    setBanner(null);
    logInfo('App', 'Saving result to collection.', {
      species: speciesName,
      commonName: resultLabel(result),
      catalogPlantId: catalogMatch?.plant.id ?? null,
      careProfileId: catalogMatch?.plant.care_profile_id ?? null,
    });

    try {
      const captureFile = originalFile ?? selectedFile;
      const [captureResult, uploadResult] = await Promise.all([
        resolveObservationLocation(captureFile),
        uploadPlantPhoto(user.id, selectedFile),
      ]);
      const savedObservation = await saveObservation({
        user_id: user.id,
        photo_url: uploadResult.photoUrl,
        common_name: resultLabel(result),
        scientific_name: result.species.scientificName,
        family: result.species.family.scientificName,
        genus: result.species.genus.scientificName,
        species: result.species.scientificNameWithoutAuthor,
        confidence: result.score,
        date_found: captureResult.dateFound,
        zip_code: captureResult.zipCode,
        is_favorite: false,
        is_house_plant: false,
        catalog_plant_id: catalogMatch?.plant.id ?? null,
        care_profile_id: catalogMatch?.plant.care_profile_id ?? null,
      });

      const zipCodeMessage = savedObservation.zip_code
        ? ` Saved with ZIP ${savedObservation.zip_code}.`
        : '';
      const catalogMessage = catalogMatch?.careProfile
        ? ' A care guide is ready to view.'
        : catalogMatch?.plant
          ? ' Plant notes are ready to view.'
          : '';

      setActiveTab('collection');
      setSelectedObservation(savedObservation);
      setBanner({
        tone: 'success',
        message: `${savedObservation.common_name} was added to My Plants.${zipCodeMessage}${catalogMessage}`,
      });
    } catch (saveError) {
      logError('App', 'Save result failed.', saveError);
      setBanner({ tone: 'error', message: formatError(saveError) });
    } finally {
      setSavingSpecies(null);
    }
  };

  const handleSaveObservationZipCode = async (observation: Observation, zipCode: string | null) => {
    setBanner(null);

    try {
      const updatedObservation = await updateObservationZipCode(observation.id, zipCode);
      if (selectedObservation?.id === updatedObservation.id) {
        setSelectedObservation(updatedObservation);
      }

      setBanner({
        tone: 'success',
        message: updatedObservation.zip_code
          ? `Location note updated to ZIP ${updatedObservation.zip_code}.`
          : 'Location note cleared.',
      });
    } catch (updateError) {
      setBanner({ tone: 'error', message: formatError(updateError) });
    }
  };

  const handleSaveObservationLabels = async (
    observation: Observation,
    labels: Pick<Observation, 'is_favorite' | 'is_house_plant'>,
  ) => {
    setBanner(null);

    try {
      const updatedObservation = await updateObservationLabels(observation.id, labels);
      if (updatedObservation.is_house_plant) {
        try {
          await syncBundledCareTasks([updatedObservation]);
        } catch (careTaskSyncError) {
          logError('App', 'Observation label save succeeded, but care task sync failed.', careTaskSyncError);
        }
      }
      if (selectedObservation?.id === updatedObservation.id) {
        setSelectedObservation(updatedObservation);
      }

      const activeLabels = describeObservationLabels(updatedObservation);
      setBanner({
        tone: 'success',
        message:
          activeLabels.length > 0
            ? `${updatedObservation.common_name} labels updated: ${activeLabels.join(', ')}.`
            : `${updatedObservation.common_name} labels cleared.`,
      });
    } catch (updateError) {
      setBanner({ tone: 'error', message: formatError(updateError) });
      throw updateError;
    }
  };

  const handleCompleteCareTask = async (
    observation: Observation,
    task: CareTaskSchedule,
    completedOn: string,
  ) => {
    const completedAtIso = localDateInputToIso(completedOn);

    if (!completedAtIso) {
      setBanner({ tone: 'error', message: 'Choose a valid completion date.' });
      throw new Error('Choose a valid completion date.');
    }

    setBanner(null);

    try {
      const updatedTask = await completeCareTask(task, completedAtIso);
      if (selectedObservation?.id === observation.id) {
        setSelectedObservation(observation);
      }

      setBanner({
        tone: 'success',
        message: `${observation.common_name}: ${updatedTask.title.toLowerCase()} completed. Next reminder scheduled ${new Intl.DateTimeFormat(
          'en-US',
          { dateStyle: 'medium' },
        ).format(new Date(updatedTask.next_due_at))}.`,
      });
    } catch (completeError) {
      setBanner({ tone: 'error', message: formatError(completeError) });
      throw completeError;
    }
  };

  const openObservationTaxonomy = (observation: Observation) => {
    setTaxonomyFocusScientificName(observation.scientific_name);
    setSelectedObservation(null);
    setCollectionView('taxonomy');
    setActiveTab('collection');
  };

  const handleDeleteObservation = async (observation: Observation) => {
    const confirmed = window.confirm(`Remove ${observation.common_name} from My Plants?`);

    if (!confirmed) {
      logInfo('App', 'Observation delete canceled by user.', { id: observation.id });
      return;
    }

    try {
      await deleteObservation(observation.id);

      if (selectedObservation?.id === observation.id) {
        setSelectedObservation(null);
      }

      setBanner({
        tone: 'success',
        message: `${observation.common_name} was removed from My Plants.`,
      });
    } catch (deleteError) {
      logError('App', 'Delete observation failed.', deleteError);
      setBanner({ tone: 'error', message: formatError(deleteError) });
    }
  };

  if (loading) {
    return (
      <div className="page-shell page-shell--loading">
        <div className="loading-orb" />
        <p>Loading Florivu...</p>
      </div>
    );
  }

  if (showAuthScreen) {
    return (
      <div className="page-shell">
        <div className="auth-layout">
          <aside className="auth-hero">
            <p className="eyebrow">Your plant companion</p>
            <h1>Identify plants, save favorites, and revisit care tips anytime.</h1>
            <p className="lead">
              Use your phone or desktop to snap a plant, check likely matches, and build a collection
              that feels simple enough to use every day.
            </p>
            <div className="feature-stack">
              <div className="feature-card">
                <strong>Snap or upload in seconds</strong>
                <span>Use your camera roll or take a fresh photo when a new plant catches your eye.</span>
              </div>
              <div className="feature-card">
                <strong>Save care tips with each plant</strong>
                <span>Keep an easy reference for light, watering, and other basics right in your collection.</span>
              </div>
              <div className="feature-card">
                <strong>Browse your collection your way</strong>
                <span>See favorites, house plants, and your taxonomy groups without digging through menus.</span>
              </div>
            </div>
          </aside>

          <div>
            {banner ? (
              <div className={`banner banner--${banner.tone}`}>{banner.message}</div>
            ) : null}
            {inviteReferral ? (
              <div className="banner banner--success">
                {`You were invited by ${inviteReferralName}. Create your account, then add them back in Friends to help them earn Seed Spreader and Dandilion.`}
              </div>
            ) : null}
            <AuthPanel
              busy={authBusy}
              captchaSiteKey={AUTH_HCAPTCHA_SITE_KEY}
              captchaToken={authCaptchaToken}
              captchaWidgetKey={authCaptchaWidgetKey}
              email={email}
              mode={activeAuthMode}
              password={password}
              recoveryEmail={user?.email ?? email}
              resetPassword={resetPassword}
              resetPasswordConfirm={resetPasswordConfirm}
              onCaptchaError={() => {
                setAuthCaptchaToken(null);
                setBanner({
                  tone: 'error',
                  message: 'hCaptcha failed to load. Refresh and try creating your account again.',
                });
              }}
              onCaptchaExpire={() => setAuthCaptchaToken(null)}
              onCaptchaVerify={(token) => {
                setAuthCaptchaToken(token);
                setBanner(null);
              }}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onResetPasswordChange={setResetPassword}
              onResetPasswordConfirmChange={setResetPasswordConfirm}
              onModeChange={handleAuthModeChange}
              onResendConfirmationEmail={handleResendConfirmationEmail}
              onSubmit={handleAuthSubmit}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="app-backdrop" />
      <header className="site-header">
        <div className="header-brand">
          <img alt="Florivu" className="header-brand__logo" src={appLogo} />
          <h1 className="header-brand__wordmark">Florivu</h1>
        </div>

        <div className="header-actions">
          <nav aria-label="Primary sections" className="tab-row">
            <button
              className={activeTab === 'identify' ? 'tab-button active' : 'tab-button'}
              onClick={() => setActiveTab('identify')}
              type="button"
            >
              Discover
            </button>
            <button
              className={activeTab === 'marketplace' ? 'tab-button active' : 'tab-button'}
              onClick={() => setActiveTab('marketplace')}
              type="button"
            >
              Marketplace
            </button>
            <button
              className={activeTab === 'collection' ? 'tab-button active' : 'tab-button'}
              onClick={() => setActiveTab('collection')}
              type="button"
            >
              My Plants
            </button>
            <button
              className={activeTab === 'care' ? 'tab-button active' : 'tab-button'}
              onClick={() => setActiveTab('care')}
              type="button"
            >
              Care Tracker
            </button>
            <button
              className={activeTab === 'friends' ? 'tab-button active' : 'tab-button'}
              onClick={() => setActiveTab('friends')}
              type="button"
            >
              Friends
            </button>
          </nav>
        </div>

        <div className="header-controls">
          <div className="header-stats" aria-label="Collection stats">
            <div className="header-stat">
              <span>Observations</span>
              <strong>{observations.length}</strong>
            </div>
            <div className="header-stat">
              <span>Species</span>
              <strong>{uniqueSpeciesCount}</strong>
            </div>
            <div className="header-stat">
              <span>Families</span>
              <strong>{taxonomy.length}</strong>
            </div>
          </div>

          <div className="account-menu" ref={accountMenuRef}>
            <button
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              className="account-trigger"
              onClick={() => setAccountMenuOpen((value) => !value)}
              type="button"
            >
              <span
                className={`account-trigger__avatar ${getAvatarBorderClassName(
                  equippedAvatarBorderId,
                )}`.trim()}
              >
                {profile?.profile_photo_url ? (
                  <img
                    alt={userLabel}
                    className="account-trigger__avatar-image"
                    src={profile.profile_photo_url}
                  />
                ) : (
                  userInitial
                )}
              </span>
              <span className="account-trigger__label">
                <strong>{userLabel}</strong>
                <span>{userEmail}</span>
              </span>
              <span className="account-trigger__chevron">{accountMenuOpen ? '^' : 'v'}</span>
            </button>

            {accountMenuOpen ? (
              <div className="account-dropdown" role="menu">
                <button className="account-dropdown__item" onClick={openProfile} type="button">
                  My profile
                </button>
                <button className="account-dropdown__item" onClick={openAchievements} type="button">
                  Achievements
                </button>
                <button className="account-dropdown__item" onClick={openSettings} type="button">
                  App settings
                </button>
                <button
                  className="account-dropdown__item account-dropdown__item--danger"
                  onClick={handleSignOut}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {banner ? (
        <div className={`banner banner--${banner.tone}`}>
          <span>{banner.message}</span>
          <button aria-label="Dismiss message" onClick={() => setBanner(null)} type="button">
            ×
          </button>
        </div>
      ) : null}

      <main className="workspace">
        <section className="hero-strip">
          <div className="hero-copy">
            <p className="eyebrow">{tabHeroContent[activeTab].eyebrow}</p>
            <h2>{tabHeroContent[activeTab].title}</h2>
            <p>{tabHeroContent[activeTab].description}</p>
          </div>
          <div className="hero-metrics" aria-label="Quick collection overview">
            <div className="metric-card">
              <span>Observations</span>
              <strong>{observations.length}</strong>
            </div>
            <div className="metric-card">
              <span>Favorites</span>
              <strong>{favoriteCount}</strong>
            </div>
            <div className="metric-card">
              <span>My plants</span>
              <strong>{housePlantCount}</strong>
            </div>
          </div>
        </section>

        {activeTab === 'identify' ? (
          <section className="panel-stack panel-stack--identify">
            <div className="panel panel--identify-input">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Photo</p>
                  <h2>Choose a clear plant photo</h2>
                </div>
                {selectedFile ? (
                  <button className="ghost-link" onClick={clearSelection} type="button">
                    Start over
                  </button>
                ) : null}
              </div>

              <div className="upload-layout">
                <div className="upload-card upload-card--compact">
                  {previewUrl ? (
                    <img
                      alt={selectedFile?.name ?? 'Selected plant'}
                      className="preview-image preview-image--compact"
                      src={previewUrl}
                    />
                  ) : (
                    <div className="preview-placeholder preview-placeholder--compact">
                      <strong>No photo yet.</strong>
                      <span>Use your camera or choose a picture from your library to get started.</span>
                    </div>
                  )}
                </div>

                <div className="upload-controls">
                  <input
                    accept={IMAGE_FILE_ACCEPT}
                    className="sr-only"
                    onChange={handleFileSelection}
                    ref={libraryInputRef}
                    type="file"
                  />
                  <input
                    accept={IMAGE_FILE_ACCEPT}
                    capture="environment"
                    className="sr-only"
                    onChange={handleFileSelection}
                    ref={cameraInputRef}
                    type="file"
                  />

                  <div className="button-cluster">
                    <button
                      className="primary-button"
                      onClick={() => libraryInputRef.current?.click()}
                      type="button"
                    >
                      Choose photo
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => cameraInputRef.current?.click()}
                      type="button"
                    >
                      Take photo
                    </button>
                  </div>

                  <label className="field">
                    <span>Focus on</span>
                    <select
                      value={organ}
                      onChange={(event) => setOrgan(event.target.value as OrganType)}
                    >
                      {organs.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    className="primary-button primary-button--wide"
                    disabled={!selectedFile || identifying}
                    onClick={handleIdentify}
                    type="button"
                  >
                    {identifying ? 'Finding matches...' : 'Find my plant'}
                  </button>

                  <p className="field-hint">
                    Clear close-up photos in natural light usually work best. JPG, PNG, WebP, HEIC, HEIF, GIF, BMP, and AVIF are accepted.
                  </p>
                </div>
              </div>
            </div>

            <div className="panel panel--results">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Matches</p>
                  <h2>Review your best matches</h2>
                </div>
              </div>

              {results ? (
                <div className="result-stack">
                  {results.results.map((result, index) => {
                    const catalogMatch = getResultCatalogMatch(result);

                    return (
                      <article
                        className={index === 0 ? 'result-card result-card--lead' : 'result-card'}
                        key={result.species.scientificName}
                      >
                        <div className="result-heading">
                          <div>
                            <span className="result-rank">{index === 0 ? 'Top match' : `Option ${index + 1}`}</span>
                            <h3>{resultLabel(result)}</h3>
                            <p>{result.species.scientificName}</p>
                          </div>
                          <strong>{Math.round(result.score * 100)}%</strong>
                        </div>

                        <div className="tag-row">
                          <span className="tag">{result.species.family.scientificName}</span>
                          <span className="tag">{result.species.genus.scientificName}</span>
                          <span className="tag">{result.species.scientificNameWithoutAuthor}</span>
                        </div>

                        <div className={catalogMatch ? 'result-catalog-preview' : 'result-catalog-preview result-catalog-preview--muted'}>
                          <span className="result-catalog-preview__eyebrow">
                            {catalogMatch ? 'Care overview included' : 'Care overview'}
                          </span>
                          <strong>
                            {catalogMatch?.careProfile?.name ?? 'No saved care guide yet'}
                          </strong>
                          <p>
                            {catalogMatch?.plant.care_summary ??
                              'You can still save this plant, but Florivu does not have a bundled care guide for it yet.'}
                          </p>
                        </div>

                        <button
                          className="secondary-button"
                          disabled={savingSpecies === result.species.scientificNameWithoutAuthor}
                          onClick={() => handleSaveResult(result)}
                          type="button"
                        >
                          {savingSpecies === result.species.scientificNameWithoutAuthor ? 'Saving...' : 'Add to My Plants'}
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No matches yet.</strong>
                  <span>Add a photo and Florivu will show likely matches here.</span>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'collection' ? (
          <section className="panel-stack">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Collection</p>
                  <h2>
                    {collectionView === 'gallery'
                      ? 'Browse your saved observations'
                      : collectionView === 'taxonomy'
                        ? 'Browse your collection by taxonomy'
                        : 'See your plants on the map'}
                  </h2>
                </div>
                {observations.length > 0 ? (
                  <div className="collection-view-toggle" aria-label="Collection view">
                    {collectionViewOptions.map((option) => (
                      <button
                        aria-pressed={collectionView === option.value}
                        className={
                          collectionView === option.value
                            ? 'collection-view-button collection-view-button--active'
                            : 'collection-view-button'
                        }
                        key={option.value}
                        onClick={() => setCollectionView(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {observations.length > 0 ? (
                <div className="collection-controls">
                  <div className="collection-filter-group" aria-label="Filter saved plants">
                    {collectionFilterOptions.map((option) => (
                      <button
                        className={
                          collectionFilters.includes(option.value)
                            ? 'collection-filter-chip collection-filter-chip--active'
                            : 'collection-filter-chip'
                        }
                        key={option.value}
                        onClick={() =>
                          setCollectionFilters((currentFilters) =>
                            currentFilters.includes(option.value)
                              ? currentFilters.filter((filter) => filter !== option.value)
                              : [...currentFilters, option.value]
                          )
                        }
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="collection-sort-row">
                    <span className="collection-results-summary">
                      {collectionView === 'gallery'
                        ? `Showing ${visibleObservations.length} of ${observations.length} observations`
                        : collectionView === 'taxonomy'
                          ? `Showing ${filteredObservations.length} observations across ${filteredSpeciesCount} species`
                          : `Showing ${mapReadyObservationCount} of ${filteredObservations.length} observations with ZIP codes across ${mapReadyLocationCount} locations`}
                      {collectionFilters.length > 0 ? ` with ${activeCollectionFilterLabel}` : ''}
                    </span>

                    {collectionView === 'gallery' ? (
                      <label className="field collection-sort-field">
                        <span>Sort</span>
                        <select
                          onChange={(event) => setCollectionSort(event.target.value as CollectionSort)}
                          value={collectionSort}
                        >
                          {collectionSortOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {plantsLoading && observations.length === 0 ? (
                <div className="empty-state">
                  <strong>Loading your plants...</strong>
                </div>
              ) : observations.length === 0 ? (
                <div className="empty-state">
                  <strong>Your plant shelf is empty.</strong>
                  <span>Discover a plant first, then save it to My Plants.</span>
                </div>
              ) : filteredObservations.length === 0 ? (
                <div className="empty-state">
                  <strong>No plants match {activeCollectionFilterLabel.toLowerCase()}.</strong>
                  <span>Try a different filter or head back to all of your saved plants.</span>
                  {collectionFilters.length > 0 ? (
                    <button className="secondary-button" onClick={() => setCollectionFilters([])} type="button">
                      Show all plants
                    </button>
                  ) : null}
                </div>
              ) : collectionView === 'gallery' ? (
                <div className="collection-grid">
                  {visibleObservations.map((observation) => (
                    <ObservationCard
                      key={observation.id}
                      observation={observation}
                      onDelete={handleDeleteObservation}
                      onOpen={setSelectedObservation}
                      onOpenTaxonomy={openObservationTaxonomy}
                    />
                  ))}
                </div>
              ) : collectionView === 'taxonomy' ? (
                <TaxonomyTree
                  activeScientificName={taxonomyFocusScientificName}
                  families={collectionTaxonomy}
                  onSelectObservation={setSelectedObservation}
                />
              ) : (
                <CollectionMapView
                  observations={filteredObservations}
                  onSelectObservation={setSelectedObservation}
                />
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'care' ? (
          <section className="panel-stack">
            <CareTrackingPanel
              careTasks={activeCareTasks}
              loading={careTasksLoading}
              observations={observations}
              onCompleteTask={handleCompleteCareTask}
              onOpenObservation={setSelectedObservation}
              saving={careTasksSaving}
              storageMode={careTasksMode}
            />
          </section>
        ) : null}

        {activeTab === 'marketplace' ? (
          <section className="panel-stack">
            <MarketplacePanel observations={observations} onOpenProfile={openProfile} profile={profile} />
          </section>
        ) : null}

        {activeTab === 'settings' ? (
          <section className="panel-stack">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Settings</p>
                  <h2>Account overview</h2>
                </div>
              </div>

              <div className="settings-grid">
                <div className="settings-card">
                  <span>Signed in as</span>
                  <strong>{userLabel}</strong>
                  <p>
                    Use the header tabs for discovery, your collection, care tracking,
                    marketplace, and friends. The account menu keeps profile,
                    achievements, and settings in one place.
                  </p>
                </div>
                <div className="settings-card">
                  <span>Sync status</span>
                  <strong>{collectionMode === 'local' ? 'Saved on this device' : 'Synced to your account'}</strong>
                  <p>
                    {collectionMode === 'local'
                      ? 'Your plants are currently being stored on this device while account syncing is unavailable.'
                      : 'Your plants are being saved with your Florivu account so they travel with you.'}
                  </p>
                </div>
                <div className="settings-card">
                  <span>Collection summary</span>
                  <strong>{observations.length} saved plants</strong>
                  <p>
                    {uniqueSpeciesCount} unique plants across {taxonomy.length} families.
                  </p>
                </div>
                <div className="settings-card">
                  <span>Care reminders</span>
                  <strong>{dueCareTaskCount} due now</strong>
                  <p>
                    {nextDueCareTask
                      ? `Next up: ${observationsById[nextDueCareTask.observation_id]?.common_name ?? 'Saved plant'} - ${nextDueCareTask.title.toLowerCase()}.`
                      : 'Mark house plants in My Plants to start building care schedules.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Care alerts</p>
                  <h2>Email reminders for your house plants</h2>
                </div>
              </div>

              <form
                className="care-alert-settings"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSaveCareAlertSettings();
                }}
              >
                <div className="care-alert-settings__grid">
                  <div className="profile-toggle-card">
                    <span>Enable alerts</span>
                    <label className="profile-toggle">
                      <input
                        checked={careAlertsEnabled}
                        onChange={(event) => setCareAlertsEnabled(event.target.checked)}
                        type="checkbox"
                      />
                      <strong>
                        {careAlertsEnabled
                          ? 'Email reminders are enabled'
                          : 'Email reminders are paused'}
                      </strong>
                    </label>
                    <p>
                      Florivu will use each plant&apos;s saved care schedule and send due reminders
                      by email first.
                    </p>
                  </div>

                  <label className="field">
                    <span>Reminder email</span>
                    <input
                      autoComplete="email"
                      inputMode="email"
                      onChange={(event) => setCareAlertEmail(event.target.value)}
                      placeholder={user?.email ?? 'you@example.com'}
                      type="email"
                      value={careAlertEmail}
                    />
                  </label>

                  <label className="field">
                    <span>Time zone</span>
                    <input
                      onChange={(event) => setCareAlertTimezone(event.target.value)}
                      placeholder="America/Los_Angeles"
                      value={careAlertTimezone}
                    />
                  </label>

                  <div className="profile-note-card">
                    <span>Delivery status</span>
                    <strong>
                      {profile?.care_alert_last_sent_at
                        ? `Last email: ${new Intl.DateTimeFormat('en-US', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(profile.care_alert_last_sent_at))}`
                        : 'No care email sent yet'}
                    </strong>
                    <p>
                      Delivery works from the local server when `RESEND_API_KEY` and
                      `CARE_ALERT_FROM_EMAIL` are configured.
                    </p>
                  </div>
                </div>

                <div className="profile-editor__actions">
                  <p className="profile-autosave-status" role="status">
                    {careTasksLoading || careTasksSaving
                      ? 'Refreshing care schedules...'
                      : `${activeCareTasks.length} total care reminders tracked. Storage: ${careTasksMode === 'local' ? 'this device' : 'your account'}.`}
                  </p>
                  <div className="care-alert-settings__actions">
                    <button
                      className="secondary-button"
                      disabled={sendingCareAlertEmail || dueCareTaskCount === 0}
                      onClick={() => void handleSendCareAlertEmail()}
                      type="button"
                    >
                      {sendingCareAlertEmail ? 'Sending reminder...' : 'Send due email now'}
                    </button>
                    <button
                      className="primary-button"
                      disabled={savingCareAlertSettings}
                      type="submit"
                    >
                      {savingCareAlertSettings ? 'Saving settings...' : 'Save care alert settings'}
                    </button>
                  </div>
                </div>
              </form>

              {dueCareTaskCount === 0 ? (
                <div className="empty-state empty-state--compact">
                  <strong>No reminders are due right now.</strong>
                  <span>
                    Mark a saved observation as a house plant, then complete care tasks as you go
                    so Florivu can roll the next reminder date forward.
                  </span>
                </div>
              ) : (
                <div className="care-alert-due-list">
                  {dueCareTasks.slice(0, 6).map((task) => {
                    const observation = observationsById[task.observation_id];

                    return (
                      <article className="care-alert-due-card" key={task.id}>
                        <div>
                          <span className="care-alert-due-card__eyebrow">
                            {observation?.common_name ?? 'Saved plant'}
                          </span>
                          <strong>{task.title}</strong>
                          <p>{task.instructions}</p>
                        </div>
                        <div className="care-alert-due-card__meta">
                          <span>Due now</span>
                          <strong>{describeCareCadence(task.cadence_days)}</strong>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'achievements' ? (
          <section className="panel-stack">
            <AchievementsPanel
              achievements={achievements}
              profileInitial={userInitial}
              profilePhotoUrl={profile?.profile_photo_url ?? null}
              selectedAvatarBorderId={equippedAvatarBorderId}
              selectedProfileTitleId={equippedProfileTitleId}
            />
          </section>
        ) : null}

        {activeTab === 'profile' ? (
          <section className="panel-stack">
            {profileLoading && !profile ? (
              <div className="panel">
                <div className="empty-state">
                  <strong>Loading profile...</strong>
                </div>
              </div>
            ) : profile && user ? (
              <ProfilePanel
                deleteBusy={deletingAccount}
                earnedAchievements={earnedAchievements}
                observationCount={observations.length}
                observations={observations}
                profile={profile}
                saveBusy={profileSaving}
                storageMode={profileMode}
                unlockedAvatarBorders={unlockedAvatarBorders}
                unlockedProfileTitles={unlockedProfileTitles}
                uniqueSpeciesCount={uniqueSpeciesCount}
                user={user}
                onDeleteAccount={handleDeleteAccount}
                onSave={handleSaveProfile}
              />
            ) : (
              <div className="panel">
                <div className="empty-state">
                  <strong>Profile unavailable.</strong>
                  <span>Sign in again to load profile settings.</span>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'friends' ? (
          <section className="panel-stack">
            <FriendsPanel
              addBusy={friendsAdding}
              completedReferralCount={completedReferralCount}
              friends={friends}
              incomingRequests={incomingRequests}
              inviteSenderName={userLabel}
              inviteSenderUserId={user?.id ?? ''}
              loading={friendsLoading}
              requestBusy={friendsResponding}
              onAddFriend={handleAddFriend}
              onAcceptRequest={handleAcceptRequest}
              onRejectRequest={handleRejectRequest}
              onSearchQuery={handleSearchFriends}
              searchBusy={friendsSearching}
              searchResults={searchResults}
              storageMode={friendsMode}
            />
          </section>
        ) : null}
      </main>

      {selectedObservation ? (
        <ObservationModal
          careTasks={selectedObservationCareTasks}
          observation={selectedObservation}
          onClose={() => setSelectedObservation(null)}
          onCompleteCareTask={handleCompleteCareTask}
          onDelete={handleDeleteObservation}
          onOpenTaxonomy={openObservationTaxonomy}
          onSaveLabels={handleSaveObservationLabels}
          onSaveZipCode={handleSaveObservationZipCode}
        />
      ) : null}
    </div>
  );
}
