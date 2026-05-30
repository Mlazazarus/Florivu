import { FormEvent, useEffect, useState } from 'react';
import {
  formatCatalogLabel,
  formatCatalogMatchSource,
  resolveObservationCatalogMatch,
} from '../lib/plantCatalog';
import { Observation } from '../types';
import { observationLabelOptions } from './ObservationLabels';

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'long',
});

interface ObservationModalProps {
  observation: Observation;
  onClose: () => void;
  onDelete: (observation: Observation) => void;
  onOpenTaxonomy: (observation: Observation) => void;
  onSaveLabels: (
    observation: Observation,
    labels: Pick<Observation, 'is_favorite' | 'is_house_plant'>,
  ) => Promise<void>;
  onSaveZipCode: (observation: Observation, zipCode: string | null) => Promise<void>;
}

export default function ObservationModal({
  observation,
  onClose,
  onDelete,
  onOpenTaxonomy,
  onSaveLabels,
  onSaveZipCode,
}: ObservationModalProps) {
  const [zipCode, setZipCode] = useState(observation.zip_code ?? '');
  const [favorite, setFavorite] = useState(observation.is_favorite);
  const [housePlant, setHousePlant] = useState(observation.is_house_plant);
  const [savingLabels, setSavingLabels] = useState(false);
  const [savingZipCode, setSavingZipCode] = useState(false);
  const catalogMatch = resolveObservationCatalogMatch(observation);
  const catalogCareDetails = catalogMatch
    ? [
        {
          label: 'Light',
          value: catalogMatch.careProfile?.light,
        },
        {
          label: 'Water',
          value: catalogMatch.careProfile?.water,
        },
        {
          label: 'Humidity',
          value: catalogMatch.careProfile?.humidity,
        },
        {
          label: 'Soil',
          value: catalogMatch.careProfile?.soil,
        },
        {
          label: 'Airflow',
          value: catalogMatch.careProfile?.airflow ?? catalogMatch.plant.airflow_notes,
        },
        {
          label: 'Difficulty',
          value: formatCatalogLabel(
            catalogMatch.careProfile?.difficulty ?? catalogMatch.plant.difficulty,
          ),
        },
        {
          label: 'Pet safety',
          value: formatCatalogLabel(catalogMatch.plant.pet_safety),
        },
      ].filter((item): item is { label: string; value: string } => Boolean(item.value))
    : [];

  useEffect(() => {
    setZipCode(observation.zip_code ?? '');
    setFavorite(observation.is_favorite);
    setHousePlant(observation.is_house_plant);
    setSavingLabels(false);
    setSavingZipCode(false);
  }, [observation]);

  const handleLabelToggle = async (field: 'is_favorite' | 'is_house_plant') => {
    if (savingLabels) {
      return;
    }

    const previousLabels = {
      is_favorite: favorite,
      is_house_plant: housePlant,
    };
    const nextLabels = {
      ...previousLabels,
      [field]: !previousLabels[field],
    };

    setFavorite(nextLabels.is_favorite);
    setHousePlant(nextLabels.is_house_plant);
    setSavingLabels(true);

    try {
      await onSaveLabels(observation, nextLabels);
    } catch {
      setFavorite(previousLabels.is_favorite);
      setHousePlant(previousLabels.is_house_plant);
    } finally {
      setSavingLabels(false);
    }
  };

  const handleZipCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingZipCode(true);

    try {
      await onSaveZipCode(observation, zipCode);
    } finally {
      setSavingZipCode(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="Observation details"
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <button aria-label="Close details" className="modal-close" onClick={onClose} type="button">
          ×
        </button>

        <img
          alt={observation.common_name}
          className="modal-image"
          src={observation.photo_url}
        />

        <div className="modal-content">
          <p className="eyebrow">Plant details</p>
          <h2>{observation.common_name}</h2>
          <button className="latin-link latin-name" onClick={() => onOpenTaxonomy(observation)} type="button">
            {observation.scientific_name}
          </button>

          <section className="detail-grid__editable detail-grid__editable--labels" aria-label="Collection labels">
            <div className="detail-grid__editable-header">
              <span className="detail-grid__editable-title">Quick tags</span>
              <span className="detail-grid__editable-status">
                {savingLabels ? 'Saving tags...' : 'Saved automatically'}
              </span>
            </div>
            <div className="collection-label-toggle-row">
              {observationLabelOptions.map(({ description, field, Icon, label }) => {
                const active = field === 'is_favorite' ? favorite : housePlant;

                return (
                  <button
                    aria-pressed={active}
                    className={active ? 'collection-label-toggle collection-label-toggle--active' : 'collection-label-toggle'}
                    disabled={savingLabels}
                    key={field}
                    onClick={() => void handleLabelToggle(field)}
                    type="button"
                  >
                    <Icon className="collection-label-toggle__icon" />
                    <span className="collection-label-toggle__copy">
                      <strong>{label}</strong>
                      <span>{description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {catalogMatch ? (
            <section className="detail-grid__editable detail-grid__editable--catalog" aria-label="Generic plant profile">
              <div className="detail-grid__editable-header">
                <span className="detail-grid__editable-title">Care overview</span>
                <span className="detail-grid__editable-status">
                  {catalogMatch.matchedOn === 'catalog-id'
                    ? 'Saved care match'
                    : `Matched from ${formatCatalogMatchSource(catalogMatch.matchedOn)}`}
                </span>
              </div>

              <div className="catalog-summary-card">
                <div className="catalog-summary-card__header">
                  <div>
                    <strong>{catalogMatch.plant.common_name}</strong>
                    <span>{catalogMatch.careProfile?.name ?? 'Bundled care profile'}</span>
                  </div>
                  <span className="catalog-source-pill">
                    {formatCatalogLabel(catalogMatch.plant.retail_group)}
                  </span>
                </div>
                <p>{catalogMatch.plant.description}</p>
                <p className="catalog-summary-card__care">{catalogMatch.plant.care_summary}</p>
              </div>

              <div className="catalog-care-grid">
                {catalogCareDetails.map((detail) => (
                  <div className="catalog-care-card" key={detail.label}>
                    <span>{detail.label}</span>
                    <p>{detail.value}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="detail-grid">
            <div>
              <span>Match confidence</span>
              <strong>{Math.round(observation.confidence * 100)}%</strong>
            </div>
            <div>
              <span>Date spotted</span>
              <strong>{fullDateFormatter.format(new Date(observation.date_found))}</strong>
            </div>
            <div>
              <span>Plant family</span>
              <strong>{observation.family}</strong>
            </div>
            <div>
              <span>Genus</span>
              <strong>{observation.genus}</strong>
            </div>
            <div>
              <span>Matched species</span>
              <strong>{observation.species}</strong>
            </div>
            <div>
              <span>Added to My Plants</span>
              <strong>{fullDateFormatter.format(new Date(observation.created_at))}</strong>
            </div>
            <form className="detail-grid__editable" onSubmit={handleZipCodeSubmit}>
              <label className="field">
                <span>Location note</span>
                <input
                  maxLength={16}
                  onChange={(event) => setZipCode(event.target.value)}
                  placeholder="ZIP or postal code"
                  value={zipCode}
                />
              </label>
              <button
                className="secondary-button detail-grid__save"
                disabled={savingZipCode}
                type="submit"
              >
                {savingZipCode ? 'Saving...' : 'Save location note'}
              </button>
            </form>
          </div>

          {observation.notes ? (
            <div className="note-card">
              <span>Notes</span>
              <p>{observation.notes}</p>
            </div>
          ) : null}

          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Close
            </button>
            <button className="danger-button" onClick={() => onDelete(observation)} type="button">
              Remove from My Plants
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
