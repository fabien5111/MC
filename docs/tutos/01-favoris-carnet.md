# Script tuto — Mettre une recette en favori et la retrouver dans le carnet

> Gabarit : `TEMPLATE_tuto.md`. Scénario de tournage :
> `.claude/skills/nouveau-tuto/scenarios/favoris-carnet.mjs` (compétence `/nouveau-tuto`).

---

## Fiche technique

| Champ | Valeur |
|---|---|
| Fonctionnalité | Favoris (cœur de la fiche recette et de la carte) → Mon carnet, pastille « Favoris » |
| Durée cible maximum | 90 s — réelle : ~28 s |
| Nombre de mots visé | ~65 |
| Public | Nouvel utilisateur |
| Format | Ordinateur, 1920×1080 |
| Voix | ElevenLabs, modèle Multilingual v2, voix française (*Stability* 50 %, *Similarity* 75 %) |
| Statut | Enregistré |
| Dernière mise à jour | 2026-10-21 |

## Objectif

> À la fin de cette vidéo, l'utilisateur sait mettre une recette en favori —
> depuis sa fiche ou depuis sa carte — et la retrouver dans son carnet.

## Prérequis de tournage

- [x] Connecté avec le compte démo (connexion hors caméra)
- [x] Les deux premières recettes de « Dernières Créations » ne sont pas en
      favori (le scénario retire puis rétablit l'état d'origine)
- [x] Compte démo en formule payante : la formule gratuite plafonne à 20 favoris
- [x] Écran de départ : accueil, haut de page
- [x] Bandeau cookies et bannière d'installation masqués
- [x] Fenêtre en 1920×1080

---

## Script

### Accroche

| Voix off | À l'écran |
|---|---|
| Une recette vous plaît ? Mettez-la en favori pour la garder sous la main. | Haut de l'accueil, puis défilement jusqu'à « Dernières Créations » |

### Étapes

| # | Voix off | À l'écran | Note de montage |
|---|---|---|---|
| 1 | Ouvrez la recette, puis cliquez sur le cœur, à côté du titre. | Clic sur la carte, puis sur le cœur de la fiche | — |
| 2 | Elle vous attend dans Mon carnet, rubrique Favoris. | Clic sur « Mon carnet » (en-tête), puis sur la pastille « Favoris » | — |
| 3 | Encore plus rapide : depuis l'accueil, cliquez directement sur le cœur d'une carte, sans ouvrir la recette. | Clic sur « Accueil », défilement, clic sur le cœur d'une carte | — |

### Conclusion

| Voix off | À l'écran |
|---|---|
| Tous vos coups de cœur, réunis au même endroit. | Mon carnet → Favoris, la seconde recette visée par le curseur |

Texte à coller dans ElevenLabs (une phrase par ligne, sans `<break>` — le
calage est fait par `assembler.mjs`) :

```
Une recette vous plaît ? Mettez-la en favori pour la garder sous la main.
Ouvrez la recette, puis cliquez sur le cœur, à côté du titre.
Elle vous attend dans Mon carnet, rubrique Favoris.
Encore plus rapide : depuis l'accueil, cliquez directement sur le cœur d'une carte, sans ouvrir la recette.
Tous vos coups de cœur, réunis au même endroit.
```

---

## Termes à prononcer correctement

| Mot | Écrire dans l'outil TTS |
|---|---|
| Je pâtisse | (non prononcé dans ce tuto) |

## Checklist avant publication

- [x] Script relu à voix haute
- [x] Durée réelle conforme à la cible
- [x] Aucune donnée personnelle visible à l'écran (connexion hors caméra)
- [ ] Sous-titres corrigés (`tuto.srt` produit par `assembler.mjs`)
- [ ] Titre, description et miniature préparés
- [ ] Vidéo intégrée à la page d'aide du site
