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
    <div className="taxonomy-tree">
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
          <details className="taxonomy-level taxonomy-level--family" key={family.family} open>
            <summary>
              <span>{family.family}</span>
              <strong>{familyCount}</strong>
            </summary>

            {family.genera.map((genus) => {
              const genusCount = genus.species.reduce(
                (total, item) => total + item.observations.length,
                0,
              );

              return (
                <details className="taxonomy-level taxonomy-level--genus" key={genus.genus}>
                  <summary>
                    <span>{genus.genus}</span>
                    <strong>{genusCount}</strong>
                  </summary>

                  <div className="taxonomy-species-list">
                    {genus.species.map((species) => (
                      <button
                        className="species-row"
                        key={species.scientificName}
                        onClick={() => onSelectObservation(species.observations[0])}
                        type="button"
                      >
                        <span>{species.scientificName}</span>
                        <strong>{species.observations.length}</strong>
                      </button>
                    ))}
                  </div>
                </details>
              );
            })}
          </details>
        );
      })}
    </div>
  );
}
