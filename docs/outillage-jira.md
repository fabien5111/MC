# Outillage Jira pour Claude Code

Comment Jira et l'atelier de développement se parlent : lire une spec ou un
signalement depuis Claude Code, relier une branche à son ticket, et faire
avancer le statut du ticket au rythme réel des déploiements.

À ne pas confondre avec **`docs/contact-jira.md`**, qui décrit le module
*produit* (formulaire de contact → ticket pseudonymisé → webhook → e-mail au
demandeur). Le présent document ne parle que de l'outillage de développement,
et n'ajoute rien au site déployé.

Le chantier est découpé en trois lots. **Les trois lots sont en place côté dépôt.** Chacun demande encore une
configuration hors dépôt, listée à la fin de sa section.

| Lot | Objet | État |
|---|---|---|
| 1 | Lire Jira depuis Claude Code, et deux transitions bornées pilotées par l'agent (`scripts/jira.mjs` + skill `jira`) | ✅ en place |
| 2 | Lien dev ↔ ticket (app GitHub for Jira, clé dans les PR et commits) | ✅ en place côté dépôt, reste la configuration Jira/GitHub |
| 3 | Déploiement production → statut « Déployé » | ✅ en place côté dépôt, **désarmé** tant que `JIRA_DEPLOY_ACTIF` n'est pas à `true` |
| 4 | Évaluation du serveur MCP officiel d'Atlassian | ⏳ préparé et documenté ; l'essai demande une session locale (§4) |

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

### 1.6 `demarrer` / `envoyer-en-test` — deux transitions pilotées par l'agent

La session Claude qui développe un ticket a besoin de faire avancer son
statut à deux moments : au tout début (« Spéc rédigée » → « En cours ») et
juste après avoir poussé sa branche (« En cours » → « En cours de test »).
Ni l'un ni l'autre ne relève du lot 3 : ce ne sont pas des transitions
déclenchées par un déploiement, mais par le rythme de travail de l'agent
lui-même — d'où deux nouveaux verbes plutôt qu'un détournement du script de
déploiement.

```bash
node scripts/jira.mjs demarrer MC-123
node scripts/jira.mjs envoyer-en-test MC-123
```

**Chacun ne connaît qu'un seul statut cible**, configurable comme les
statuts du lot 3 (id d'abord, nom en repli) :

| Variable | Rôle | Défaut |
|---|---|---|
| `JIRA_STATUS_IN_PROGRESS` / `_ID` | Statut visé par `demarrer` | `En cours` |
| `JIRA_STATUS_IN_TEST` / `_ID` | Statut visé par `envoyer-en-test` | `En cours de test` |

**Le garde-fou du §1.2 ne recule pas d'un pas avec ces deux verbes.** Avant
tout envoi à Jira, `resoudreTransition` (`scripts/jira.mjs`, testée) vérifie
que la transition résolue ne mène **pas** au statut configuré comme
« Déployé » (`JIRA_STATUS_DEPLOYED` / `_ID`, mêmes variables que le lot 3) —
et refuse sinon, quelle que soit la raison qui aurait pu produire cette
correspondance (erreur de configuration, workflow Jira atypique où les deux
statuts se confondraient). Faire passer un ticket à « Déployé » reste
exclusivement le rôle du lot 3 : c'est cette transition-là, et elle seule,
qui déclenche l'e-mail irréversible au demandeur (`docs/contact-jira.md`
§2). La logique de résolution de transition (`memeStatut` /
`trouverTransitionVers`) est partagée avec `jira-deploiement.mjs`
(`scripts/jira-api.mjs`), pour ne pas la maintenir en double au moment
précis où il ne faut pas se tromper.

**Config restante hors dépôt** : ajouter `JIRA_STATUS_IN_PROGRESS` et
`JIRA_STATUS_IN_TEST` (et, si on veut la robustesse au renommage, leurs
variantes `_ID`) aux variables d'environnement de l'environnement Claude
Code — mêmes emplacements que les autres variables `JIRA_*` du lot 1.
Aucune config Jira supplémentaire : ces deux statuts existent déjà dans le
workflow observé (`À faire` → `Spéc rédigée` → `En cours` → `En cours de
test` → `À déployer` → `Déployé`).

**Non vérifié en session distante** : les transitions Jira interdisant tout
raccourci (il faut une transition sortante réelle du statut courant vers la
cible), un test en conditions réelles suppose un ticket effectivement au bon
statut de départ — à faire depuis une session qui a un accès Jira
fonctionnel (cf. §1.5 et le garde réseau des sessions distantes).

---

