---
name: nouveau-tuto
description: Tourner une vidéo tuto du site (format ordinateur 1920×1080) avec le compte démo, puis y poser une voix off ElevenLabs calée sur les gestes — scénario Playwright, tournage, planche de contrôle, texte de voix off, assemblage et sous-titres. Usage `/nouveau-tuto <fonctionnalité>` (ex. `/nouveau-tuto mettre une recette en favori`).
---

# Nouveau tuto vidéo : de la fonctionnalité à la vidéo commentée

Usage : `/nouveau-tuto <fonctionnalité à montrer>`, éventuellement suivi de
` — <précisions>` (ex. `/nouveau-tuto liste de courses — depuis une fournée`).

La vidéo est **filmée par un navigateur piloté** (Playwright + Chromium
préinstallés) sur `dev.jepatisse.com`, avec le compte démo ; la voix off est
générée **par l'utilisateur** dans ElevenLabs (Claude n'y a pas accès), puis
posée phrase par phrase sur les gestes. Tout ce qui est produit (vidéos, MP3,
planches) reste **hors du dépôt**, dans le scratchpad de la session ; seuls le
scénario (`scenarios/<slug>.mjs`) et la fiche du tuto
(`docs/tutos/NN-<slug>.md`, gabarit `TEMPLATE_tuto.md`) sont versionnés.

La qualification exigée par `CLAUDE.md` vaut pour l'ensemble de la chaîne :
une seule, au lancement. Les points d'arrêt ci-dessous n'en sont pas.

## Fichiers

