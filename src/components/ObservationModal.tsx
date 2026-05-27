import { Observation } from '../types';

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'long',
});

interface ObservationModalProps {
  observation: Observation;
  onClose: () => void;
  onDelete: (observation: Observation) => void;
  onOpenTaxonomy: (observation: Observation) => void;
}

export default function ObservationModal({
  observation,
  onClose,
  onDelete,
  onOpenTaxonomy,
}: ObservationModalProps) {
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
              <span>ZIP code</span>
              <strong>{observation.zip_code ?? 'Not captured'}</strong>
            </div>
            <div>
              <span>Recorded</span>
              <strong>{fullDateFormatter.format(new Date(observation.created_at))}</strong>
            </div>
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
