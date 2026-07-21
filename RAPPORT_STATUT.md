# Rapport Statut - Beat Entity Extraction & Slug Generation

**Date:** 2026-07-13  
**Sujet:** Intégration des slugs et extraction d'entités typées pour generateBeats

---

## ✅ COMPLÉTÉ

### 1. Structure typée des entités (ref_entities)
- ✅ Changé `ref_entity_names` (array plat) → `ref_entities` (objet typé)
- ✅ Structure: `{characters: [], locations: [], props: []}`
- ✅ Permet de différencier les types d'entités dans les beats

### 2. Génération des slugs
- ✅ Fonction `normalizeToSlug()` ajoutée à WorkflowContext
- ✅ Slugs générés lors de l'extraction d'assets (ex: "KENNY CHAN" → "kenny_chan")
- ✅ Slugs stockés dans les entities extraits

### 3. Passage des entities au prompt generateBeats
- ✅ Signature de `generateBeats()` mise à jour pour accepter entities typées
- ✅ WorkflowContext passe `{characters, locations, props}` au lieu de assetContext textuel
- ✅ Les entities avec slugs sont maintenant dans le state après extraction

### 4. Conversion slug→name
- ✅ Fonction `convertSlugsToNames()` créée pour mapper les slugs retournés en noms pleins
- ✅ Fallback name→name pour les entités sans slug

### 5. Validation des entités (filtre hallucinations)
- ✅ Filtre côté client supprime les entités hallucées non dans la liste
- ✅ Validation contre les sets valides (characters, locations, props)

### 6. Mock Flow API
- ✅ Endpoint `/api/flow/generate-image` respecte `USE_MOCK_FLOW` config
- ✅ Si `USE_MOCK_FLOW=true` → retourne image placeholder au lieu d'appel Flow réel

### 7. Refactoring UI
- ✅ Step 4: Titre changé de "Generate Asset References" → "Review Extracted Assets"
- ✅ Description clarifiée: les références sont déjà générées à step 2.6

### 8. State management
- ✅ `extractAndGenerateAssets()` met à jour `state.characters/locations/props` avec les entities extraits
- ✅ Les slugs sont propagés à travers le state pour utilisation dans generateBeats

---

## ⚠️ EN COURS / PROBLÈME IDENTIFIÉ

### Character & Prop Recognition Issue
**Problème:** L'AI retourne les characters et props comme arrays vides  
**Symptôme:**
```
Beat 1 ref_entities: {
  characters: [],  // ❌ KENNY CHAN ne pas reconnu
  locations: ['DOJO'],  // ✅ OK
  props: []  // ❌ TRAINING MANNEQUIN ne pas reconnu
}
```

**Cause hypothétique:**
- L'AI voit la liste AVAILABLE CHARACTERS: `- KENNY CHAN`
- L'AI voit le screenplay mentionner "KENNY CHAN"
- Mais ne reconnaît pas le match → retourne array vide

**Logs disponibles:**
- Console: `Beat X ref_entities: {...}` montre le résultat final
- Console: `✅ Parsed beats from AI - Beat 1 ref_entities: {...}` montrerait le JSON brut

**Action requise:** 
Vérifier le JSON brut retourné par l'AI pour confirmer si c'est vraiment vide ou si c'est un problème de conversion/filtre

---

## 📋 TODO

### 1. Résoudre Character/Prop Recognition (PRIORITÉ HAUTE)
- [ ] Vérifier le JSON brut de l'AI dans les logs
- [ ] Renforcer le prompt si les arrays sont vraiment vides
- [ ] Tester avec des noms simples ou slugs explicites si nécessaire
- [ ] Valider que TRAINING MANNEQUIN est aussi reconnu

### 2. Tester generateImages
- [ ] Vérifier que les images sont générées (ou mockées si USE_MOCK_FLOW=true)
- [ ] Valider que les locations/characters/props sont utilisés pour les références

### 3. Full workflow test
- [ ] Screenplay complet → beats → assets → images → storyboard
- [ ] Vérifier que tous les beats ont les entities corrects

### 4. Cleanup logs
- [ ] Supprimer les logs de debug une fois stabilisé
  - `console.log("🎯 generateBeats action started")`
  - `console.log("📋 Characters:", ...)`
  - `console.log("📄 Raw AI response:", ...)`
  - `console.log("Beat X ref_entities:", ...)`

### 5. Documentation
- [ ] Mettre à jour README avec la structure ref_entities
- [ ] Documenter la config USE_MOCK_FLOW pour les contributeurs

---

## 🔧 Configuration Utile

**Activer Mock Flow:**
```bash
USE_MOCK_FLOW=true python -m agent.main
```

**Logs à surveiller:**
```javascript
// Console browser (F12)
🎬 generateBeats prompt:  // Voir les AVAILABLE CHARACTERS/LOCATIONS/PROPS
📄 Raw AI response:       // Voir le JSON brut de l'AI
Beat X ref_entities:      // Voir le résultat final après conversion
```

---

## 📊 Résumé Technique

| Composant | État | Notes |
|-----------|------|-------|
| Structure typée ref_entities | ✅ | {characters, locations, props} |
| Génération slugs | ✅ | normalizeToSlug() en place |
| Passage entities au prompt | ✅ | Signature generateBeats() modifiée |
| Conversion slug→name | ✅ | convertSlugsToNames() créée |
| Filtre hallucinations | ✅ | Validation côté client |
| Mock Flow API | ✅ | USE_MOCK_FLOW config respectée |
| Character recognition | ❌ | Arrays vides pour chars & props |
| Locations recognition | ✅ | Fonctionne correctement |

---

## Prochaines Étapes
1. Confirmer le problème Character/Prop via logs
2. Ajuster le prompt ou la logique d'extraction
3. Valider full workflow
4. Nettoyer logs de debug
