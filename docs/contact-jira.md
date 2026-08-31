# Formulaire de contact et suivi Jira

Ce document fige les décisions de conception du module « contact ». Il est le
compagnon de la spécification fonctionnelle (v4) et **prime sur elle** partout
où les deux divergent : la spécification a été écrite sans connaissance du
code en place, plusieurs de ses prescriptions faisaient double emploi avec des
briques déjà éprouvées en production.

---

## 1. Ce que fait le module

Un visiteur ou un membre écrit depuis `/contact`. La demande est enregistrée,
l'administrateur est prévenu par e-mail, et si c'est un **bug** un ticket Jira
**pseudonymisé** est créé. L'avancement du ticket redescend ensuite sur la
demande (webhook Jira), et le membre reçoit un e-mail quand la correction est
**réellement en ligne**.

**Supabase est la source de vérité. Jira ne reçoit qu'un ticket
pseudonymisé.** Un échec Jira ou un échec d'e-mail ne fait jamais perdre une
demande : l'enregistrement en base est validé avant tout appel externe, et
chaque échec est journalisé dans sa propre colonne plutôt que remonté au
visiteur. Même doctrine best-effort que `lib/ai/pseudo-moderation.ts` et
`/api/idees/verifier-doublon`.

La synchronisation est **unidirectionnelle** : modifier le statut d'une
demande dans le back-office ne touche jamais au ticket Jira.

---

## 2. Décisions qui s'écartent de la spécification

Chacune est un arbitrage rendu après lecture du code existant. Les changer
demande de rouvrir le raisonnement, pas seulement le code.

### 2.1 Les e-mails passent par AWS SES, pas par un fournisseur HTTP

La spécification (§10.0) proscrivait SMTP au motif que « les ports sortants
sont peu fiables depuis les fonctions serverless », et prescrivait Resend,
Postmark ou Brevo via `EMAIL_API_KEY`.

Ce motif est **contredit par la production** : `lib/email.ts` envoie déjà par
SMTP AWS SES depuis Vercel, pour l'outil de test du back-office comme pour le
cron d'expiration d'abonnement. Introduire un second fournisseur, ce serait
deux réputations d'expédition, deux jeux de DNS (SPF/DKIM/DMARC) et deux
implémentations — exactement la désynchronisation que l'en-tête de
`lib/email.ts` documente avoir voulu éviter en fusionnant `lib/mail.ts`.

→ `EMAIL_API_KEY` et `EMAIL_FROM` n'existent pas. Tout passe par
`sendEmail` / `sendEmailBestEffort` et l'expéditeur `SES_SENDER_EMAIL`.

**Conséquence à connaître.** Tant que le compte SES est en bac à sable, seules
les adresses vérifiées reçoivent. `sendEmailBestEffort` avale l'échec par
conception : l'erreur atterrit dans `deploy_email_error` / `admin_notify_error`
et remonte au bandeau d'anomalies du back-office, jamais à l'écran du membre.
Rien à changer dans le code le jour où l'accès production est accordé.

### 2.2 L'e-mail de déploiement part immédiatement

La spécification (§10.3) programmait l'envoi à +15 minutes, traité par une
tâche planifiée toutes les 15 minutes, avec un bouton « Annuler l'envoi »
pendant la fenêtre.

Un cron au quart d'heure exige le plan Vercel Pro (le plan gratuit déclenche
au plus deux tâches, une fois par jour). Plutôt que de faire dépendre le
module d'un plan d'hébergement ou d'ajouter `pg_cron` + `pg_net` pour ce seul
besoin, l'envoi se fait **dans la foulée** du passage au statut Jira déployé.

Ce qui disparaît : `deploy_email_due_at`, `DEPLOY_EMAIL_DELAY_MINUTES`,
l'index partiel associé, les valeurs `scheduled` et `cancelled` de l'enum
`email_status`, et le bouton d'annulation.

