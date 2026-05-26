import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import AuthPanel from './components/AuthPanel';
import ObservationCard from './components/ObservationCard';
import ObservationModal from './components/ObservationModal';
import TaxonomyTree from './components/TaxonomyTree';
import { useAuth } from './hooks/useAuth';
import { usePlants } from './hooks/usePlants';
import { identifyPlant } from './lib/plantApi';
import { uploadPlantPhoto } from './lib/storageHelper';
import { Observation, OrganType, PlantNetResponse, PlantNetResult } from './types';

type AppTab = 'identify' | 'collection' | 'taxonomy';

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong.';
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
  } = usePlants(user?.id);

  const [activeTab, setActiveTab] = useState<AppTab>('identify');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [organ, setOrgan] = useState<OrganType>('auto');
  const [identifying, setIdentifying] = useState(false);
  const [results, setResults] = useState<PlantNetResponse | null>(null);
  const [savingSpecies, setSavingSpecies] = useState<string | null>(null);
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null);

  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void fetchObservations();
  }, [fetchObservations, user?.id]);

  useEffect(() => {
    if (!error) {
      return;
    }

    setBanner({ tone: 'error', message: error });
  }, [error]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);

    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  const uniqueSpeciesCount = new Set(
    observations.map((observation) => observation.species || observation.scientific_name),
  ).size;
  const taxonomy = getTaxonomyTree();

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
      setBanner({ tone: 'error', message: getErrorMessage(submitError) });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setBanner({ tone: 'success', message: 'Signed out.' });
    } catch (signOutError) {
      setBanner({ tone: 'error', message: getErrorMessage(signOutError) });
    }
  };

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    event.target.value = '';

    if (!nextFile) {
      return;
    }

    setSelectedFile(nextFile);
    setResults(null);
    setBanner(null);
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setResults(null);
    setSavingSpecies(null);
  };

  const handleIdentify = async () => {
    if (!selectedFile) {
      setBanner({ tone: 'error', message: 'Select a photo before identifying.' });
      return;
    }

    setIdentifying(true);
    setBanner(null);

    try {
      const nextResults = await identifyPlant(selectedFile, organ);
      setResults(nextResults);
      setBanner({
        tone: 'success',
        message: `PlantNet returned ${nextResults.results.length} likely matches.`,
      });
    } catch (identifyError) {
      setBanner({ tone: 'error', message: getErrorMessage(identifyError) });
    } finally {
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

    try {
      const photoUrl = await uploadPlantPhoto(user.id, selectedFile);
      const savedObservation = await saveObservation({
        user_id: user.id,
        photo_url: photoUrl,
        common_name: resultLabel(result),
        scientific_name: result.species.scientificName,
        family: result.species.family.scientificName,
        genus: result.species.genus.scientificName,
        species: result.species.scientificNameWithoutAuthor,
        confidence: result.score,
        date_found: new Date().toISOString(),
      });

      setActiveTab('collection');
      setSelectedObservation(savedObservation);
      setBanner({
        tone: 'success',
        message: `${savedObservation.common_name} was added to your collection.`,
      });
    } catch (saveError) {
      setBanner({ tone: 'error', message: getErrorMessage(saveError) });
    } finally {
      setSavingSpecies(null);
    }
  };

  const handleDeleteObservation = async (observation: Observation) => {
    const confirmed = window.confirm(`Remove ${observation.common_name} from your collection?`);

    if (!confirmed) {
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
      setBanner({ tone: 'error', message: getErrorMessage(deleteError) });
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
        <div>
          <p className="eyebrow">PlantDex</p>
          <h1>Web field journal</h1>
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

          <button className="secondary-button" onClick={handleSignOut} type="button">
            Sign out
          </button>
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

      <section className="hero-strip">
        <div className="hero-copy">
          <p className="eyebrow">Current account</p>
          <h2>{user?.email}</h2>
          <p>
            Upload a plant photo from any browser, identify it with PlantNet, and keep a structured
            archive in Supabase.
          </p>
        </div>
        <div className="hero-metrics">
          <div className="metric-card">
            <span>Observations</span>
            <strong>{observations.length}</strong>
          </div>
          <div className="metric-card">
            <span>Species</span>
            <strong>{uniqueSpeciesCount}</strong>
          </div>
          <div className="metric-card">
            <span>Families</span>
            <strong>{taxonomy.length}</strong>
          </div>
        </div>
      </section>

      <main className="workspace">
        {activeTab === 'identify' ? (
          <section className="panel-stack">
            <div className="panel">
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
                <div className="upload-card">
                  {previewUrl ? (
                    <img alt={selectedFile?.name ?? 'Selected plant'} className="preview-image" src={previewUrl} />
                  ) : (
                    <div className="preview-placeholder">
                      <strong>No photo selected yet.</strong>
                      <span>Use the camera button on your phone or choose a file from your library.</span>
                    </div>
                  )}
                </div>

                <div className="upload-controls">
                  <input
                    accept="image/*"
                    className="sr-only"
                    onChange={handleFileSelection}
                    ref={libraryInputRef}
                    type="file"
                  />
                  <input
                    accept="image/*"
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
                    Best results usually come from a clear single-subject photo in natural light.
                  </p>
                </div>
              </div>
            </div>

            <div className="panel">
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
                <TaxonomyTree families={taxonomy} onSelectObservation={setSelectedObservation} />
              )}
            </div>
          </section>
        ) : null}
      </main>

      {selectedObservation ? (
        <ObservationModal
          observation={selectedObservation}
          onClose={() => setSelectedObservation(null)}
          onDelete={handleDeleteObservation}
        />
      ) : null}
    </div>
  );
}
