-- Plant retail app seed schema
CREATE TABLE care_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  light_category TEXT,
  water_category TEXT,
  humidity_category TEXT,
  soil_category TEXT,
  light TEXT,
  water TEXT,
  humidity TEXT,
  soil TEXT,
  airflow TEXT,
  difficulty TEXT
);

CREATE TABLE plants (
  id TEXT PRIMARY KEY,
  common_name TEXT NOT NULL,
  scientific_name TEXT,
  aliases TEXT,
  retail_group TEXT,
  care_profile_id TEXT REFERENCES care_profiles(id),
  description TEXT,
  care_summary TEXT,
  light_category TEXT,
  water_category TEXT,
  humidity_category TEXT,
  soil_category TEXT,
  airflow_notes TEXT,
  difficulty TEXT,
  pet_safety TEXT,
  data_quality TEXT,
  listing_keywords TEXT
);

-- Matching strategy:
-- 1) Normalize user-entered name/photo-ID result to lowercase and remove punctuation.
-- 2) Exact match common_name, scientific_name, then aliases.
-- 3) Fuzzy match using trigram/Levenshtein against common_name + aliases.
-- 4) If confidence is low, ask user to pick from top 3 matches.
-- 5) Attach plants.care_profile_id to user collection/listing and allow seller override.