Ce qui prend le relais : **`deploy_notify`** (booléen par demande) devient le
seul moyen d'empêcher l'e-mail — préventif, plus curatif. On le coupe *avant*
que le ticket ne parte en déploiement. C'est un vrai renoncement : une
transition Jira faite par erreur n'est plus rattrapable.

Une seule tâche planifiée subsiste, **quotidienne** : réconciliation Jira
(§5.3) et purge RGPD (§6).

### 2.3 Le mappage des statuts Jira porte d'abord sur l'`id`

La spécification (§3) admettait que renommer un statut dans Jira casse la
synchronisation, puisque `Terminé` et `Déployé` partagent la même catégorie
(`done`) et que seul leur **nom** les distingue.

C'est évitable : l'`id` d'un statut Jira ne change pas au renommage. Le
mappage teste donc `JIRA_STATUS_DEPLOYED_ID` / `JIRA_STATUS_TO_DEPLOY_ID` en
priorité, et retombe sur le nom si l'id n'est pas configuré. Deux variables
d'environnement et trois lignes de code font disparaître le principal point de
casse du dispositif.

Le repli de sécurité du §9.1 reste en place et ne sert plus qu'aux vrais
statuts inconnus : un statut de catégorie `done` que rien ne reconnaît met la
demande en `a_deployer`, journalise un avertissement et **n'envoie jamais
d'e-mail**. Une demande bloquée et visible vaut infiniment mieux qu'un
« c'est corrigé » envoyé à tort.

### 2.4 L'idempotence du webhook porte sur le statut **Jira**, pas sur celui de la demande

La spécification (§9.2.5) proposait « ne rien faire si le statut cible est
déjà le statut courant » — en comparant le statut **de la demande**. Cette
garde ouvre un trou :

> L'administrateur clôt une demande à la main (`termine`, source `admin`).
> Plus tard, le développeur passe le ticket à `Déployé`. Statut cible
> (`termine`) == statut courant (`termine`) → on ne fait rien → l'e-mail de
> déploiement ne part jamais.

La garde porte donc sur le **statut Jira précédemment enregistré**
(`jira_status_id` / `jira_status`) : si Jira renvoie le même statut qu'au
dernier passage, il ne s'est rien passé côté ticket, on sort. Sinon on
applique le mappage. Une seule comparaison couvre à la fois le cas ci-dessus
et le cas nominal — `issue_updated` se déclenche à **chaque** modification du
ticket, pas seulement aux changements de statut.

### 2.5 Validation à la main, pas de Zod

La spécification (§7.4) demandait Zod. Ce n'est pas une dépendance du projet,
et les quatre autres modules de validation (`pseudo.ts`, `ideas.ts`,
`reviews.ts`, `entitlements.ts`) sont des fonctions pures testées en vitest.
Ajouter une bibliothèque pour quatre champs, ce serait deux styles de
validation dans le même dépôt.

### 2.6 L'écran d'administration charge une fenêtre bornée

La spécification (§11.2) demandait une pagination serveur de 25 lignes. Tous
les écrans d'administration existants (`getAdminIdeas`, `getAdminComments`,
`RecipesManager`) chargent une liste complète et filtrent côté client, et le
volume attendu ici se compte en dizaines de demandes par mois.

→ Le serveur sert les **200 demandes les plus récentes** ; le tri et la
recherche sont instantanés côté client. Les filtres **statut** et **type**,
eux, vivent dans l'URL et sont appliqués côté serveur (doctrine « l'URL est le
seul état de l'écran », `/recherche`) : c'est ce qui permet d'atteindre les
demandes plus anciennes malgré le plafond, et ce qui rend un lien de filtre
partageable.

Passer plus tard à une pagination serveur ne touche que la fonction de
lecture, pas l'écran.

### 2.7 Simplifications de schéma

- **`ip_hash_expires_at` n'existe pas** : la date d'expiration est
  `created_at + 30 jours`, calculée par la purge. Une colonne dénormalisée de
  moins, donc pas de dérive possible entre les deux valeurs — même doctrine
  que `author_ratings` et `profiles.followers_count`.
