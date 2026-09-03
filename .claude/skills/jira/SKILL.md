---
name: jira
description: Lire une spec ou un signalement depuis Jira, chercher des tickets en JQL, commenter un ticket — via scripts/jira.mjs. À utiliser dès qu'une clé de ticket (MC-123) ou « le ticket Jira » apparaît dans la demande, et avant de développer une spec qui vit dans Jira.
---

# Travailler depuis un ticket Jira

Les specs et les signalements de bug vivent dans Jira (le module contact du
site y crée un ticket pseudonymisé pour chaque bug remonté — cf.
`docs/contact-jira.md`). `scripts/jira.mjs` sert à les lire depuis ici.

## Commandes

```bash
node scripts/jira.mjs lire MC-123                     # ticket + description + 10 derniers commentaires
node scripts/jira.mjs lire MC-123 --commentaires 0    # sans les commentaires
node scripts/jira.mjs chercher "project = MC AND statusCategory != Done ORDER BY updated DESC"
node scripts/jira.mjs chercher "assignee = currentUser() AND sprint IN openSprints()" --max 50
node scripts/jira.mjs commenter MC-123 "Corrigé sur la branche claude/… — PR #42."
```

Variables requises dans l'environnement de la session : `JIRA_BASE_URL`,
`JIRA_EMAIL`, `JIRA_API_TOKEN`. En local, `.env.local` sert de repli. Si
elles manquent, le script le dit en nommant chacune — ne pas contourner en
appelant l'API à la main.

## Déroulé attendu

1. **Lire le ticket** (`lire`) avant toute chose : la description Jira est la
   spec, les commentaires portent souvent l'arbitrage qui l'a amendée.
2. **Qualifier** la demande comme l'exige `CLAUDE.md` (type, complexité,
   risque, volume de contexte, modèle recommandé) à partir de ce que dit le
   ticket, **puis attendre l'OK** — un ticket Jira n'est pas une autorisation
   de développer, c'est une demande à qualifier comme une autre.
3. **Développer** sur la branche désignée, en citant la clé du ticket **en
   majuscules** dans le titre de la PR et dans les messages de commit
   (`MC-123 — …`). C'est ce qui remplit le panneau « Développement » du
   ticket, et un contrôle GitHub Actions (`.github/workflows/jira-cle.yml`)
   fait échouer une PR qui n'en cite aucune. Jira ne reconnaît pas `mc-123` :
   la casse n'est pas un détail de style. Une PR qui n'a réellement pas de
   ticket (outillage, documentation) se règle par le label `sans-jira`, jamais
   en inventant une clé.
4. **Commenter** le ticket seulement si l'utilisateur le demande.

## Limites, volontaires

- **Aucun verbe de transition.** Faire passer un ticket à « Déployé »
  déclenche l'e-mail au demandeur, irréversible une fois parti
  (`docs/contact-jira.md` §2). C'est le travail du workflow
  `.github/workflows/jira-deploiement.yml`, qui sait qu'un build production a
  réussi — pas celui d'un agent qui explore un ticket. Si un changement de
  statut est nécessaire, le demander à l'utilisateur.
- **Aucun passe-plat REST générique** : trois verbes, pas un client Jira
  complet. Un besoin nouveau s'ajoute au script, il ne se contourne pas avec
  `curl`.
- **Un commentaire est public** sur le ticket, et les tickets issus du
  formulaire de contact sont **pseudonymisés par construction** : ne jamais y
  recopier une donnée personnelle du demandeur (e-mail, nom, IP, user-agent
  brut, photo jointe) lue dans Supabase ou dans le back-office.
