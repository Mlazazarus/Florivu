import { Observation } from '../types';

interface ObservationCardProps {
  observation: Observation;
  onDelete: (observation: Observation) => void;
  onOpen: (observation: Observation) => void;
}

export default function ObservationCard({
  observation,
  onDelete,
  onOpen,
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
        </div>
        <div className="collection-caption">
          <span className="collection-overline">{observation.family}</span>
          <h3>{observation.common_name}</h3>
          <p>{observation.scientific_name}</p>
        </div>
      </button>
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