- **`email` est stocké même pour un membre connecté.** `user_id` est en
  `ON DELETE SET NULL`, et répondre à une demande exige une adresse (§10.2) :
  sans copie, la suppression d'un compte rendrait irrépondable une demande en
  cours.
- **`jira_status_id`** s'ajoute à `jira_status`, pour que la garde d'idempotence
  du §2.4 et le mappage du §2.3 comparent la même chose.

### 2.8 Le membre reçoit aussi une notification in-app

Les notifications in-app existent déjà (`notifications`, `NotificationBell`,
`createNotification`). Un membre **connecté** reçoit donc la notification en
plus de l'e-mail, pour un appel de fonction déjà écrit. C'est le seul canal
qui atteint réellement un membre tant que SES est en bac à sable, et cela
livre à moitié le « suivi du statut visible par le membre » que la
spécification repoussait hors périmètre.

---

## 3. Modules

| Fichier | Rôle |
|---|---|
| `lib/contact.ts` | **Pur.** Types, libellés, validation, référence, réduction du user-agent, mappage Jira, règles de statut. Aucun import Supabase ni `next/headers`. |
| `lib/contact-types.ts` | Types des trois tables, déclarés à la main en attendant `npm run gen:types`. Motif `lib/impersonation-types.ts`. |
| `lib/contact-data.ts` | *(lot 2)* Lectures et écritures, **server-only**. |
| `lib/jira.ts` | *(lot 3)* Appels REST Jira, conversion ADF. |

La séparation pur / `-data` n'est pas cosmétique : le formulaire de contact est
un Client Component. S'il importait le module de données, il tirerait
`next/headers` via `lib/supabase/server` et **casserait le build**. Même piège
que `ideas.ts` / `ideas-data.ts` et `pseudo.ts` / `pseudo-data.ts`.

---

## 4. Statuts

### 4.1 Statuts de la demande

| Valeur | Libellé | Signification |
|---|---|---|
| `recu` | Reçu | Enregistrée, pas encore prise en charge |
| `en_cours` | En cours de traitement | Prise en charge, ou ticket Jira en cours |
| `a_deployer` | À déployer | Correctif développé, pas encore en ligne |
| `termine` | Terminé | Correctif en ligne, ou demande close |

Seul `termine` clôt la demande (`closed_at`), et seul un `termine` **venu de
Jira** déclenche l'e-mail au membre. Une clôture manuelle n'envoie rien.

### 4.2 Mappage depuis Jira

| Statut Jira | Demande | E-mail |
|---|---|---|
| Catégorie `new` | inchangé | — |
| Catégorie `indeterminate` | `en_cours` | non |
| `JIRA_STATUS_TO_DEPLOY` (id, sinon nom) | `a_deployer` | non |
| `JIRA_STATUS_DEPLOYED` (id, sinon nom) | `termine` | **oui** |
| Autre statut de catégorie `done` | `a_deployer` | non, + avertissement |

Le nom et l'id **priment sur la catégorie** : un statut nommé `Déployé` mal
rangé dans une autre catégorie reste traité comme un déploiement. C'est la
configuration nominale qui doit être fausse pour que la catégorie décide.

### 4.3 Règles de préséance

- Une mise à jour venue de Jira ne rétrograde jamais un `termine` posé par un
  administrateur (`status_source = 'admin'`).
- L'envoi d'une réponse fait passer `recu` → `en_cours` ; `a_deployer` et
  `termine` sont laissés intacts.
- Tout changement, quelle qu'en soit l'origine, est écrit dans
  `contact_status_history`.

---

## 5. Idempotence de l'e-mail de déploiement

Un « votre bug est corrigé » envoyé deux fois est un défaut visible ; envoyé à
tort, c'est pire. Sans état `scheduled` (§2.2), toute la garde se joue à
l'envoi, et elle applique la doctrine déjà écrite en tête de
`lib/quota-route.ts` : **réserver plutôt que constater**.

