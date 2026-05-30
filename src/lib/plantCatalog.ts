import careProfilesSeed from '../assets/plant-catalog/care-profiles.json';
import plantDatabaseSeed from '../assets/plant-catalog/plant-database.json';
import type {
  CareProfile,
  CatalogPlant,
  Observation,
  PlantCatalogMatch,
  PlantCatalogMatchSource,
} from '../types';

type CatalogSearchInput = {
  catalogPlantId?: string | null;
  careProfileId?: string | null;
  commonName?: string | null;
  scientificName?: string | null;
  species?: string | null;
};

type CatalogPlantSeed = Omit<CatalogPlant, 'aliases'> & {
  aliases?: string[] | null;
};

type NormalizedCatalogSearchInput = {
  commonName: string;
  scientificName: string;
  species: string;
  careProfileId: string | null;
};

type PreparedCatalogPlant = {
  plant: CatalogPlant;
  normalizedCommonName: string;
  normalizedScientificName: string;
  normalizedAliases: string[];
  compactCommonName: string;
  compactScientificName: string;
  compactAliases: string[];
};

const rawCareProfiles = careProfilesSeed as Record<string, Omit<CareProfile, 'id'>>;
const rawCatalogPlants = ((plantDatabaseSeed as { plants?: CatalogPlantSeed[] }).plants ?? []);

const careProfiles = Object.entries(rawCareProfiles).map(([id, profile]) => ({
  id,
  ...profile,
}));

const careProfileById = new Map(careProfiles.map((profile) => [profile.id, profile]));

const preparedCatalogPlants: PreparedCatalogPlant[] = rawCatalogPlants.map((plant) => ({
  plant: {
    ...plant,
    aliases: Array.isArray(plant.aliases)
      ? plant.aliases.filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0)
      : [],
  },
  normalizedCommonName: normalizeCatalogText(plant.common_name),
  normalizedScientificName: normalizeCatalogText(plant.scientific_name),
  normalizedAliases: Array.isArray(plant.aliases)
    ? plant.aliases.map((alias) => normalizeCatalogText(alias)).filter(Boolean)
    : [],
  compactCommonName: compactCatalogText(plant.common_name),
  compactScientificName: compactCatalogText(plant.scientific_name),
  compactAliases: Array.isArray(plant.aliases)
    ? plant.aliases.map((alias) => compactCatalogText(alias)).filter(Boolean)
    : [],
}));

const catalogPlantById = new Map(preparedCatalogPlants.map(({ plant }) => [plant.id, plant]));

function normalizeCatalogText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactCatalogText(value: string | null | undefined) {
  return normalizeCatalogText(value).replace(/\s+/g, '');
}

