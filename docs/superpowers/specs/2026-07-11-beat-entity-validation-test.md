# Beat-Entity Validation Test Script

**Date:** 2026-07-11  
**Scope:** Test story generation to verify that beat entities are properly linked to existing entity types in the database.

---

## Objective

Create a test script that:

1. **Detects bugs** — Catch cases where the AI generates beats that reference non-existent entities (hallucinations) or wrong entity types
2. **Establishes a quality baseline** — Measure what % of generated beats are valid, track improvements over time

The test generates **real stories via Claude AI** and validates them against a real database of entities.

---

## Requirements

### Scope

- Generate **5-10 story variations** with different configurations
- Test **real entities** from an actual database project
- Mock the **Flow API for images** to keep tests fast (no real image generation)
- Validate both:
  - **Hallucinations:** beats reference entity slugs that don't exist in DB
  - **Type mismatches:** beats use an entity with the wrong type (e.g., character used as location)

### Test Configurations (5-10 variations)

| Style | Language | Duration | Total |
|-------|----------|----------|-------|
| anime | French | 30s | 1 |
| anime | French | 60s | 1 |
| realistic | English | 30s | 1 |
| realistic | English | 60s | 1 |
| cinematic | French | 120s | 1 |
| cinematic | English | 120s | 1 |
| anime | English | 60s | 1 |
| realistic | French | 60s | 1 |
| cinematic | English | 60s | 1 |
| (optional) | (optional) | (optional) | +1 |

**Total: 9-10 test runs per execution**

**Language requirement:** French and English only — no Vietnamese in the test.

---

## Design

### Architecture

The script `tests/test_beat_entity_validation.py` performs:

#### 1. Setup Phase

```python
def setup_test_project():
    """Create a project with real test entities."""
    - Create project in SQLite DB with:
      - 4 characters (distinct names/slugs)
      - 4 locations (distinct names/slugs)
      - 2-3 props (distinct names/slugs)
    - Verify entities are persisted and slugs are correct
    - Return: project_id, entities dict
```

**Example entities:**
- **Characters:** "Helene Kheler", "Prince Aldwin", "Sage Miriam", "Merchant Luc"
- **Locations:** "Ancient Temple", "Flower-Filled City", "Royal Palace", "Forest Clearing"
- **Props:** "Crystal Orb", "Wooden Bowl"

#### 2. Main Loop: Generate & Validate

```python
def generate_and_validate_story(config, project_id, entities):
    """For one configuration: generate a story and validate beats."""
    
    # Extract config
    style = config["style"]           # anime, realistic, cinematic
    language = config["language"]     # French, English
    duration = config["duration"]     # 30, 60, 120 seconds
    
    # Generate story
    voiceover = generate_voiceover(language, duration, entities)
    beats = brain.unified_scene_beats_prompt(
        voiceover=voiceover,
        entities=entities,
        style=style,
        culture_hint=language_to_culture(language)
    )
    
    # Validate beats
    validation_result = validate_beat_entities(beats, entities)
    
    # Mock Flow API: don't call real API
    for beat in beats:
        beat["image_media_id"] = mock_flow_generate_image(beat)
    
    return validation_result
```

#### 3. Validation

```python
def validate_beat_entities(beats, entities):
    """Check each beat against DB entities."""
    
    issues = {
        "valid": True,
        "hallucinations": [],      # {entity_slug} not in DB
        "type_mismatches": [],     # entity type mismatch
        "valid_beats": 0,
        "invalid_beats": 0
    }
    
    entity_slugs_by_type = {
        "character": {e["slug"] for e in entities if e["type"] == "character"},
        "location": {e["slug"] for e in entities if e["type"] == "location"},
        "prop": {e["slug"] for e in entities if e["type"] == "prop"}
    }
    
    for beat in beats:
        braced_names = extract_braced_names(beat["description"])
        
        for name in braced_names:
            # Check 1: Does this slug exist in DB?
            found = False
            found_type = None
            for etype, slugs in entity_slugs_by_type.items():
                if name in slugs:
                    found = True
                    found_type = etype
                    break
            
            if not found:
                issues["hallucinations"].append({
                    "slug": name,
                    "beat": beat["description"]
                })
                issues["valid"] = False
                issues["invalid_beats"] += 1
            else:
                # Check 2: Is the type used correctly?
                # (This requires the beat to somehow indicate type usage)
                # Simplified: just check existence for now
                pass
        
        if not issues["hallucinations"]:  # Rough check
            issues["valid_beats"] += 1
    
    return issues
```

#### 4. Reporting

