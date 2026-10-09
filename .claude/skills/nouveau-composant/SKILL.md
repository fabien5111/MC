---
name: nouveau-composant
description: Chaîne complète pour un composant de pâtisserie — rédaction de la fiche (fiche-composant, revue du chef), validation par l'utilisateur, choix du membre, import en brouillon (import-recette) et lien de relecture sur le site. Usage `/nouveau-composant <nom>` (éventuellement `— <précisions>`).
---

# Nouveau composant : de son nom au brouillon à relire

Usage : `/nouveau-composant <nom du composant>`, éventuellement suivi de
` — <précisions>` (ex. `/nouveau-composant Biscuit génoise — version cacao`).

Cette compétence ne fait qu'**enchaîner** deux briques, sans en dupliquer le
contenu :

- `fiche-composant` (`.claude/skills/fiche-composant/`) — rédaction,
  contrôle mécanique, revue du chef dans un agent séparé ;
- `import-recette` (`.claude/skills/import-recette/`) — fichier, tests,
  simulation, import, lien de relecture.

La qualification exigée par `CLAUDE.md` vaut pour l'**ensemble** de la
chaîne : une seule, au lancement, puis l'OK de l'utilisateur. Les deux points
d'arrêt ci-dessous (validation de la fiche, choix du membre) ne sont pas des
qualifications à refaire.

## Déroulé

1. **Prérequis.** Aucun nom donné → le demander en une phrase et
   s'arrêter.

2. **Fiche.** Invoquer la compétence du dépôt `fiche-composant` (nom sans
   préfixe — **jamais** une `…:fiche-composant` venue du compte de
   l'utilisateur, ancienne version sans perte de réalisation) avec les mêmes
   arguments (nom et précisions), et la dérouler entièrement, revue du chef
   comprise. Elle écrit son brouillon et son JSON final (`<slug>.json`) hors
   du dépôt, dans le répertoire temporaire de la session : noter le chemin du
   JSON final. Sa livraison n'est **pas** la fin du tour : enchaîner
   aussitôt sur l'étape 3.

3. **Validation — premier point d'arrêt.** Présenter :
   - la revue du chef telle quelle (déjà livrée par `fiche-composant`) ;
   - un résumé lisible : titre, format de référence, masse utilisable,
     somme des ingrédients et perte (`rendement`), étapes avec leurs
     ingrédients en grammes et leurs conseils de réussite, utilisations
     (« Utilisation — ») et variantes (« Variante — ») ;
   - **en tête et en évidence**, chaque « À VÉRIFIER PAR UN HUMAIN » de la
     revue ;
   - la clé locale proposée : `local-` + slug du titre (minuscules, sans
     accents, tirets ; une lettre juste après `local-`). Si
     `imports-jira/<clé>.json` existe déjà, proposer `<clé>-v2`, `-v3`…
   Puis demander : « Je valide cette fiche ? (ou dis-moi ce qu'il faut
   corriger) ». **S'arrêter.**
   - Correction demandée → relancer `fiche-composant` en ajoutant la
     correction aux précisions (« — <précisions> ; <correction> »), puis
     revenir à ce point d'arrêt.
   - Clé différente demandée → la prendre, si elle a la forme d'une clé
     locale ou d'un ticket Jira (cf. `import-recette`).

4. **Membre — second point d'arrêt.** Une fois la fiche validée, demander
   sur quel membre importer : « Sur quel compte ? (pseudo de préférence, tel
   qu'il apparaît dans l'adresse /u/…) ». **S'arrêter.**

5. **Import.** Dérouler `import-recette` à partir de son étape 2 (contrôle),
   avec le JSON final, la clé et le destinataire — sans requalifier. Le
   fichier d'import est `imports-jira/<clé>.json`. Ne committer **que** le
   fichier d'import.
   Après la simulation, l'étape 8 d'`import-recette` s'applique telle
   quelle : import **aussitôt** si le destinataire est un pseudo et la
   simulation sans `❌` (arbitrage de l'utilisateur, à ne pas remettre en
   cause), confirmation d'abord s'il s'agit d'un e-mail. Les attentes du
   workflow suivent aussi `import-recette` (un réveil `send_later` par
   lancement).

6. **Lien.** Livrer `https://dev.jepatisse.com/relecture/<id>` et le rappel
   de relecture d'`import-recette` (rendement déjà réglé en poids
   utilisable, à vérifier ; catégorie, tags, difficulté ; photo principale — toujours à
   ajouter pour une clé locale).
   Une phrase de bilan, pas de récapitulatif de la démarche.