## 2. Lot 2 — lien dev ↔ ticket

Objectif : qu'un ticket Jira montre, dans son panneau « Développement », les
branches, commits et PR qui le traitent — sans rien saisir à la main, et sans
qu'un ticket parte en production sans qu'on sache par quel code.

Le repérage se fait sur **la clé du ticket dans le texte** : c'est tout le
mécanisme, et c'est aussi sa fragilité — une PR qui oublie la clé est
invisible du ticket, et le restera pour le lot 3.

### 2.1 Convention

Citer `MC-123` dans **le titre de la PR** et dans **les messages de commit**.
Le nom de branche compte aussi quand il est libre — mais les branches créées
par Claude Code sont imposées (`claude/…`), d'où le titre de PR comme porteur
principal.

**En majuscules, impérativement** : Jira ne reconnaît pas `mc-123`. C'est le
piège numéro un, et il est silencieux — rien ne signale l'absence de lien.

### 2.2 Contrôle automatique (`.github/workflows/jira-cle.yml`)

Une PR sans clé fait échouer un contrôle GitHub Actions, qui cherche dans le
titre, le nom de branche et tous les messages de commit de la PR. Trois
choses à savoir :

- **Le contrôle ne s'active que si la variable de dépôt `JIRA_PROJECT_KEY`
  existe** (Settings → Secrets and variables → Actions → *Variables*, pas
  *Secrets* : une clé de projet n'est pas un secret, et un secret ne se lit
  pas dans une condition). Sans elle, aucun moyen de distinguer une clé d'un
  `UTF-8` : le contrôle passe en annonçant qu'il est désactivé, plutôt que de
  deviner.
- **Échappatoire explicite** : le label `sans-jira` sur la PR désactive le
  contrôle, pour l'outillage et la documentation qui n'ont pas de ticket.
  Sans cette porte, la seule issue serait de désactiver le workflow — donc de
  le perdre pour toutes les autres PR.
- **Il se corrige sans réécrire l'historique** : le titre de la PR suffit, et
  le contrôle est rejoué à chaque modification du titre (`edited`) comme du
  label.

### 2.3 Un seul extracteur de clés (`scripts/jira-cles.mjs`)

`extraireCles(texte, prefixe)` est la seule expression régulière du dépôt qui
reconnaisse une clé Jira. Le contrôle de PR s'en sert aujourd'hui, la
transition « Déployé » du lot 3 s'en servira demain sur les commits d'un
déploiement. Deux motifs écrits séparément auraient fini par diverger, et la
divergence se serait vue au pire endroit : un ticket non transitionné, donc
un membre jamais prévenu que sa correction est en ligne.

Le préfixe de projet est **obligatoire** : un motif générique
(`[A-Z]+-\d+`) attrape `UTF-8`, `SHA-256` ou `RFC-2119`. Et la
reconnaissance est **sensible à la casse**, pour la raison de §2.1 — un
contrôle vert sur une PR que Jira ignore serait pire que pas de contrôle.

### 2.4 Ce qui reste à faire côté Jira et GitHub (hors dépôt)

1. Installer l'app **GitHub for Jira** (gratuite, Marketplace Atlassian) et
   l'autoriser sur le dépôt `fabien5111/MC`.
2. Définir la variable de dépôt `JIRA_PROJECT_KEY` (§2.2) pour activer le
   contrôle.
3. Créer la règle **Automation mono-projet** « PR fusionnée → Terminé ». Le
   mono-projet compte : sur le plan gratuit, une règle appliquée à plusieurs
   projets devient globale et retombe sous le plafond de 100 exécutions
   mensuelles — le même plafond que le webhook *système* du module contact
   évite déjà (`docs/contact-jira.md` §10).
4. Vérifier sur une vraie PR que le panneau « Développement » du ticket se
   remplit. Rien dans ce dépôt ne peut le prouver à la place.

## 3. Lot 3 — déploiement → « Déployé »

Quand un déploiement **production** réussit, les tickets cités dans les
derniers commits déployés passent de « Terminé » (développé, pas encore en
ligne) à « Déployé ». Le webhook Jira déjà en place voit la transition, et le
site prévient le demandeur que sa correction est en ligne.

C'est le seul lot qui écrit dans Jira, et il déclenche un **e-mail
irréversible** (`docs/contact-jira.md` §2) : une fois parti, aucun retour en
arrière. Toute sa conception découle de là.

| Fichier | Rôle |
|---|---|
| `.github/workflows/jira-deploiement.yml` | Déclenchement, garde-fous, plage de commits |
| `scripts/jira-deploiement.mjs` | Décision et transition, ticket par ticket |
| `scripts/jira-api.mjs` | Client HTTP Jira partagé avec `jira.mjs` |