```sql
update contact_messages
   set deploy_email_status = 'sent', deploy_email_sent_at = now()
 where id = $1 and deploy_email_status = 'pending'
returning id;
```

- **0 ligne** → un autre événement a déjà pris la main. On ne fait rien.
- **1 ligne** → c'est nous. On envoie ; si l'envoi échoue, on repasse à
  `failed`.

La réservation **précède** l'envoi. Un `select` suivi d'un `update` laisserait
entre les deux une fenêtre où trois `issue_updated` simultanés enverraient
trois e-mails. C'est le même raisonnement que `claimNotification`
(`lib/notifications-data.ts`), qui réserve sous une contrainte d'unicité.

`sent` est **terminal** : rouvrir puis redéployer un ticket déjà notifié
n'envoie pas de second e-mail — l'administrateur utilise la réponse manuelle.
`failed` ne se rejoue jamais tout seul : c'est le bouton « Renvoyer » du
back-office, pour que personne ne découvre un jour une boucle d'envois.

---

## 6. Conservation et purge

| Donnée | Durée | Point de départ |
|---|---|---|
| Demande close (bug) | 24 mois | `closed_at` |
| Demande close (autres types) | 12 mois | `closed_at` |
| Réponses, historique | idem demande | cascade |
| `ip_hash` | 30 jours | `created_at` |
| Ticket Jira | sans limite | aucune donnée nominative |

Une demande en `a_deployer` n'a pas de `closed_at` : son compte à rebours n'a
pas démarré, elle n'est **jamais** purgée. C'est voulu — elle est encore en
cours de traitement.

---

## 7. Pseudonymisation — l'invariant à ne jamais casser

Le ticket Jira porte la **référence** de la demande et l'**identifiant
technique** du membre (UUID). Il ne porte **jamais** l'e-mail, le nom du
profil, l'adresse IP ni le user-agent brut.

Un seul constructeur produit le corps du ticket
(`corpsTicketJira`, `lib/contact.ts`), et il est testé sur cet invariant. Ne
jamais composer une description Jira ailleurs : c'est la seule garantie que la
minimisation ne se perde pas au détour d'un ajout de champ.

Le user-agent brut n'est jamais stocké non plus. `reduireUserAgent` n'en
retient que navigateur, version majeure, système et type d'appareil — et
quand elle ne reconnaît rien, elle renvoie une **constante**, jamais un
fragment de la chaîne d'origine.

### 7.1 Création du ticket (`lib/jira.ts`)

Appelée depuis `/api/contact` juste après l'INSERT, uniquement pour
`type = 'bug'` — jamais pour `donnees-personnelles`, garantie **doublée** par
la contrainte SQL `contact_messages_jira_bug_only` (lot 1) : même un appel
fait par erreur depuis un autre chemin de code échouerait à l'écriture.

- **`summary`** vient de `resumeTicketJira(subject)` — le sujet SEUL, jamais
  la référence ni le message : ce sont eux, avec le reste du contexte, que
  porte la `description`.
- **`description`** est le texte de `corpsTicketJira` (§7), converti en ADF
  par `texteVersAdf` : une ligne vide sépare deux paragraphes, un saut de
  ligne simple à l'intérieur d'un bloc devient un `hardBreak` — Jira n'a pas
  de retour à la ligne automatique dans un nœud `text`.
- **Aucun champ `reporter`** : un membre n'a pas de compte Jira, le
  renseigner échouerait ou pointerait sur le mauvais compte.
- **Best-effort, jamais bloquant** : clé Jira absente, panne, timeout ou
  contenu refusé → `{ ok: false }`, journalisé sur la ligne
  (`jira_sync_status = 'failed'`, `jira_error`), jamais renvoyé au
  demandeur — sa confirmation ne dépend que de l'INSERT, déjà passé.
- **Timeout 8 s, un seul retry après 1 s**, sur un 429/5xx **ou** une
  exception réseau (timeout compris — la spec ne distingue pas les deux,
  l'un et l'autre sont transitoires). Jamais de retry sur 400/401/403 :
  rejouer une erreur de configuration ou de contenu produirait exactement la
  même réponse une seconde plus tard.
