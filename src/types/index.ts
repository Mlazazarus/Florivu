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
export type AccountTier = 'free' | 'plus';

export interface UserProfile {
  user_id: string;
  display_name: string;
  account_tier: AccountTier;
  profile_photo_url?: string | null;
  home_zip_code?: string | null;
  marketplace_zip_code?: string | null;
  facebook_url?: string | null;
  facebook_user_id?: string | null;
  facebook_name?: string | null;
  facebook_connected_at?: string | null;
  earned_achievement_ids?: string[] | null;
  referred_by_user_id?: string | null;
  selected_avatar_border_id?: string | null;
  selected_profile_title_id?: string | null;
  featured_house_plant_observation_id?: string | null;
  featured_non_house_plant_observation_id?: string | null;
  care_alerts_enabled?: boolean;
  care_alert_email?: string | null;
  care_alert_timezone?: string | null;
  care_alert_last_sent_at?: string | null;
  is_public: boolean;
  is_placeholder?: boolean;
  created_at: string;
  updated_at: string;
}

export interface FriendProfile extends UserProfile {
  observation_count: number;
  species_count: number;
}

export interface CareProfile {
  id: string;
  name: string;
  light_category: string;
  water_category: string;
  humidity_category: string;
  soil_category: string;
  light: string;
  water: string;
  humidity: string;
  soil: string;
  airflow: string;
  difficulty: string;
}

export interface CatalogPlant {
  id: string;
  common_name: string;
  scientific_name: string;
  aliases: string[];
  retail_group: string;
  care_profile_id: string;
  description: string;
  care_summary: string;
  light_category: string;
  water_category: string;
  humidity_category: string;
  soil_category: string;
  airflow_notes: string;
  difficulty: string;
  pet_safety: string;
  data_quality: string;
  listing_keywords: string;
}

export type PlantCatalogMatchSource =
  | 'catalog-id'
  | 'scientific-name'
  | 'species'
  | 'common-name'
  | 'alias'
  | 'fuzzy';

export interface PlantCatalogMatch {
  plant: CatalogPlant;
  careProfile: CareProfile | null;
  matchedOn: PlantCatalogMatchSource;
  score: number;
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
  is_favorite: boolean;
  is_house_plant: boolean;
  catalog_plant_id?: string | null;
  care_profile_id?: string | null;
  created_at: string;
}

export type CareTaskKey = 'water' | 'rotate' | 'feed' | 'refresh-soil';

export interface CareTaskSchedule {
  id: string;
  observation_id: string;
  user_id: string;
  task_key: CareTaskKey;
  title: string;
  instructions: string;
  cadence_days: number;
  sort_order: number;
  source: 'bundled';
  last_completed_at?: string | null;
  next_due_at: string;
  created_at: string;
  updated_at: string;
}

export interface ZipCodeMapLocation {
  zipCode: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
  label: string;
}

export interface ZipCodeMapResponse {
  locations: ZipCodeMapLocation[];
  unresolvedZipCodes: string[];
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
