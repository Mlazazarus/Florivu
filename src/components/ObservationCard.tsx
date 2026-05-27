import { Observation } from '../types';

interface ObservationCardProps {
  observation: Observation;
  onDelete: (observation: Observation) => void;
  onOpen: (observation: Observation) => void;
  onOpenTaxonomy: (observation: Observation) => void;
}

export default function ObservationCard({
  observation,
  onDelete,
  onOpen,
  onOpenTaxonomy,
}: ObservationCardProps) {
  return (
    <article className="observation-card">
      <button className="card-hitbox card-hitbox--tile" onClick={() => onOpen(observation)} type="button">
        <div className="collection-thumb">
          <img
            alt={observation.common_name}
            className="observation-image"
            src={observation.photo_url}
          />
          {observation.zip_code ? (
            <span className="collection-location-badge">ZIP {observation.zip_code}</span>
          ) : null}
        </div>
        <div className="collection-caption">
          <span className="collection-overline">{observation.family}</span>
          <h3>{observation.common_name}</h3>
        </div>
      </button>
      <div className="collection-card-meta">
        <button
          aria-label={`Open ${observation.scientific_name} in taxonomy`}
          className="latin-link collection-latin-link"
          onClick={() => onOpenTaxonomy(observation)}
          type="button"
        >
          {observation.scientific_name}
        </button>
      </div>
      <div className="collection-card-footer">
        <button
          aria-label={`Remove ${observation.common_name} from collection`}
          className="tile-remove"
          onClick={() => onDelete(observation)}
          type="button"
        >
          Remove
        </button>
      </div>
    </article>
  );
}