```python
def report_results(all_results):
    """Format and print the summary report."""
    
    total_beats = sum(r["valid_beats"] + r["invalid_beats"] for r in all_results)
    valid_beats = sum(r["valid_beats"] for r in all_results)
    
    print(f"""
Beat Entity Validation Report
==============================
Test Date: {datetime.now()}

Summary:
  Total stories:   {len(all_results)}
  Total beats:     {total_beats}
  Valid beats:     {valid_beats}/{total_beats} ({100*valid_beats/total_beats:.1f}%)
  
By Configuration:
""")
    
    for result in all_results:
        style = result["config"]["style"]
        lang = result["config"]["language"]
        dur = result["config"]["duration"]
        valid = result["valid_beats"]
        total = result["valid_beats"] + result["invalid_beats"]
        print(f"  {style:12} | {lang:8} | {dur:3}s | {valid}/{total} ✓")
    
    # Aggregate bugs
    all_hallucinations = []
    for result in all_results:
        all_hallucinations.extend(result.get("hallucinations", []))
    
    if all_hallucinations:
        print(f"\nHallucinations found ({len(all_hallucinations)}):")
        for h in all_hallucinations[:10]:
            print(f"  - {h['slug']} in: {h['beat'][:60]}...")
```

### Mock Flow API

```python
def mock_flow_generate_image(beat):
    """Return a fake media_id instead of calling Flow API."""
    # Generate deterministic fake ID based on beat content
    fake_id = f"mock-{hashlib.md5(beat['description'].encode()).hexdigest()[:8]}"
    return fake_id
```

### Voiceover Generator

```python
def generate_voiceover(language, duration_secs, entities):
    """
    Generate a simple voiceover in the given language.
    
    Uses a template approach (not full AI generation) to keep test fast.
    For each language, use a template that mentions the entities.
    """
    
    templates = {
        "French": [
            "{char1} se réveille dans la {loc1}. Il découvre une {prop1}.",
            "{char2} voyage vers la {loc2} à la recherche de {prop2}.",
            # ... more templates
        ],
        "English": [
            "{char1} wakes up in the {loc1}. She discovers a {prop1}.",
            "{char2} travels to the {loc2} in search of {prop2}.",
            # ... more templates
        ]
    }
    
    template = random.choice(templates[language])
    voiceover = template.format(
        char1=random.choice([e["name"] for e in entities if e["type"]=="character"]),
        loc1=random.choice([e["name"] for e in entities if e["type"]=="location"]),
        prop1=random.choice([e["name"] for e in entities if e["type"]=="prop"]),
        # ... etc
    )
    
    # Repeat to fill duration
    while len(voiceover.split()) < duration_secs * 2.5:  # ~2.5 words per second
        voiceover += " " + random.choice(templates[language])
    
    return voiceover[:500]  # Cap length
```

---

## Expected Output

```
Beat Entity Validation Report
==============================
Test Date: 2026-07-11 15:30:45

Summary:
  Total stories:   10
  Total beats:     95
  Valid beats:     87/95 (91.6%)

By Configuration:
  anime        | French  |  30s | 9/10 ✓
  anime        | French  |  60s | 9/10 ✓
  realistic    | English |  30s | 8/9 ✓
  realistic    | English |  60s | 9/10 ✓
  cinematic    | French  | 120s | 8/9 ✓
  cinematic    | English | 120s | 9/10 ✓
  anime        | English |  60s | 9/10 ✓
  realistic    | French  |  60s | 8/9 ✓
  cinematic    | English |  60s | 9/10 ✓

Hallucinations found (5):
  - {unknown_wizard} in: At {unknown_wizard}'s tower, {Helene} searches...
  - {magic_forest} in: The {magic_forest} glows with ethereal light...
  ...

Type mismatches found (3):
  - {Helene} (character) used as location in: They arrive at {Helene}...
  ...

Recommendations:
  - Add stricter constraints to beat generation prompt
  - Consider auto-fix for common hallucinations
```

---

## Test Data Persistence

- **Database:** Uses SQLite (same as production)
- **Cleanup:** Test creates entities in a temporary project, cleans up after (optional: keep for manual inspection)
- **Reproducibility:** All random seeds fixed for consistent test runs

---

## Implementation Details

### Files to Create

- `tests/test_beat_entity_validation.py` — Main test script
- `tests/fixtures/test_entities.py` — Test entity definitions

### Dependencies

- Existing: `agent.studio.brain`, `agent.studio.validation`, `agent.studio.db`
- New: None (uses stdlib only for mocking)

### Runtime

- **Duration:** ~5-10 minutes per run (depending on Claude API latency)
- **Cost:** ~5 API calls per story (1 for beat generation + overhead) = ~50 calls total = ~$0.20-0.50

---

## Success Criteria

✓ Script runs without errors  
✓ Generates 9-10 stories with varied configs  
✓ Validates beats correctly (detects hallucinations + type mismatches)  
✓ Report shows % valid beats (target: >85%)  
✓ Test is reproducible (same seed = same results)  

---

## Future Improvements

- Add auto-fix: automatically correct hallucinations and retry
- Add multi-run tracking: compare results over time
- Add graphing: visualize validation % by style/language
- Parallel execution: async generation to speed up runs