- **`jira_status` / `jira_status_id` restent `null` à la création** : Jira
  place l'issue neuve dans son statut par défaut (catégorie `new`), qu'on ne
  matérialise pas ici — c'est le webhook et la réconciliation (lot suivant)
  qui écrivent le premier statut réel, au premier événement reçu.

---

## 8. Anti-spam

### 8.1 Le délai minimum est porté par un jeton signé, pas par l'horloge du navigateur

La spécification (§5.5.2) décrit un simple délai de 3 secondes entre
l'affichage et la soumission. Mesuré depuis une valeur envoyée par le
navigateur, ce contrôle ne protège rien : un script qui appelle
`/api/contact` directement choisit l'horodatage qu'il veut.

`app/contact/page.tsx` signe donc l'instant d'ouverture côté **serveur**
(`signerOuverture`, HMAC-SHA256, `CONTACT_FORM_SECRET`) et l'embarque dans un
champ caché (`formToken`) ; la route revérifie la signature avant de faire
confiance à l'horodatage (`verifierOuverture`). Trois issues, pas une seule,
parce qu'elles appellent des comportements différents (`verdictDelaiOuverture`,
`lib/contact.ts`) :

| Issue | Cause | Réponse |
|---|---|---|
| `premature` | soumission à moins de 3 s | `200` silencieux, signature d'un robot |
| `invalide` | jeton absent, signature fausse, horodatage futur | `200` silencieux, falsification |
| `expire` | jeton valide, mais vieux de plus de 24 h | `400` avec un message franc : un onglet resté ouvert est un cas humain plausible, pas un robot — un silence trompeur laisserait croire à un envoi réussi |
| `ok` | — | poursuite du traitement |

**Dégradé, jamais bloquant** si `CONTACT_FORM_SECRET` est absent : la route
retombe sur l'horodatage brut du jeton, non signé, et journalise une erreur.
Même doctrine que la modération IA des pseudos — une variable de sécurité
secondaire manquante ne doit jamais empêcher un dépôt de demande.

### 8.2 `page_url` n'accepte qu'un chemin interne

Ni la spécification ni le formulaire ne valident la forme de `page_url` avant
de l'écrire. `cheminOrigineValide` (`lib/contact.ts`) n'accepte qu'une chaîne
commençant par `/` et pas par `//` : une URL absolue ou protocole-relative y
serait affichée telle quelle dans le back-office et dans le ticket Jira,
trompeuse à lire sans qu'aucun code n'ait besoin d'y naviguer pour que ce
soit gênant.

### 8.3 Vue d'ensemble des trois couches

Sans traceur tiers (un reCAPTCHA réintroduirait une obligation de
consentement) :

1. **Honeypot** `website`, masqué par positionnement hors écran. Rempli →
   `200` silencieux, aucune ligne écrite.
2. **Délai minimum** de 3 secondes entre l'affichage et l'envoi, via le jeton
   signé du §8.1.
3. **Limitation de débit** : 3 demandes / 10 min par `ip_hash`, 5 / 24 h par
   `user_id`, comptées **en base** sur `contact_messages`.

Le comptage en base, et non en mémoire du processus comme
`/api/pseudo/verifier`, est délibéré : chaque instance serverless a sa propre
mémoire, et cette route-ci **écrit en base avec la clé service_role**. Un
compteur qu'on peut contourner en tombant sur une autre instance n'est pas une
protection suffisante pour ça.

Les couches 1 et 2 n'écrivent rien, donc ne consomment aucun quota — un robot
qui remplit le honeypot n'est jamais freiné, ce qui est sans conséquence
puisqu'il ne laisse aucune trace.

---

## 9. Variables d'environnement