### 3.1 Trois garde-fous, dans cet ordre

1. **Simulation par défaut.** Sans la variable de dépôt `JIRA_DEPLOY_ACTIF`
   à `true`, le workflow tourne mais n'écrit rien : il journalise ce qu'il
   aurait fait. C'est l'interrupteur d'armement, à basculer une fois le
   comportement observé sur de vraies exécutions — pas avant. Un
   `workflow_dispatch` permet en plus de forcer la simulation à la demande.
2. **Production seulement.** Les déploiements de preview sont ignorés
   (`deployment_status` filtré sur l'environnement). Le second projet Vercel
   `dev_jp` construit le même dépôt et produit lui aussi un déploiement
   « Production » : il déclenche donc le workflow une seconde fois, sans
   effet — voir le garde-fou suivant. Un `concurrency` les met à la queue leu
   leu plutôt que de compter sur la chance.
3. **Périmètre et idempotence.** Seul un ticket au statut « développé, pas
   encore en ligne » est transitionné. Déjà déployé, en cours, rouvert,
   statut inconnu : laissé tel quel. C'est ce qui rend le rejeu inoffensif —
   et c'est testé (`scripts/jira-deploiement.test.mjs`).

### 3.2 Les N derniers commits, pas l'intervalle exact

Le workflow ne cherche pas à reconstituer l'intervalle depuis le déploiement
précédent (API Deployments, déploiement précédent réussi, comparaison de
SHA…). Il lit les **50 derniers commits de la révision déployée**, qui sont
par construction tous en production. La générosité est sans conséquence grâce
à l'idempotence du §3.1, et elle rattrape gratuitement un déploiement dont le
workflow aurait échoué — là où un intervalle exact aurait laissé ces tickets
en arrière pour toujours.

### 3.3 Le statut visé est reconnu par id, le nom en repli

Mêmes variables et même priorité que `lireConfigStatuts` (`lib/jira.ts`) :
`JIRA_STATUS_TO_DEPLOY[_ID]` et `JIRA_STATUS_DEPLOYED[_ID]`. L'id survit à un
renommage dans Jira, le nom non. Et comme Jira n'a pas d'API « mettre ce
statut », le script cherche parmi les **transitions sortantes** celle qui mène
au statut visé : si le workflow Jira n'en propose aucune, le ticket est
signalé en échec plutôt que déplacé au hasard.

### 3.4 Un échec n'arrête pas les autres, mais l'exécution est rouge

Les tickets d'un même déploiement sont indépendants : en abandonner cinq
parce que le premier a un workflow atypique serait pire que le problème. Le
script traite donc tout le monde, puis sort en erreur s'il reste un échec —
une réussite apparente ayant oublié la moitié des tickets serait le pire des
deux mondes.

### 3.5 Ce qui reste à faire hors dépôt

1. **Secrets de dépôt** (Settings → Secrets and variables → Actions →
   *Secrets*) : `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`.
2. **Variables** (même écran, onglet *Variables*) : `JIRA_STATUS_TO_DEPLOY` /
   `_ID`, `JIRA_STATUS_DEPLOYED` / `_ID` — et `JIRA_PROJECT_KEY`, déjà posée
   au lot 2.
3. **Observer en simulation.** Le workflow tourne dès la fusion sur `main` ;
   lire son journal après quelques déploiements et vérifier que les tickets
   listés sont bien ceux qu'on aurait transitionnés à la main.
4. **Armer** : `JIRA_DEPLOY_ACTIF = true`.
5. **Deux vérifications sur un ticket de test**, avant d'armer pour de bon :
   - `deploy_notify` — l'interrupteur par demande qui empêche l'e-mail de
     déploiement doit être coupé **avant** le passage en « déployé », jamais
     après (`docs/contact-jira.md`) ;
   - la garde de `decisionSynchroJira` protège une clôture prononcée à la
     main côté site ; une transition automatique en amont dans Jira passe
     avant cette garde. À vérifier sur un ticket de test plutôt qu'à
     supposer — c'est le seul point de ce chantier qu'aucun test du dépôt ne
     peut trancher.

### 3.6 Ce que ce lot ne fait pas

- **Aucun verbe de transition dans `scripts/jira.mjs`** : le lot 1 reste en
  lecture (et commentaire). Faire passer un ticket en « Déployé » demande de
  savoir qu'un build production a réussi — c'est le travail du workflow, pas
  d'un agent qui explore un ticket.
- **Rien n'est modifié dans le site déployé** : `lib/jira.ts`, le webhook et
  la réconciliation quotidienne sont inchangés. Ce chantier n'ajoute que de
  l'outillage.

---

## 4. Lot 4 — le serveur MCP d'Atlassian

Le lot 1 lit Jira par un script REST. Atlassian publie par ailleurs un
serveur **MCP** officiel, qui donne au modèle des outils Jira natifs
(recherche JQL, lecture, création, transition, commentaire) sans passer par
un script. S'il fonctionne sur ce compte, il remplace avantageusement la
lecture du lot 1 — le script gardant l'écriture et la CI, où un serveur OAuth
interactif n'a pas sa place.

Ce lot est **préparé, pas conclu** : l'étape décisive est une authentification
OAuth dans un navigateur, qui ne peut se faire que depuis un poste, pas depuis
une session distante. Voir §4.3 pour ce que ça change.

### 4.1 Ce qui est établi

| Point | État au 3 septembre 2026 |
|---|---|
| Endpoint recommandé | `https://mcp.atlassian.com/v2/mcp` (l'endpoint `/sse` s'arrête le 30 juin 2026) |
| Authentification | OAuth 2.1 (navigateur, sans activation admin) **ou** jeton d'API en Basic — cette seconde voie demande une activation par l'administrateur du site |
| Portée | Atlassian **Cloud** uniquement (ni Server ni Data Center) |
| Coût | Serveur annoncé gratuit pour les clients Cloud ; Atlassian ne publie **aucun** chiffre de quota, et l'articulation avec les crédits Rovo (sans offre gratuite) reste floue dans la documentation publique |
| Suppression / administration | Les permissions Jira « delete » et « manage » sont désactivées par défaut |

C'est ce dernier point du tableau — le coût réel sur un plan gratuit — que
seul l'essai peut trancher. D'où ce lot.

### 4.2 Procédure d'essai (depuis un poste, ~30 min)

```bash
claude mcp add --transport http --scope local atlassian https://mcp.atlassian.com/v2/mcp
# puis, dans une session : /mcp  → s'authentifier
```

`--scope local` est délibéré : la configuration reste sur le poste plutôt que
d'être commise dans `.mcp.json`, pour la raison du §4.3.

Trois choses à vérifier, dans cet ordre :

1. **L'OAuth aboutit** et `/mcp` affiche le serveur connecté.
2. **Une recherche JQL répond** sans réclamer de crédits Rovo ni buter sur un
   quota — c'est la question qui a motivé le lot.
3. **Les tickets du projet sont visibles** avec le compte utilisé (le serveur
   MCP hérite des droits de ce compte, pas de ceux du jeton d'API du site).

### 4.3 Pourquoi rien n'est commis dans `.mcp.json`

Un `.mcp.json` versionné s'appliquerait à **toutes** les sessions du dépôt, y
compris les sessions distantes (Claude Code sur le web). Or `mcp.atlassian.com`
y est **bloqué par la politique réseau de l'environnement** — vérifié depuis
cette session : le mandataire refuse la connexion (`403` sur le `CONNECT`).
Commettre la configuration ajouterait donc, à chaque session distante, un
serveur qui ne peut pas se connecter.

Deux conséquences pratiques :

- l'essai du §4.2 se fait **depuis un poste** ;
- pour s'en servir aussi depuis une session distante, il faudrait élargir la
  politique réseau de l'environnement Claude Code (cf. la documentation de
  Claude Code sur le web) — à ne faire que si l'essai est concluant.

Le script du lot 1, lui, fonctionne dans les deux cas : il ne parle qu'à
`JIRA_BASE_URL`, le domaine Atlassian du site, déjà joignable.

### 4.4 Que faire du résultat

| Résultat de l'essai | Suite |
|---|---|
| L'OAuth passe et JQL répond sans coût | Utiliser le MCP pour **lire** ; `scripts/jira.mjs` garde l'écriture et reste le chemin de la CI (lots 2 et 3), qui ne peut pas s'authentifier en OAuth |
| Ça réclame Rovo ou bute sur un quota | Rester sur le script ; noter la date et le message ici — Atlassian fait évoluer ces limites |
| L'accès est refusé par une règle d'organisation | Rester sur le script ; l'activation par jeton d'API (§4.1) est l'autre voie, mais elle demande une action de l'administrateur du site |

La skill `jira` est déjà écrite pour les deux mondes : elle privilégie les
outils MCP `atlassian` **quand la session en dispose**, et retombe sur le
script sinon. Aucune bascule à faire le jour où l'essai est concluant.
