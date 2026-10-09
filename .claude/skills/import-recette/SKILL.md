---
name: import-recette
description: Importer une recette déjà structurée (fichier JSON au format de l'import IA, par exemple la sortie de la compétence fiche-composant) en BROUILLON sur le compte d'un membre donné, via le workflow « Import de recettes depuis Jira ». À utiliser dès que l'utilisateur fournit un JSON de recette et un compte (pseudo ou e-mail) sur lequel la créer.
---

# Importer une recette JSON sur le compte d'un membre

Rien n'est inventé ici : la compétence pilote le chemin d'import en lot qui
existe déjà (`lib/import-jira.ts`, `scripts/import-jira-recettes.ts`,
`.github/workflows/import-jira-recettes.yml`). Le résultat est un
**brouillon** privé (`imports`, `statut = 'brouillon'`) que le membre relit
dans `/relecture/[id]` — aucune recette n'est créée ni publiée sans cette
relecture.

## Ce qu'il faut obtenir de l'utilisateur

1. **Le compte destinataire** — de préférence le **pseudo** (slug de
   `/u/…`, ex. `fabien-chenu`). Un e-mail est accepté, mais il reste visible
   dans les paramètres de l'exécution sur GitHub, et il impose une
   confirmation de plus avant l'import (étape 8) : proposer le pseudo.
   **Ne jamais écrire le destinataire dans le dépôt** (fichier, commit, PR) :
   il ne voyage que comme paramètre du workflow.
2. **Le JSON de la recette** — au format `RecetteIA` (`PROMPT` de
   `lib/ai/import-pivot.ts`). Il peut arriver nu, ou au milieu de la sortie
   de `fiche-composant` (« REVUE DU CHEF » en texte, puis un bloc ```json) :
   ne garder que l'objet JSON.
3. **La clé** — l'une ou l'autre :
   - un **ticket Jira** existant (`JEP-123`) : la photo jointe au ticket
     devient la photo principale, le ticket est commenté puis passé à
     « Revue en cours » ;
   - une **clé locale** `local-<nom>` (minuscules, chiffres, tirets, une
     lettre juste après `local-` — ex. `local-genoise-nature`) quand il n'y a
     pas de ticket : aucun appel à Jira, brouillon **sans photo**.
   Sans indication, proposer une clé locale dérivée du titre et la faire
   confirmer.

Il manque l'un des trois → le demander, ne rien deviner.

## Déroulé

1. **Qualifier** la demande comme l'exige `CLAUDE.md`, puis attendre l'OK —
   sauf appel depuis `nouveau-composant`, dont la qualification couvre déjà
   toute la chaîne (on démarre alors à l'étape 2).
2. **Contrôler le JSON** avant de l'écrire, et lister à l'utilisateur ce qui
   ne va pas :
   - JSON valide, clés du format seulement (une clé inconnue est ignorée à
     l'import : c'est une information perdue, à signaler) ;
   - `titre` présent, au moins une étape, chaque étape avec ingrédients et
     instructions ;
   - unités : pour une fiche de composant, `"g"` partout (sinon le signaler) ;
     une unité absente du référentiel `units` sortira en alerte à relire ;
   - noms d'ingrédients « nus » (ni état ni quantité dans `nom`) ;
   - somme des ingrédients cohérente avec la masse annoncée dans `rendement` ;
     pour une fiche de composant, passer
     `python3 .claude/skills/fiche-composant/controle.py <json>` (masse
     utilisable, perte, conseils rangés dans les étapes) ;
   - tout « À VÉRIFIER PAR UN HUMAIN » laissé par la revue du chef est
     **remonté tel quel** à l'utilisateur ;
   - aucune adresse e-mail nulle part dans le fichier (le test de corpus le
     refuserait).
3. **Écrire** `imports-jira/<clé>.json` sous la forme :
   ```json
   { "ticket": "<clé>", "recette": { …objet RecetteIA… } }
   ```
   `ticket` porte la clé, Jira ou locale ; le nom du fichier doit être
   exactement la clé canonique (Jira en majuscules, locale en minuscules).
   Une clé dont le fichier existe déjà → s'arrêter et demander.
4. **Valider localement** : `npx vitest run lib/import-jira.test.ts` (le test
   « corpus imports-jira/ » rejoue la préparation du brouillon sur chaque
   fichier). Échec → corriger avant d'aller plus loin.
5. **Commit et push** sur la branche de travail de la session, message en
   français : `Import recette — <titre> (<clé>)`. Le workflow lit les fichiers
   sur la branche choisie au lancement : ils n'ont pas besoin d'être sur
   `main`.
6. **Simulation** — lancer le workflow avec l'outil GitHub
   `actions_run_trigger` :
   - `method: run_workflow`, `workflow_id: import-jira-recettes.yml`,
     `ref: <branche de travail>` ;
   - `inputs: { tickets: "<clé>", destinataire: "<pseudo ou e-mail>", mode: "simulation" }`.
   Retrouver l'exécution (`actions_list`, `list_workflow_runs` sur
   `import-jira-recettes.yml`, filtrée sur la branche) puis son job
   (`list_workflow_jobs`) et son journal (`get_job_logs`, `return_content`).
   Le job dure une à deux minutes. S'il tourne encore : programmer **un seul**
   réveil avec `send_later` (`delay_minutes: 2`, message « Relire l'exécution
   <run_id> du workflow d'import (<clé>, <mode>) et poursuivre
   import-recette »), le dire à l'utilisateur en une phrase, et finir le tour.
   C'est le cas « CI en cours » de la règle 5 de `CLAUDE.md` : un réveil par
   lancement, jamais en boucle — encore en cours au réveil, en reprogrammer
   **un** dernier ; au-delà, le signaler à l'utilisateur et s'arrêter. Jamais
   de `sleep`, jamais de relecture en rafale. `send_later` indisponible → le
   dire et relire au prochain message de l'utilisateur.
7. **Rendre compte de la simulation** : la ligne `Destinataire : <pseudo>`
   (c'est le contrôle que le bon compte est visé), la ligne `🔎 <clé> — …`
   (étapes, photo, alertes), le bilan. `❌` → expliquer et corriger, ne pas
   passer à l'import.
8. **Passer à l'import** — relancer à l'identique avec `mode: "importer"` :
   - destinataire donné **par pseudo** et simulation sans `❌` → aussitôt,
     sans nouvelle question (arbitrage de l'utilisateur : le pseudo trouvé
     est forcément celui qu'il a saisi, le confirmer n'apporterait rien) ;
   - destinataire donné **par e-mail** → seulement après l'OK explicite de
     l'utilisateur, une fois qu'il a vu le pseudo trouvé.
   Même attente qu'à l'étape 6 pour lire le résultat.
9. **Rendre compte de l'import** : numéro du brouillon (`✅ <clé> — brouillon
   n° <id> — …`) et lien de relecture
   `https://dev.jepatisse.com/relecture/<id>` (`www` affiche encore la page
   d'attente). Rappeler ce qui reste à faire **en relecture**, que le format
   d'import ne porte pas :
   - rendement : pour une **fiche de composant** (entrées « Utilisation — »),
     il arrive déjà réglé — « Par nombre d'unités / poids », masse
     utilisable (nette de la perte) en `g`, format, perte et utilisations dans
     « Complément d'informations sur les quantités » (`rendementComposant`, `lib/import-jira.ts`) : seulement à
     vérifier. Pour une autre recette, il arrive en description libre :
     choisir le mode (moule de référence, forme + dimensions, pour pouvoir
     ajuster par moule) ;
   - catégorie, tags, difficulté ;
   - photo principale (toujours, pour une clé locale).

## À savoir

- **Relancer est sans risque** : une clé déjà importée (marque `Jira <CLÉ>`
  ou `Import local-<nom>` dans `imports.fichier_original`) est sautée, quel
  que soit le membre. Corollaire : pour réimporter une recette corrigée, il
  faut une **nouvelle clé** (ex. `local-genoise-nature-v2`), ou que le
  brouillon précédent ait été supprimé.
- Plusieurs recettes pour le même membre : un seul lancement, clés séparées
  par des virgules — ticket Jira et clés locales mélangés librement.
- Une PR n'est pas nécessaire pour importer. Si une PR est ouverte sur la
  branche, elle n'a pas de ticket à citer : lui poser le label `sans-jira`
  (contrôle `jira-cle.yml`).
