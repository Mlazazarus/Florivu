import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import plantDexLogo from '../plantdexLogo.png';
import AuthPanel from './components/AuthPanel';
import DebugLogPanel from './components/DebugLogPanel';
import ObservationCard from './components/ObservationCard';
import ObservationModal from './components/ObservationModal';
import ProfilePanel, { ProfilePanelSaveValues } from './components/ProfilePanel';
import TaxonomyTree from './components/TaxonomyTree';
import { useAuth } from './hooks/useAuth';
import { usePlants } from './hooks/usePlants';
import { useProfile } from './hooks/useProfile';
import { deleteAccount } from './lib/accountApi';
import { IMAGE_FILE_ACCEPT, prepareImageFile } from './lib/imageFile';
import { resolveObservationLocation } from './lib/observationLocation';
import { identifyPlant } from './lib/plantApi';
import { uploadPlantPhoto, uploadProfilePhoto } from './lib/storageHelper';
import { formatError, logError, logInfo } from './lib/logger';
import { Observation, OrganType, PlantNetResponse, PlantNetResult } from './types';

type AppTab = 'identify' | 'collection' | 'taxonomy' | 'profile' | 'settings';

type BannerState =
  | { tone: 'error' | 'success'; message: string }
  | null;

const organs: Array<{ label: string; value: OrganType }> = [
  { label: 'Auto detect', value: 'auto' },
  { label: 'Leaf', value: 'leaf' },
  { label: 'Flower', value: 'flower' },
  { label: 'Fruit', value: 'fruit' },
  { label: 'Bark', value: 'bark' },
];

function resultLabel(result: PlantNetResult) {
  return result.species.commonNames[0] ?? result.species.scientificNameWithoutAuthor;
}