| Variable | Rôle |
|---|---|
| `JIRA_BASE_URL` | `https://<instance>.atlassian.net` |
| `JIRA_EMAIL` | Compte Atlassian (authentification Basic) |
| `JIRA_API_TOKEN` | Jeton généré sur `id.atlassian.com` |
| `JIRA_PROJECT_KEY` | Clé du projet cible |
| `JIRA_ISSUE_TYPE_BUG` | Nom exact du type de ticket |
| `JIRA_STATUS_TO_DEPLOY` / `_ID` | Statut « développé, non déployé » — défaut `Terminé` |
| `JIRA_STATUS_DEPLOYED` / `_ID` | Statut « en production » — défaut `Déployé` |
| `JIRA_WEBHOOK_SECRET` | Secret HMAC du webhook entrant |
| `CONTACT_FORM_SECRET` | Secret HMAC du jeton anti-robot du formulaire (§8.1) — absent : le délai minimum reste actif mais non signé, dégradé jamais bloquant |
| `IP_HASH_SALT` | Sel de hachage des adresses IP |
| `EMAIL_REPLY_TO` | Adresse de réponse (`contact@jepatisse.com`) |
| `CONTACT_NOTIFICATION_TO` | Destinataire des notifications d'administration |

Déjà en place, réutilisées telles quelles : `SUPABASE_SERVICE_ROLE_KEY`,
`CRON_SECRET`, `SES_SMTP_*`, `SES_SENDER_EMAIL`.

Jeu distinct sur `dev.jepatisse.com`, pointant vers un projet Jira de test et
une adresse de notification de test.

**L'URL du webhook est `https://www.jepatisse.com/api/jira/webhook`**, pas
`https://jepatisse.com/...` : le domaine nu redirige en 308 vers `www`, et un
POST redirigé perd son corps ou son en-tête de signature selon le client.
`middleware.ts` exclut `/api/*` de son matcher et de la bascule
`COMING_SOON` : la route reste joignable même site fermé.

---

## 10. Prérequis côté Jira

Le projet doit comporter **deux statuts distincts en fin de workflow** :

| Statut | Catégorie | Signification |
|---|---|---|
| `Terminé` | Terminé | Développé, pas encore en ligne |
| `Déployé` | Terminé | En production sur le site |

Sans cette distinction, il n'existe aucun moment où le site peut savoir qu'une
correction est réellement en ligne, et l'e-mail au membre n'a plus de
déclencheur légitime.

Webhook **système** (Réglages → Système → Avancé → WebHooks), et non une règle
Jira Automation : les webhooks système ne sont pas décomptés du quota de 100
exécutions mensuelles du plan gratuit.

**Vérification ponctuelle avant mise en service** (pas un appel effectué à
chaque création de ticket — les champs obligatoires d'un projet ne changent
pas d'une demande à l'autre) : `GET /rest/api/3/issue/createmeta?projectKeys=<JIRA_PROJECT_KEY>&issuetypeNames=<JIRA_ISSUE_TYPE_BUG>&expand=projects.issuetypes.fields`
doit confirmer que seuls `project`, `issuetype`, `summary` et `description`
sont requis. Un champ obligatoire supplémentaire (composant, priorité…) ferait
échouer **toute** création de ticket avec un 400 — jamais retenté (§7.1),
visible seulement via `jira_error` dans le bandeau d'anomalies.

---

## 11. RGPD

- **Base légale** : intérêt légitime (art. 6.1.f) — traiter une demande
  initiée par la personne. **Aucune case de consentement**, et les e-mails
  sortants sont transactionnels (pas de lien de désinscription requis).
- **Information** affichée sous le formulaire, avec lien vers
  `/confidentialite`. ⚠️ Cette page **n'existe pas encore** : le module ne peut
  pas être mis en ligne conforme sans elle.
- Le type `donnees-personnelles` ne crée **jamais** de ticket Jira et marque
  la notification d'administration comme prioritaire (délai légal : un mois).
- **Effacement** : supprimer les lignes `contact_messages` de la personne
  (réponses et historique partent en cascade) ; si un ticket Jira est encore
  ouvert, retirer l'identifiant membre de sa description et y commenter
  « source supprimée à la demande de l'utilisateur ».
