import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Observation, UserProfile } from '../types';
import {
  buildMarketplaceClipboardText,
  buildMarketplaceDescription,
  getDefaultMarketplaceZip,
  getMarketplaceEligibleObservations,
  getMarketplacePlatformMeta,
  getMarketplaceFlorivuDescription,
  getMarketplaceTitle,
  type MarketplacePlatform,
} from '../lib/marketplace';

interface MarketplacePanelProps {
  observations: Observation[];
  onOpenProfile: () => void;
  profile: Pick<
    UserProfile,
    | 'facebook_connected_at'
    | 'home_zip_code'
    | 'marketplace_zip_code'
  > | null;
}

export default function MarketplacePanel({
  observations,
  onOpenProfile,
  profile,
}: MarketplacePanelProps) {
  const eligibleObservations = getMarketplaceEligibleObservations(observations);
  const [platform, setPlatform] = useState<MarketplacePlatform>('facebook');
  const [selectedObservationId, setSelectedObservationId] = useState<string>('');
  const [price, setPrice] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [includeFlorivuDescription, setIncludeFlorivuDescription] = useState(true);
  const [locationZip, setLocationZip] = useState(getDefaultMarketplaceZip(profile));
  const [finalDescription, setFinalDescription] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const finalDescriptionRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (eligibleObservations.length === 0) {
      setSelectedObservationId('');
      return;
    }

    setSelectedObservationId((currentId) =>
      eligibleObservations.some((observation) => observation.id === currentId)
        ? currentId
        : eligibleObservations[0].id,
    );
  }, [eligibleObservations]);

  useEffect(() => {
    setLocationZip(getDefaultMarketplaceZip(profile));
  }, [profile]);

  const selectedObservation =
    eligibleObservations.find((observation) => observation.id === selectedObservationId) ?? null;
  const florivuDescription = selectedObservation
    ? getMarketplaceFlorivuDescription(selectedObservation)
    : '';
  const generatedFinalDescription = selectedObservation
    ? buildMarketplaceDescription({
        customDescription,
        includeFlorivuDescription,
        observation: selectedObservation,
      })
    : '';

  useEffect(() => {
    setFinalDescription(generatedFinalDescription);
  }, [generatedFinalDescription]);

  useLayoutEffect(() => {
    const textarea = finalDescriptionRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [finalDescription]);

  const platformMeta = getMarketplacePlatformMeta(platform);
  const isFacebookConnected = Boolean(profile?.facebook_connected_at);

  const copyDraft = async () => {
    if (!selectedObservation) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(
        buildMarketplaceClipboardText({
          description: finalDescription,
          locationZip,
          observation: selectedObservation,
          platform,
          price,
        }),
      );
      setCopyState('copied');
      return true;
    } catch {
      setCopyState('error');
      return false;
    }
  };

  const handleOpenPlatform = () => {
    window.open(platformMeta.openUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyDraft = async () => {
    await copyDraft();
  };

  const handleCopyAndOpenPlatform = async () => {
    await copyDraft();
    handleOpenPlatform();
  };

  return (
    <section className="marketplace-layout">
      <div className="panel marketplace-composer">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Marketplace</p>
            <h2>Build a listing from your collection</h2>
          </div>
        </div>

        {eligibleObservations.length === 0 ? (
          <div className="empty-state">
            <strong>No house plants are ready to list.</strong>
            <span>Mark a saved plant as a House Plant first, then it will appear here for marketplace drafts.</span>
          </div>
        ) : (
          <div className="marketplace-form">
            <div className="marketplace-platform-row" aria-label="Marketplace platform">
              <button
                className={
                  platform === 'facebook'
                    ? 'collection-view-button collection-view-button--active'
                    : 'collection-view-button'
                }
                onClick={() => setPlatform('facebook')}
                type="button"
              >
                Facebook Marketplace
              </button>
              <button
                className={
                  platform === 'offerup'
                    ? 'collection-view-button collection-view-button--active'
                    : 'collection-view-button'
                }
                onClick={() => setPlatform('offerup')}
                type="button"
              >
                OfferUp
              </button>
            </div>

            <div className="marketplace-plant-picker" aria-label="House plants">
              {eligibleObservations.map((observation) => {
                const selected = observation.id === selectedObservationId;

                return (
                  <button
                    className={
                      selected
                        ? 'marketplace-plant-option marketplace-plant-option--active'
                        : 'marketplace-plant-option'
                    }
                    key={observation.id}
                    onClick={() => setSelectedObservationId(observation.id)}
                    type="button"
                  >
                    <img alt={observation.common_name} src={observation.photo_url} />
                    <span>{observation.common_name}</span>
                  </button>
                );
              })}
            </div>

            <div className="marketplace-field-grid">
              <label className="field">
                <span>Price</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setPrice(event.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="25"
                  value={price}
                />
              </label>

              <label className="field">
                <span>Listing ZIP</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => setLocationZip(event.target.value)}
                  placeholder="92101"
                  value={locationZip}
                />
              </label>
            </div>

            {!locationZip.trim() ? (
              <p className="field-hint">
                Add a home ZIP code or marketplace ZIP override in your profile if you want Florivu to prefill this every time.
              </p>
            ) : null}

            {price.trim() ? (
              <label className="field">
                <span>Extra details</span>
                <textarea
                  className="marketplace-textarea"
                  onChange={(event) => setCustomDescription(event.target.value)}
                  placeholder="Healthy plant, rooted well, pickup details, pot included, and anything else buyers should know."
                  value={customDescription}
                />
              </label>
            ) : null}

            <label className="marketplace-checkbox-card">
              <input
                checked={includeFlorivuDescription}
                onChange={(event) => setIncludeFlorivuDescription(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>Append Florivu description</strong>
                <span>Add the generated description and care guidance to your listing text.</span>
              </span>
            </label>

            <div className="marketplace-draft-card">
              <div className="marketplace-draft-card__header">
                <strong>Florivu description</strong>
                <span>{selectedObservation ? getMarketplaceTitle(selectedObservation) : 'Select a plant'}</span>
              </div>
              <pre>{florivuDescription || 'Select a plant to load the generated description and care notes.'}</pre>
            </div>

            <div className="marketplace-status-card">
              <strong>{platformMeta.statusTitle}</strong>
              <p>{platformMeta.helperText}</p>
              {platform === 'facebook' ? (
                <>
                  <span>
                    {isFacebookConnected
                      ? 'Facebook Marketplace handoff is connected in your Florivu profile.'
                      : 'Facebook is not connected in your Florivu profile yet.'}
                  </span>
                  <div className="profile-note-card__actions">
                    <button className="secondary-button" onClick={onOpenProfile} type="button">
                      {isFacebookConnected ? 'Review Facebook connection' : 'Connect Facebook in Profile'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="panel marketplace-preview">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Listing preview</p>
            <h2>{selectedObservation ? getMarketplaceTitle(selectedObservation) : 'Choose a plant'}</h2>
          </div>
        </div>

        {selectedObservation ? (
          <div className="marketplace-preview-stack">
            <div className="marketplace-preview-hero">
              <img alt={selectedObservation.common_name} src={selectedObservation.photo_url} />
              <div className="marketplace-preview-hero__copy">
                <strong>{selectedObservation.common_name}</strong>
                <span>{platformMeta.platformLabel}</span>
                <span>{price.trim() ? `$${price}` : 'Add a price to continue'}</span>
              </div>
            </div>

            <label className="marketplace-preview-meta field">
              <span>ZIP</span>
              <input
                inputMode="numeric"
                onChange={(event) => setLocationZip(event.target.value)}
                placeholder="92101"
                value={locationZip}
              />
            </label>

            <div className="marketplace-draft-card">
              <div className="marketplace-draft-card__header">
                <strong>Final description</strong>
              </div>
              <textarea
                className="marketplace-textarea marketplace-textarea--autogrow"
                onChange={(event) => setFinalDescription(event.target.value)}
                placeholder="Add a price, optional details, and Florivu notes to build the final listing text."
                ref={finalDescriptionRef}
                value={finalDescription}
              />
            </div>

            <div className="marketplace-action-row">
              <button
                className="primary-button"
                onClick={() =>
                  void (platform === 'facebook' ? handleCopyAndOpenPlatform() : handleCopyDraft())
                }
                type="button"
              >
                {platform === 'facebook' ? 'Copy draft and open Facebook Marketplace' : 'Copy listing draft'}
              </button>
              <button className="secondary-button" onClick={handleOpenPlatform} type="button">
                {platformMeta.actionLabel}
              </button>
            </div>

            {copyState === 'copied' ? (
              <p className="field-hint">Listing draft copied to your clipboard.</p>
            ) : null}
            {copyState === 'error' ? (
              <p className="field-hint">Clipboard access failed. You can still copy the preview text manually.</p>
            ) : null}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Select a house plant to start.</strong>
            <span>Florivu will build the draft from your saved photo, plant name, and care details.</span>
          </div>
        )}
      </div>
    </section>
  );
}
