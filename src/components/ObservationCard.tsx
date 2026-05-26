import { Observation } from '../types';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

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
      <button className="card-hitbox" onClick={() => onOpen(observation)} type="button">
        <img
          alt={observation.common_name}
          className="observation-image"
          src={observation.photo_url}
        />
        <div className="observation-body">
          <div className="observation-meta">
            <span>{dateFormatter.format(new Date(observation.date_found))}</span>
            <span>{Math.round(observation.confidence * 100)}%</span>
          </div>
          <h3>{observation.common_name}</h3>
          <p>{observation.scientific_name}</p>
          <div className="tag-row">
            <span className="tag">{observation.family}</span>
            <span className="tag">{observation.genus}</span>
          </div>
        </div>
      </button>
      <button className="danger-link" onClick={() => onDelete(observation)} type="button">
        Remove
      </button>
    </article>
  );
}
