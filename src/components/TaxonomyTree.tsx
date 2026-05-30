import { useEffect, useRef } from 'react';
import { Observation, TaxonomyFamily } from '../types';

interface TaxonomyTreeProps {
  activeScientificName: string | null;
  families: TaxonomyFamily[];
  onSelectObservation: (observation: Observation) => void;
}

export default function TaxonomyTree({
  activeScientificName,
  families,
  onSelectObservation,
}: TaxonomyTreeProps) {
  const speciesCardRefs = useRef(new Map<string, HTMLButtonElement | null>());

  useEffect(() => {
    if (!activeScientificName) {
      return;
    }

    const activeCard = speciesCardRefs.current.get(activeScientificName);
    activeCard?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeScientificName, families]);

  return (
    <div className="taxonomy-map">
      <div className="taxonomy-map__hint">
        Scroll sideways to browse your collection by family and genus. Matching observations stay grouped together on each card.
      </div>

      <div className="taxonomy-map__viewport" role="region" aria-label="Scrollable taxonomy view">
        <div className="taxonomy-map__canvas" role="tree">
          {families.map((family) => {
            const familyCount = family.genera.reduce(
              (total, genus) =>
                total +
                genus.species.reduce(
                  (speciesTotal, item) => speciesTotal + item.observations.length,
                  0,
                ),
              0,
            );

            return (
              <section className="taxonomy-cluster" key={family.family}>
                <div className="taxonomy-node taxonomy-node--family" role="treeitem" aria-level={1}>
                  <span>{family.family}</span>
                  <strong>{familyCount}</strong>
                </div>

                <div className="taxonomy-cluster__genera">
                  {family.genera.map((genus) => {
                    const genusCount = genus.species.reduce(
                      (total, item) => total + item.observations.length,
                      0,
                    );

                    return (
                      <div className="taxonomy-genus-group" key={genus.genus}>
                        <div className="taxonomy-node taxonomy-node--genus" role="treeitem" aria-level={2}>
                          <span>{genus.genus}</span>
                          <strong>{genusCount}</strong>
                        </div>

                        <div className="taxonomy-species-rail">
                          {genus.species.map((species) => {
                            const leadObservation = species.observations[0];
                            const isActive = species.scientificName === activeScientificName;

                            return (
                              <button
                                className={
                                  isActive
                                    ? 'taxonomy-species-card taxonomy-species-card--filled taxonomy-species-card--active'
                                    : 'taxonomy-species-card taxonomy-species-card--filled'
                                }
                                key={species.scientificName}
                                onClick={() => onSelectObservation(leadObservation)}
                                ref={(node) => {
                                  speciesCardRefs.current.set(species.scientificName, node);
                                }}
                                type="button"
                              >
                                <div className="taxonomy-species-card__image-wrap">
                                  <img
                                    alt={leadObservation.common_name}
                                    className="taxonomy-species-card__image"
                                    src={leadObservation.photo_url}
                                  />
                                  <span className="taxonomy-species-card__badge">
                                    {species.observations.length}
                                  </span>
                                </div>
                                <div className="taxonomy-species-card__body">
                                  <strong>{leadObservation.common_name}</strong>
                                  <span>{species.scientificName}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
