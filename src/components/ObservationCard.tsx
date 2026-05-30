import { Observation } from '../types';
import { resolveObservationCatalogMatch } from '../lib/plantCatalog';
import { ObservationLabelIcons } from './ObservationLabels';

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
  const catalogMatch = resolveObservationCatalogMatch(observation);

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
          <div className="collection-title-row">
            <h3>{observation.common_name}</h3>
            <ObservationLabelIcons observation={observation} />
          </div>
        </div>
      </button>
      <div className="collection-card-meta">
        <button
          aria-label={`See related plants for ${observation.scientific_name}`}
          className="latin-link collection-latin-link"
          onClick={() => onOpenTaxonomy(observation)}
          type="button"
        >
          {observation.scientific_name}
        </button>
        {catalogMatch?.careProfile ? (
          <span className="collection-care-chip">{catalogMatch.careProfile.name}</span>
        ) : null}
      </div>
      <div className="collection-card-footer">
        <button
          aria-label={`Remove ${observation.common_name} from My Plants`}
          className="tile-remove"
          onClick={() => onDelete(observation)}
          type="button"
        >
          Remove plant
        </button>
      </div>
    </article>
  );
}