| Fichier | Rôle |
|---|---|
| `tourner.mjs` | Lance un scénario : connexion **hors caméra**, préparation du compte, tournage, remise en état, coupe au marqueur, planche de contrôle |
| `assembler.mjs` | Découpe le MP3 ElevenLabs à ses silences et pose chaque phrase à son repère ; sous-titres `.srt` |
| `outils.mjs` | Briques communes (curseur visible, défilement doux, clic filmé, vérification d'écriture, ffmpeg) |
| `scenarios/favoris-carnet.mjs` | Scénario de référence — à copier pour un nouveau tuto |

## Déroulé

1. **Prérequis — vérifier avant d'écrire une ligne.**
   - Variables `DEMO_EMAIL` / `DEMO_PASSWORD` présentes (`echo ${DEMO_EMAIL:+ok}` —
     ne jamais afficher leur valeur).
   - Réseau : `dev.jepatisse.com`, **`auth.jepatisse.com`** (connexion et
     écritures — le navigateur parle directement à Supabase) et
     **`s3.pub1.infomaniak.cloud`** (photos ; sans lui, la vidéo est pleine de
     cadres vides) doivent répondre. `lh3.googleusercontent.com` pour l'avatar.
     Test : `curl -sS -o /dev/null -w "%{http_code}" https://<hôte>/` — `000`
     ou un refus du proxy = hôte bloqué : le dire à l'utilisateur (paramètres
     de l'environnement → *Network access* → *Allowed domains*) et
     **s'arrêter**.

2. **Cadrage — premier point d'arrêt.** Lire le code de la fonctionnalité
   (libellés exacts, `aria-label`, chemins) puis proposer :
   - les **gestes** dans l'ordre, et l'écran de départ (déjà connecté) ;
   - l'**état du compte démo** nécessaire (ex. recette pas encore en favori)
     et comment le préparer **puis le rétablir** hors caméra ;
   - les **limites de la formule** du compte démo qui peuvent bloquer le geste
     (ex. 20 favoris en formule gratuite — vécu : 24/20, refus en base) ;
   - une durée cible (≤ 90 s, gabarit) et le découpage en phrases de voix off.
   Demander l'accord. **S'arrêter.**

3. **Scénario.** Copier `scenarios/favoris-carnet.mjs` en
   `scenarios/<slug>.mjs` et l'adapter. Contrat d'un scénario :
   - `export const depart` — chemin de la première page filmée ;
   - `export async function preparer(prep)` — hors caméra, rend des données
     passées à `tourner` ; mémoriser l'état d'origine de ce qu'on modifie ;
   - `export async function tourner(cam, donnees)` — devant la caméra ;
   - `export async function remettre(prep, donnees)` — hors caméra, rétablit
     l'état d'origine du compte.
   Règles de tournage (toutes apprises à la dure) :
   - **jamais de titre codé en dur** si le contenu peut changer (l'accueil
     change chaque semaine) : prendre « les N premières de telle section »
     (`prep.recettesSection`) ;
   - **jamais de `goto` pour une navigation montrée** : cliquer le lien
     (`cam.lienEntete('Mon carnet')`), sinon le spectateur ne voit pas d'où
     l'on vient ;
   - **défiler, ne jamais sauter** (`cam.defiler`) vers un élément hors écran ;
   - **toute écriture passe par `cam.verifierEcriture`** : le site est
     optimiste, un cœur rempli à l'écran ne prouve rien (cf. quota) ;
   - poser `cam.phrase('…')` **à l'instant où chaque phrase doit commencer**,
     juste avant le geste qu'elle annonce ; laisser assez de temps à l'écran
     pour la phrase précédente (environ 0,3 s par mot) ;
   - `cam.attendrePage()` après chaque navigation : polices et images
     visibles chargées, sinon on filme des cadres vides ou les noms d'icônes
     en texte brut.

4. **Tournage.**
   ```bash
   node .claude/skills/nouveau-tuto/tourner.mjs .claude/skills/nouveau-tuto/scenarios/<slug>.mjs <scratchpad>/tuto-<slug>
   ```
   `--rythme` (défaut `0.4`, validé avec l'utilisateur : « plus rapide, moins
   d'attente ») multiplie toutes les pauses ; `--base` change de site (`dev`
   par défaut, exempté de la page d'attente).
   **Contrôler `planche.png`** (une image par seconde, horodatée) avant de
   livrer : cadres vides, voile du spinner sur l'image finale, geste
   invisible. Ce qui y est faux le sera dans la vidéo.

5. **Voix off — second point d'arrêt.** Livrer `tuto.mp4` (SendUserFile) et
   donner le texte : un tableau temps / écran / voix off, puis le texte brut
   à coller dans ElevenLabs, **une phrase par ligne, sans balise `<break>`**
   (les modèles récents les ignorent ; le calage est fait par
   `assembler.mjs`, pas par les pauses). Règles du gabarit : vouvoiement,
   phrases ≤ 15 mots, impératif, bénéfice avant le geste. Conseils
   ElevenLabs : voix française, *Stability* ~50 %, *Similarity* ~75 %, MP3 à
   télécharger et joindre à la conversation. **S'arrêter** jusqu'au MP3.

6. **Assemblage.** Écrire le texte (une phrase par ligne) dans
   `<sortie>/voix.txt`, puis :
   ```bash
   node .claude/skills/nouveau-tuto/assembler.mjs <sortie> <voix.mp3> --texte <sortie>/voix.txt
   ```
   - Nombre de plages ≠ nombre de phrases → ajuster `--silence` (défaut
     0,7 s) d'après la liste affichée.
   - Un avertissement « décalée » = la phrase précédente déborde : si le
     décalage dépasse ~1 s, allonger la pause correspondante du scénario et
     retourner.
   Livrer `tuto-voix.mp4` et `tuto.srt`, avec le calage affiché. Sous-titres
   incrustés si demandés :
   `ffmpeg -i tuto-voix.mp4 -vf subtitles=tuto.srt -c:a copy tuto-st.mp4`.

7. **Fiche du tuto.** Créer `docs/tutos/NN-<slug>.md` d'après
   `TEMPLATE_tuto.md` (script final, termes à prononcer, statut). Commit (en
   français), push sur la branche de travail, PR en brouillon.

## Pièges connus

- **Connexion jamais filmée** : l'adresse du compte démo est une donnée
  personnelle. `tourner.mjs` se connecte hors caméra et démarre déjà connecté.
- **Début de vidéo** : plusieurs secondes de blanc le temps du chargement.
  `cam.marqueurDebut()` pose un écran noir d'un instant une fois la page
  prête ; la coupe se fait à sa fin (`blackdetect`), et les repères en
  partent — ne jamais couper « à l'œil ».
- **Bandeau cookies et bannière d'installation** masqués par leurs clés de
  stockage local (`scriptBandeaux`, `outils.mjs`) — à suivre si
  `lib/consent.ts` ou `lib/use-install-prompt.ts` changent de clé.
- **Retour à l'accueil** : le site restaure la position de défilement ;
  défiler explicitement vers l'élément visé plutôt que supposer le haut de page.
- **Notifications** : mettre en favori la recette d'un autre membre le
  notifie (`notifier()`). Préférer les recettes du compte de l'utilisateur
  ou prévenir.
