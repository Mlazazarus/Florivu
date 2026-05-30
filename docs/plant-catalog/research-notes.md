# Research notes and design rationale

This seed pack uses a hybrid model: many plant records map to a smaller set of generalized care profiles. That keeps the MVP maintainable while still letting the app generate useful defaults for listings and collections.

## Plant selection strategy
The 277 plant records are selected to cover common resale and small nursery categories:
- Common houseplants and beginner plants
- Aroids and rare collector plants
- Succulents and cacti
- Hoyas, orchids, bromeliads, ferns, and carnivorous plants
- Culinary herbs and edible starters
- Outdoor annuals, perennials, shrubs, bulbs, fruiting trees, and bonsai-type plants

## Care taxonomy strategy
Care instructions are generalized into care profiles based on:
- Light exposure
- Watering/drydown style
- Humidity tolerance
- Soil/media type
- Airflow and draft sensitivity
- Difficulty level

This is better for an MVP than writing 277 totally separate care guides, because many plants in the same practical retail category share the same care pattern.

## Production warnings
- Verify scientific names and cultivar names before showing them as authoritative.
- Verify pet toxicity before public pet-safety claims.
- Do not claim indoor plants materially purify normal home air. Use airflow/humidity/ventilation notes instead.
- Let sellers override global care notes for local climate, potting media, propagation status, and shipping/acclimation details.

## Useful source categories for future enrichment
- GBIF and USDA PLANTS for taxonomy/standardized plant identity.
- NC State Extension Plant Toolbox and university extension pages for practical horticultural guidance.
- ASPCA toxic/non-toxic plant search for pet-safety validation.
- Perenual or Trefle for plant API enrichment, with license/commercial-use review.
- National Garden Bureau and major nursery catalogs for market/category signals.
