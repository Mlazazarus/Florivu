import { FormEvent, useEffect, useState } from 'react';
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
          <p className="eyebrow">Saved observation</p>
          <h2>{observation.common_name}</h2>
          <button className="latin-link latin-name" onClick={() => onOpenTaxonomy(observation)} type="button">
            {observation.scientific_name}
          </button>

          <section className="detail-grid__editable detail-grid__editable--labels" aria-label="Collection labels">
            <div className="detail-grid__editable-header">
              <span className="detail-grid__editable-title">Collection labels</span>
              <span className="detail-grid__editable-status">
                {savingLabels ? 'Saving labels...' : 'Saved automatically'}
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

          <div className="detail-grid">
            <div>
              <span>Confidence</span>
              <strong>{Math.round(observation.confidence * 100)}%</strong>
            </div>
            <div>
              <span>Date found</span>
              <strong>{fullDateFormatter.format(new Date(observation.date_found))}</strong>
            </div>
            <div>
              <span>Family</span>
              <strong>{observation.family}</strong>
            </div>
            <div>
              <span>Genus</span>
              <strong>{observation.genus}</strong>
            </div>
            <div>
              <span>Species</span>
              <strong>{observation.species}</strong>
            </div>
            <div>
              <span>Recorded</span>
              <strong>{fullDateFormatter.format(new Date(observation.created_at))}</strong>
            </div>
            <form className="detail-grid__editable" onSubmit={handleZipCodeSubmit}>
              <label className="field">
                <span>Zipcode found</span>
                <input
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) => setZipCode(event.target.value)}
                  placeholder="Not captured"
                  value={zipCode}
                />
              </label>
              <button
                className="secondary-button detail-grid__save"
                disabled={savingZipCode}
                type="submit"
              >
                {savingZipCode ? 'Saving...' : 'Save zipcode'}
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
              Back
            </button>
            <button className="danger-button" onClick={() => onDelete(observation)} type="button">
              Delete observation
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
