# Entity Slugs System

## Overview
Slugs are immutable, standardized identifiers for entities (characters, locations, props).

## Slug Format
`lowercase(name) + remove_accents + replace(" /-" with "_")`

Examples:
- "Helene Kheler" → helene_kheler
- "Flower-Filled City" → flower_filled_city
- "Chambre d'enfant" → chambre_d_enfant

## Database
- character.slug (TEXT, UNIQUE)
- location.slug (TEXT, UNIQUE)
- prop.slug (TEXT, UNIQUE)

## Beat Generation
Beat prompt receives ONLY slugs:
```
AVAILABLE ENTITIES:
- {helene_kheler} (character)
- {flower_filled_city} (location)
```

## Validation
Any beat referencing unknown slug is rejected and retried (max 2×).

## Flow API Integration
Every entity referenced in beats MUST have a `media_id` (UUID of reference asset).

Beat to Flow mapping:
```json
{
  "ref_entity_names": ["helene_kheler", "flower_filled_city"],
  "ref_entity_media_ids": [
    {"slug": "helene_kheler", "media_id": "char-helene-uuid", "type": "character"},
    {"slug": "flower_filled_city", "media_id": "loc-city-uuid", "type": "location"}
  ]
}
```
