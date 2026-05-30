# Codex task: integrate plant seed database into current app

Goal: Add a reusable plant database and care-profile matching layer to the current plant collection/listing app.

Files in this seed pack:
- plant_database.json: nested JSON with metadata, care_profiles, and 277 plant records.
- plants.csv: flat plant table for review/import.
- care_profiles.json/csv: generalized care categories.
- plant_seed.db: SQLite version of the seed database.
- schema.sql: suggested SQL schema.

Implementation requirements:
1. Add a PlantProfile model/table using `plants.id` as the stable seed key.
2. Add a CareProfile model/table using `care_profiles.id`.
3. Add fields to the user collection/listing model:
   - plant_profile_id nullable FK
   - care_profile_id nullable FK or derived from PlantProfile
   - user_custom_description
   - user_custom_care_notes
   - care_overrides_json
   - match_confidence
   - match_source: manual | photo_id | text_search | import
4. Create a seed/import script that loads care profiles first, then plant profiles.
5. Create a matching function:
   - normalize input and aliases
   - exact match first
   - fuzzy match second
   - return top 3 candidates with score
   - require user confirmation under a confidence threshold
6. In the UI, when a user adds a plant, show the matched description and care instructions as defaults, but let the seller edit and save their own listing text.
7. Do not present `pet_safety` as veterinary advice. Label it as "verify before listing as pet-safe" and link to ASPCA or another authoritative source in production.
8. Do not claim plants purify indoor air. Use airflow/humidity/ventilation notes instead.
9. Add tests for:
   - seed import count >= 200
   - exact common-name match
   - alias match, e.g. "Sansevieria trifasciata" -> Snake Plant
   - fuzzy typo match, e.g. "monstra" -> Monstera Deliciosa candidates
   - seller override does not mutate global seed profile

Deliverables:
- Migration/model files
- Seed import script
- Search/matching utility
- UI hook/component for selecting matched plant profile
- Unit tests for matching and import