function countSharedTokens(left: string, right: string) {
  if (!left || !right) {
    return 0;
  }

  const leftTokens = new Set(left.split(' ').filter(Boolean));
  let overlap = 0;

  for (const token of right.split(' ')) {
    if (leftTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

function withCareProfile(match: {
  plant: CatalogPlant;
  matchedOn: PlantCatalogMatchSource;
  score: number;
}): PlantCatalogMatch {
  return {
    ...match,
    careProfile: careProfileById.get(match.plant.care_profile_id) ?? null,
  };
}

function scorePreparedPlant(
  preparedPlant: PreparedCatalogPlant,
  input: NormalizedCatalogSearchInput,
) {
  const {
    plant,
    normalizedAliases,
    normalizedCommonName,
    normalizedScientificName,
    compactAliases,
    compactCommonName,
    compactScientificName,
  } = preparedPlant;
  let bestScore = 0;
  let matchedOn: PlantCatalogMatchSource | null = null;
  const compactCommonQuery = compactCatalogText(input.commonName);
  const compactScientificQuery = compactCatalogText(input.scientificName);
  const compactSpeciesQuery = compactCatalogText(input.species);

  const consider = (nextScore: number, nextMatchedOn: PlantCatalogMatchSource) => {
    if (nextScore > bestScore) {
      bestScore = nextScore;
      matchedOn = nextMatchedOn;
    }
  };

  if (input.scientificName && input.scientificName === normalizedScientificName) {
    consider(120, 'scientific-name');
  }

  if (input.species && input.species === normalizedScientificName) {
    consider(118, 'species');
  }

  if (input.commonName && input.commonName === normalizedCommonName) {
    consider(116, 'common-name');
  }

  if (compactCommonQuery && compactCommonQuery === compactCommonName) {
    consider(115, 'common-name');
  }

  if (
    (input.commonName && normalizedAliases.includes(input.commonName)) ||
    (input.scientificName && normalizedAliases.includes(input.scientificName))
  ) {
    consider(114, 'alias');
  }

  if (
    (compactCommonQuery && compactAliases.includes(compactCommonQuery)) ||
    (compactScientificQuery && compactAliases.includes(compactScientificQuery))
  ) {
    consider(113, 'alias');
  }

  if (
    input.scientificName &&
    normalizedScientificName &&
    (input.scientificName.includes(normalizedScientificName) ||
      normalizedScientificName.includes(input.scientificName))
  ) {
    consider(96, 'scientific-name');
  }

  if (
    input.species &&
    normalizedScientificName &&
    (input.species.includes(normalizedScientificName) || normalizedScientificName.includes(input.species))
  ) {
    consider(94, 'species');
  }

  if (
    compactScientificQuery &&
    compactScientificName &&
    (compactScientificQuery.includes(compactScientificName) ||
      compactScientificName.includes(compactScientificQuery))
  ) {
    consider(95, 'scientific-name');
  }

  if (
    compactSpeciesQuery &&
    compactScientificName &&
    (compactSpeciesQuery.includes(compactScientificName) ||
      compactScientificName.includes(compactSpeciesQuery))
  ) {
    consider(93, 'species');
  }

  const commonQueries = [input.commonName, input.scientificName].filter(Boolean);
  for (const query of commonQueries) {
    if (
      query &&
      normalizedCommonName &&
      query.length >= 4 &&
      (normalizedCommonName.includes(query) || query.includes(normalizedCommonName))
    ) {
      consider(90, 'common-name');
    }

    if (
      query &&
      normalizedAliases.some(
        (alias) => alias.length >= 4 && (alias.includes(query) || query.includes(alias)),
      )
    ) {
      consider(88, 'alias');
    }
  }

  const tokenOverlap = Math.max(
    countSharedTokens(normalizedCommonName, input.commonName),
    ...normalizedAliases.map((alias) => countSharedTokens(alias, input.commonName)),
  );

  if (tokenOverlap >= 2) {
    consider(74 + tokenOverlap * 4, 'fuzzy');
  }

  if (bestScore > 0 && input.careProfileId && plant.care_profile_id === input.careProfileId) {
    bestScore += 2;
  }

  if (!matchedOn || bestScore < 74) {
    return null;
  }

  return withCareProfile({
    plant,
    matchedOn,
    score: bestScore,
  });
}

export function findPlantCatalogMatch(input: CatalogSearchInput): PlantCatalogMatch | null {
  if (input.catalogPlantId) {
    const plant = catalogPlantById.get(input.catalogPlantId);
    if (plant) {
      return withCareProfile({
        plant,
        matchedOn: 'catalog-id',
        score: 200,
      });
    }
  }

  const normalizedInput = {
    commonName: normalizeCatalogText(input.commonName),
    scientificName: normalizeCatalogText(input.scientificName),
    species: normalizeCatalogText(input.species),
    careProfileId: input.careProfileId ?? null,
  };

  if (!normalizedInput.commonName && !normalizedInput.scientificName && !normalizedInput.species) {
    return null;
  }

  let bestMatch: PlantCatalogMatch | null = null;

  for (const preparedPlant of preparedCatalogPlants) {
    const nextMatch = scorePreparedPlant(preparedPlant, normalizedInput);

    if (!nextMatch) {
      continue;
    }

    if (
      !bestMatch ||
      nextMatch.score > bestMatch.score ||
      (nextMatch.score === bestMatch.score &&
        nextMatch.plant.common_name.localeCompare(bestMatch.plant.common_name, undefined, {
          sensitivity: 'base',
        }) < 0)
    ) {
      bestMatch = nextMatch;
    }
  }

  return bestMatch;
}

export function resolveObservationCatalogMatch(observation: Pick<
  Observation,
  'catalog_plant_id' | 'care_profile_id' | 'common_name' | 'scientific_name' | 'species'
>) {
  return findPlantCatalogMatch({
    catalogPlantId: observation.catalog_plant_id,
    careProfileId: observation.care_profile_id,
    commonName: observation.common_name,
    scientificName: observation.scientific_name,
    species: observation.species,
  });
}

export function formatCatalogLabel(value: string | null | undefined) {
  const normalizedValue = (value ?? '').trim();

  if (!normalizedValue) {
    return '';
  }

  return normalizedValue
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function formatCatalogMatchSource(source: PlantCatalogMatchSource) {
  switch (source) {
    case 'catalog-id':
      return 'saved match';
    case 'scientific-name':
      return 'scientific name';
    case 'species':
      return 'species name';
    case 'common-name':
      return 'plant name';
    case 'alias':
      return 'alternate name';
    case 'fuzzy':
    default:
      return 'best match';
  }
}
