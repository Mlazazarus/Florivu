# Plant Retail App MVP Seed Database

Created: 2026-05-28
Plant records: 279
Care profiles: 26

## What this is
A practical MVP seed database for a plant collection, plant marketplace, or listing assistant. It includes common houseplants, rare aroids, succulents, cacti, hoyas, orchids, ferns, carnivorous plants, herbs, edible starters, annuals, perennials, shrubs, fruit trees, and bonsai-type plants.

## How to use it
- Runtime app assets live in `src/assets/plant-catalog/`.
- Editable source tables live in `data/plant-catalog/`.
- Reference docs and the seed SQL live in `docs/plant-catalog/`.

## Data model recommendation
Keep global plant profiles separate from user listings. A global profile gives default description/care guidance; a user listing should store seller-specific details like price, photos, rooted status, pest treatment, local pickup/shipping, and custom care notes.

## Important limitations
- This is an MVP seed layer, not a legally or scientifically complete plant encyclopedia.
- Scientific names, cultivar names, and toxicity flags should be verified before production.
- Do not market plants as materially improving indoor air quality. Use airflow, humidity, draft sensitivity, and ventilation notes instead.
- Care instructions are generalized by care profile. Let the seller override plant-specific or local-climate instructions.

## Suggested next step
Ask Codex to import this package and build a fuzzy matcher from user-entered plant name/photo-ID result to `plants.id`, then attach the matching `care_profile_id` to user collection records.