export default function App() {
  const { session, user, loading, signIn, signOut, signUp } = useAuth();
  const {
    observations,
    loading: plantsLoading,
    error,
    fetchObservations,
    saveObservation,
    deleteObservation,
    getTaxonomyTree,
    storageMode: collectionMode,
  } = usePlants(user?.id);
  const {
    profile,
    loading: profileLoading,
    saving: profileSaving,
    error: profileError,
    storageMode: profileMode,
    fetchProfile,
    saveProfile,
  } = useProfile(user?.id, user?.email);

  const [activeTab, setActiveTab] = useState<AppTab>('identify');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const identifyInFlightRef = useRef(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logInfo('App', 'PlantDex web app mounted.', { origin: window.location.origin });
  }, []);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void fetchObservations();
  }, [fetchObservations, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void fetchProfile();
  }, [fetchProfile, user?.id]);

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

  const uniqueSpeciesCount = new Set(
    observations.map((observation) => observation.species || observation.scientific_name),
  ).size;
  const taxonomy = getTaxonomyTree();
  const userEmail = user?.email ?? 'Account';
  const userLabel = profile?.display_name?.trim() || userEmail;
  const userInitial = userLabel.charAt(0).toUpperCase();

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setBanner({ tone: 'error', message: 'Enter both an email and password.' });
      return;
    }

    setAuthBusy(true);
    setBanner(null);

    try {
      if (isSignUp) {
        await signUp(email.trim(), password);
        setBanner({
          tone: 'success',
          message: 'Account created. Check your inbox if email confirmation is enabled.',
        });
      } else {
        await signIn(email.trim(), password);
      }
    } catch (submitError) {
      setBanner({ tone: 'error', message: formatError(submitError) });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setBanner({ tone: 'success', message: 'Signed out.' });
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

  const handleSaveProfile = async (values: ProfilePanelSaveValues) => {
    if (!user) {
      setBanner({ tone: 'error', message: 'Sign in before editing your profile.' });
      return;
    }

    setBanner(null);

    try {
      let nextProfilePhotoUrl = values.profilePhotoUrl;

      if (values.profilePhotoFile) {
        const uploadResult = await uploadProfilePhoto(user.id, values.profilePhotoFile);
        nextProfilePhotoUrl = uploadResult.photoUrl;
      }

      await saveProfile({
        display_name: values.displayName,
        profile_photo_url: nextProfilePhotoUrl,
        home_zip_code: values.homeZipCode,
        facebook_url: values.facebookUrl,
        is_public: values.isPublic,
      });

      setBanner({
        tone: 'success',
        message: 'Profile updated.',
      });
    } catch (saveError) {
      setBanner({ tone: 'error', message: formatError(saveError) });
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) {
      return;
    }

    const confirmed = window.confirm(
      'Delete your PlantDex account and associated data? This cannot be undone.',
    );

    if (!confirmed) {
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
        message: `PlantNet returned ${nextResults.results.length} likely matches.`,
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
    setSavingSpecies(speciesName);
    setBanner(null);
    logInfo('App', 'Saving result to collection.', {
      species: speciesName,
      commonName: resultLabel(result),
    });

    try {
      const [locationResult, uploadResult] = await Promise.all([
        resolveObservationLocation(originalFile ?? selectedFile),
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
        date_found: new Date().toISOString(),
        zip_code: locationResult.zipCode,
      });

      setActiveTab('collection');
      setSelectedObservation(savedObservation);
      setBanner({
        tone: 'success',
        message:
          uploadResult.storageMode === 'inline'
            ? `${savedObservation.common_name} was added to your collection. Storage bucket missing, so the image was saved inline.${savedObservation.zip_code ? ` Tagged with ZIP ${savedObservation.zip_code}.` : ''}`
            : `${savedObservation.common_name} was added to your collection.${savedObservation.zip_code ? ` Tagged with ZIP ${savedObservation.zip_code}.` : ''}`,
      });
    } catch (saveError) {
      logError('App', 'Save result failed.', saveError);
      setBanner({ tone: 'error', message: formatError(saveError) });
    } finally {
      setSavingSpecies(null);
    }
  };

  const openObservationTaxonomy = (observation: Observation) => {
    setTaxonomyFocusScientificName(observation.scientific_name);
    setSelectedObservation(null);
    setActiveTab('taxonomy');
  };

  const handleDeleteObservation = async (observation: Observation) => {
    const confirmed = window.confirm(`Remove ${observation.common_name} from your collection?`);

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
        message: `${observation.common_name} was removed from your collection.`,
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
        <p>Loading PlantDex...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="page-shell">
        <div className="auth-layout">
          <aside className="auth-hero">
            <p className="eyebrow">Browser-first field notes</p>
            <h1>Plant identification that behaves like a real website.</h1>
            <p className="lead">
              Use your phone browser or desktop to upload a plant photo, inspect likely matches,
              and keep a living collection without Expo Go in the loop.
            </p>
            <div className="feature-stack">
              <div className="feature-card">
                <strong>Upload from camera or gallery</strong>
                <span>Works from a normal file input, including mobile capture.</span>
              </div>
              <div className="feature-card">
                <strong>Save to Supabase</strong>
                <span>Observations and photo URLs stay in your existing backend.</span>
              </div>
              <div className="feature-card">
                <strong>Browse your taxonomy tree</strong>
                <span>Collection and classification are readable on any screen size.</span>
              </div>
            </div>
          </aside>

          <div>
            {banner ? (
              <div className={`banner banner--${banner.tone}`}>{banner.message}</div>
            ) : null}
            <AuthPanel
              busy={authBusy}
              email={email}
              isSignUp={isSignUp}
              onEmailChange={setEmail}
              onModeToggle={() => setIsSignUp((value) => !value)}
              onPasswordChange={setPassword}
              onSubmit={handleAuthSubmit}
              password={password}
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
          <img alt="PlantDex" className="header-brand__logo" src={plantDexLogo} />
          <h1 className="header-brand__wordmark">plantdex</h1>
        </div>

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

        <div className="header-actions">
          <nav aria-label="Primary sections" className="tab-row">
            <button
              className={activeTab === 'identify' ? 'tab-button active' : 'tab-button'}
              onClick={() => setActiveTab('identify')}
              type="button"
            >
              Identify
            </button>
            <button
              className={activeTab === 'collection' ? 'tab-button active' : 'tab-button'}
              onClick={() => setActiveTab('collection')}
              type="button"
            >
              Collection
            </button>
            <button
              className={activeTab === 'taxonomy' ? 'tab-button active' : 'tab-button'}
              onClick={() => setActiveTab('taxonomy')}
              type="button"
            >
              Taxonomy
            </button>
          </nav>
        </div>

        <div className="account-menu" ref={accountMenuRef}>
          <button
            aria-expanded={accountMenuOpen}
            aria-haspopup="menu"
            className="account-trigger"
            onClick={() => setAccountMenuOpen((value) => !value)}
            type="button"
          >
            <span className="account-trigger__avatar">
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
                Profile
              </button>
              <button className="account-dropdown__item" onClick={openSettings} type="button">
                Settings
              </button>
              <button
                className="account-dropdown__item account-dropdown__item--danger"
                onClick={handleSignOut}
                type="button"
              >
                Logout
              </button>
            </div>
          ) : null}
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
        {activeTab === 'identify' ? (
          <section className="panel-stack panel-stack--identify">
            <div className="panel panel--identify-input">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Step 1</p>
                  <h2>Choose a plant photo</h2>
                </div>
                {selectedFile ? (
                  <button className="ghost-link" onClick={clearSelection} type="button">
                    Clear selection
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
                      <strong>No photo selected yet.</strong>
                      <span>Use the camera button on your phone or choose a file from your library.</span>
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
                      Upload from gallery
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => cameraInputRef.current?.click()}
                      type="button"
                    >
                      Use camera
                    </button>
                  </div>

                  <label className="field">
                    <span>Plant organ to emphasize</span>
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
                    {identifying ? 'Identifying...' : 'Identify plant'}
                  </button>

                  <p className="field-hint">
                    Best results usually come from a clear single-subject photo in natural light. JPG, PNG, WebP, HEIC, HEIF, GIF, BMP, and AVIF are accepted.
                  </p>
                </div>
              </div>
            </div>

            <div className="panel panel--results">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Step 2</p>
                  <h2>Review likely matches</h2>
                </div>
              </div>

              {results ? (
                <div className="result-stack">
                  {results.results.map((result, index) => (
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

                      <button
                        className="secondary-button"
                        disabled={savingSpecies === result.species.scientificNameWithoutAuthor}
                        onClick={() => handleSaveResult(result)}
                        type="button"
                      >
                        {savingSpecies === result.species.scientificNameWithoutAuthor ? 'Saving...' : 'Save to collection'}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No results yet.</strong>
                  <span>Identify a photo to populate likely matches here.</span>
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
                  <h2>Your saved plants</h2>
                </div>
              </div>

              {plantsLoading && observations.length === 0 ? (
                <div className="empty-state">
                  <strong>Loading collection...</strong>
                </div>
              ) : observations.length === 0 ? (
                <div className="empty-state">
                  <strong>No plants saved yet.</strong>
                  <span>Identify something first, then save the match into your collection.</span>
                </div>
              ) : (
                <div className="collection-grid">
                  {observations.map((observation) => (
                    <ObservationCard
                      key={observation.id}
                      observation={observation}
                      onDelete={handleDeleteObservation}
                      onOpen={setSelectedObservation}
                      onOpenTaxonomy={openObservationTaxonomy}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'taxonomy' ? (
          <section className="panel-stack">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Classification</p>
                  <h2>Taxonomy browser</h2>
                </div>
              </div>

              {taxonomy.length === 0 ? (
                <div className="empty-state">
                  <strong>Your taxonomy tree is empty.</strong>
                  <span>Save an identified plant and the families, genera, and species will appear here.</span>
                </div>
              ) : (
                <TaxonomyTree
                  activeScientificName={taxonomyFocusScientificName}
                  families={taxonomy}
                  onSelectObservation={setSelectedObservation}
                />
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'settings' ? (
          <section className="panel-stack">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Settings</p>
                  <h2>Account and app status</h2>
                </div>
              </div>

              <div className="settings-grid">
                <div className="settings-card">
                  <span>Signed in account</span>
                  <strong>{userLabel}</strong>
                  <p>Use the account menu in the header for quick settings access and logout.</p>
                </div>
                <div className="settings-card">
                  <span>Collection backend</span>
                  <strong>{collectionMode === 'local' ? 'Local fallback store' : 'Supabase'}</strong>
                  <p>
                    {collectionMode === 'local'
                      ? 'The observations table is missing in Supabase, so collection data is being stored on this local Vite server.'
                      : 'Observations are being read from and written to your Supabase project.'}
                  </p>
                </div>
                <div className="settings-card">
                  <span>Collection summary</span>
                  <strong>{observations.length} saved observations</strong>
                  <p>
                    {uniqueSpeciesCount} species across {taxonomy.length} families.
                  </p>
                </div>
              </div>
            </div>
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
                observationCount={observations.length}
                observations={observations}
                profile={profile}
                saveBusy={profileSaving}
                storageMode={profileMode}
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
      </main>

      {selectedObservation ? (
        <ObservationModal
          observation={selectedObservation}
          onClose={() => setSelectedObservation(null)}
          onDelete={handleDeleteObservation}
          onOpenTaxonomy={openObservationTaxonomy}
        />
      ) : null}
      <DebugLogPanel />
    </div>
  );
}
