# Outillage Jira pour Claude Code

Comment Jira et l'atelier de développement se parlent : lire une spec ou un
signalement depuis Claude Code, relier une branche à son ticket, et faire
avancer le statut du ticket au rythme réel des déploiements.

À ne pas confondre avec **`docs/contact-jira.md`**, qui décrit le module
*produit* (formulaire de contact → ticket pseudonymisé → webhook → e-mail au
demandeur). Le présent document ne parle que de l'outillage de développement,
et n'ajoute rien au site déployé.

Le chantier est découpé en trois lots. **Seul le lot 1 est en place.**

| Lot | Objet | État |
|---|---|---|
| 1 | Lire Jira depuis Claude Code (`scripts/jira.mjs` + skill `jira`) | ✅ en place |
| 2 | Lien dev ↔ ticket (app GitHub for Jira, clé dans les branches et PR) | à faire |
| 3 | Déploiement production → statut « Déployé » | à faire |

---

## 1. Lot 1 — `scripts/jira.mjs`

Trois verbes, pas un client Jira :

```bash
node scripts/jira.mjs lire MC-123 [--commentaires N]
node scripts/jira.mjs chercher "<JQL>" [--max N]
node scripts/jira.mjs commenter MC-123 "<texte>"   # « - » lit l'entrée standard
```

Variables requises : `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` — les
mêmes que le module contact, déjà déclarées dans `.env.local.example`. Elles
doivent être ajoutées **aux variables d'environnement de l'environnement
Claude Code** pour une session distante : celles de Vercel n'y sont pas
visibles.

La skill `.claude/skills/jira/` (`/jira`) rend ces commandes accessibles au
modèle et fixe le déroulé : lire le ticket, **qualifier** comme l'exige
`CLAUDE.md`, attendre l'OK, développer, commenter seulement si demandé.

### 1.1 Un script REST plutôt que le serveur MCP d'Atlassian

Le serveur MCP officiel (`https://mcp.atlassian.com/v2/mcp`, OAuth 2.1) ferait
le même travail en mieux — recherche JQL, lecture, écriture — et reste une
option ouverte (lot 4 : trente minutes de test). Il n'est pas le point de
départ pour trois raisons : le jeton d'API et le client HTTP existent déjà
ici (`lib/jira.ts`), le plan Jira gratuit du projet rend les quotas du MCP
mal documentés (Atlassian ne publie aucun chiffre, et la frontière avec les
crédits Rovo — sans offre gratuite — reste floue), et un script marche
identiquement en local, en session distante et dans un workflow CI, ce qu'un
serveur OAuth interactif ne garantit pas.

### 1.2 Aucun verbe de transition, aucun passe-plat REST

Faire passer un ticket à « Déployé » déclenche l'e-mail au demandeur, et cet
envoi est **irréversible** une fois parti (`docs/contact-jira.md` §2). Ce
geste appartient à une chaîne de déploiement qui sait qu'un build production
a réussi (lot 3), jamais à un agent en train d'explorer un ticket. Pour la
même raison il n'existe pas de verbe générique `curl`-like : un besoin
nouveau s'ajoute au script, avec son garde-fou, plutôt que de se contourner.

### 1.3 API v3 et `/rest/api/3/search/jql`

Même version et même endpoint que `rechercherStatutsJira` (`lib/jira.ts`),
seuls éprouvés contre l'instance réelle : `/rest/api/3/search` (GET) est
retiré par Atlassian (HTTP 410). L'API v2, qui aurait rendu du texte brut au
lieu d'ADF et évité les deux conversions ci-dessous, n'a pas été retenue pour
ne pas faire dépendre l'outillage d'une version que le reste du dépôt
n'utilise pas.

### 1.4 Deux conversions ADF, dont une dupliquée sciemment

`adfVersTexte` aplatit une description Jira en texte lisible — sans elle,
`lire` afficherait un arbre JSON. `texteVersAdf` fait le chemin inverse pour
un commentaire, l'API v3 refusant une chaîne. Cette seconde fonction existe
déjà en TypeScript dans `lib/jira.ts` ; le script étant du JS pur (aucune
étape de compilation, lançable par `node` seul), il ne peut pas l'importer.
La duplication est donc assumée, et c'est précisément ce qui justifie
`scripts/jira.test.mjs` : sans test des deux côtés, les versions
divergeraient en silence.

### 1.5 `.env.local` en repli, jamais en priorité

Le script ne lit `.env.local` que si les trois variables manquent dans
l'environnement. L'inverse ferait écraser sans bruit les variables d'une
session ou d'un job CI par un fichier local oublié — c'est-à-dire viser la
mauvaise instance Jira sans le voir.

---

## 2. Lot 2 — lien dev ↔ ticket (à faire)

Installer l'app **GitHub for Jira** (gratuite), citer la clé du ticket dans
le nom de branche, le titre de PR et les messages de commit
(`MC-123 — …`), puis une règle **Automation mono-projet** « PR fusionnée →
Terminé ». Le mono-projet compte : sur le plan gratuit, une règle appliquée à
plusieurs projets devient globale et retombe sous le plafond de 100
exécutions mensuelles — le même plafond que le webhook système du module
contact évite déjà (`docs/contact-jira.md` §10).

## 3. Lot 3 — déploiement → « Déployé » (à faire)

Un workflow GitHub Actions déclenché après un déploiement **production**
réussi sur `main` : extraction des clés `MC-\d+` des commits poussés, puis
`POST /rest/api/3/issue/{cle}/transitions`. Le webhook Jira déjà en place
prend alors le relais et envoie l'e-mail au demandeur.

Deux points à traiter à ce moment-là, pas avant :

- **Jamais sur une preview**, ni sur le second projet Vercel `dev_jp` qui
  construit le même dépôt (`CLAUDE.md`, « Déploiement ») : une transition
  déclenchée par un déploiement qui n'est pas en ligne annoncerait au membre
  une correction qu'il ne verra pas.
- **La garde de `decisionSynchroJira`** protège une clôture prononcée à la
  main côté site ; une transition automatique en amont dans Jira passe avant
  cette garde. À re-vérifier sur un ticket de test plutôt qu'à supposer.
