export interface PlantNetSpecies {
  scientificName: string;
  scientificNameWithoutAuthor: string;
  commonNames: string[];
  family: { scientificName: string; commonNames: string[] };
  genus:  { scientificName: string; commonNames: string[] };
}

export interface PlantNetResult {
  score: number;
  species: PlantNetSpecies;
  images: { url: { m: string; o: string; s: string } }[];
}

export interface PlantNetResponse {
  bestMatch: string;
  results: PlantNetResult[];
  remainingIdentificationRequests: number;
}

export type OrganType = 'flower' | 'leaf' | 'fruit' | 'bark' | 'auto';

export interface UserProfile {
  user_id: string;
  display_name: string;
  profile_photo_url?: string | null;
  home_zip_code?: string | null;
  facebook_url?: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Observation {
  id: string;
  user_id: string;
  photo_url: string;
  common_name: string;
  scientific_name: string;
  family: string;
  genus: string;
  species: string;
  confidence: number;
  date_found: string;
  zip_code?: string | null;
  notes?: string;
  created_at: string;
}

export interface SpeciesGroup {
  species: string;
  scientificName: string;
  observations: Observation[];
}

export interface GenusGroup {
  genus: string;
  species: SpeciesGroup[];
}

export interface TaxonomyFamily {
  family: string;
  genera: GenusGroup[];
}
