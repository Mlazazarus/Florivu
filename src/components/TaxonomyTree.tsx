import { Observation, TaxonomyFamily } from '../types';

interface TaxonomyTreeProps {
  families: TaxonomyFamily[];
  onSelectObservation: (observation: Observation) => void;
}

export default function TaxonomyTree({
  families,
  onSelectObservation,
}: TaxonomyTreeProps) {
  return (
    <div className="taxonomy-map">
      <div className="taxonomy-map__hint">
        Scroll across the map to explore your observed branches. Species nodes are filled with your saved plants.
      </div>

      <div className="taxonomy-map__viewport" role="region" aria-label="Scrollable taxonomy map">
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

                            return (
                              <button
                                className="taxonomy-species-card taxonomy-species-card--filled"
                                key={species.scientificName}
                                onClick={() => onSelectObservation(leadObservation)}
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
