# Déploiement

Le site tourne entièrement sur **Infomaniak** — Virtuozzo Cloud pour
l'application et la base, Public Cloud (Swift) pour les photos. La migration
depuis Vercel + Supabase, achevée le 13/09/2026, est documentée pas à pas
dans `docs/migration-infomaniak.md` ; ce fichier ne décrit que l'état courant
et les gestes d'exploitation.

> **Le site n'est pas encore ouvert au public.** `www.jepatisse.com`,
> `jepatisse.com`, `jepatisse.fr` et `www.jepatisse.fr` sont tous servis
> depuis Virtuozzo, mais `COMING_SOON=true` sur le nœud applicatif affiche la
> page d'attente sur tous sauf `dev.jepatisse.com` (exempté par
> `middleware.ts`, comparaison sur `Host`). Ouvrir le site est un simple
> retrait de cette variable.

## Les environnements Virtuozzo

Trois environnements distincts, et c'est structurel : le moteur d'un
environnement Jelastic est figé à sa création. `jepatisse-bdd` porte une
image Docker à l'étage applicatif, ce qui y interdit les piles natives — d'où
un second environnement pour l'application. L'effet de bord est heureux : un
redéploiement applicatif, le geste le plus fréquent, ne peut pas atteindre la
base.

| Environnement | Nœud | Rôle |
|---|---|---|
| `jepatisse-app` | 216658 | Application Next.js (pile Node.js 22.x native, `pm2`) |
| `jepatisse-app` | 216680 | Équilibreur NGINX — TLS de `dev.jepatisse.com` |
| `jepatisse-bdd` | 216115 | Équilibreur NGINX — TLS de `auth.jepatisse.com`, tient le rôle de Kong sur `/auth/v1/` et `/rest/v1/` |
| `jepatisse-bdd` | 216075 | PostgreSQL 17.6 (image `supabase/postgres`) |
| `jepatisse-bdd` | 216114 | GoTrue (authentification) |
| `jepatisse-bdd` | 216242 | PostgREST (API REST sur la base) |
| `jepatisse-preview` | 216804 | Aperçu d'une PR (pile Node.js 22.x native, `pm2`) — voir plus bas |

Région : **Genève**. Application et base partagent la plateforme et la région
— aucune requête ne traverse une frontière réseau lointaine.

## Déployer `main` automatiquement (GitHub Actions)

`.github/workflows/deploiement-app.yml` rejoue la procédure manuelle ci-dessous
sur le nœud, à chaque push sur `main` (ou à la demande, avec une branche au
choix). Il existe parce qu'une fusion sur `main` ne changeait **rien** au site
tant que personne n'ouvrait le Web SSH : `www` et `dev.jepatisse.com` étant
servis par le même nœud depuis le même build, « c'est fusionné » et « c'est en
ligne » n'avaient aucun rapport.

Il reprend aussi un rôle qui tenait à Vercel sans que ce soit voulu :
`jira-deploiement.yml` se déclenche sur `deployment_status`, un événement émis
par les **projets Vercel résiduels**. Leur suppression (phase 4) aurait arrêté
la chaîne « ticket → Déployé → e-mail au demandeur » en silence. Le workflow
appelle désormais `jira-deploiement.yml` directement — et pas via l'événement,
qu'un `deployment_status` créé avec le `GITHUB_TOKEN` du dépôt **ne déclenche
jamais** (GitHub coupe là pour éviter les boucles).

**Désarmé par défaut.** Sans la variable de dépôt `DEPLOIEMENT_ACTIF` à
`true`, le workflow va au bout mais ne touche pas le nœud : il journalise ce
qu'il aurait fait. Même doctrine que `JIRA_DEPLOY_ACTIF`.

### Ce qu'il fait, dans l'ordre

1. **Barrière sur le runner** : `npm ci`, `typecheck`, `lint`, la suite de
   tests, puis `build`. Ce n'est pas du zèle — la procédure du nœud fait
   `rm -rf .next` **avant** de construire : une construction qui échoue
   là-bas laisse le site sans build. Un commit qui ne compile pas ne doit
   jamais atteindre cette fenêtre.
2. **Déploiement** : `scripts/deploiement-app.sh` est envoyé au nœud par
   l'entrée standard (la version exécutée est donc toujours celle du commit
   déployé), qui fait `git fetch` + `git reset --hard <sha>`, la commande
   canonique de construction, puis `pm2 restart`.
3. **Vérification fonctionnelle** : le déploiement n'est réussi qu'après un
   HTTP 200 réellement obtenu. Un `pm2 restart` qui rend la main ne prouve
   pas qu'une page s'affiche.
4. **Jira** : les tickets cités dans les 50 derniers commits passent à
   « Déployé » — sous réserve de `JIRA_DEPLOY_ACTIF`, inchangé.

### Ce qu'il faut lui donner

**Où :** Settings > Secrets and variables > Actions, sur le dépôt GitHub.

| Nom | Type | Rôle |
|---|---|---|
| `DEPLOIEMENT_ACTIF` | Variable | `true` arme le workflow. Absente = simulation. |
| `DEPLOY_SSH_HOST` | Secret | Hôte SSH du nœud (console Infomaniak → accès SSH). |
| `DEPLOY_SSH_USER` | Secret | Utilisateur SSH de la passerelle Jelastic. |
| `DEPLOY_SSH_KEY` | Secret | Clé privée correspondante (voir ci-dessous : **la coller en base64 sur une seule ligne**). |
| `DEPLOY_SSH_KNOWN_HOSTS` | Secret | Clé d'hôte épinglée. Absente : acceptée à la volée, avec un avertissement. |
| `DEPLOY_SSH_PORT` | Variable | Port SSH, `3022` par défaut. |
| `RACINE_APP` | Variable | `/home/jelastic/ROOT` par défaut. |
| `APP_PM2` | Variable | Nom pm2 de l'application, `je-patisse` par défaut. |
| `URL_VERIFICATION` | Variable | `https://dev.jepatisse.com` par défaut — seul hôte exempté de `COMING_SOON`, donc le seul qui prouve que le site répond. |

**État du nœud, relevé le 14/09 avant la première mise en service** :
`/home/jelastic/ROOT` est bien un clone git (remote HTTPS sur
`github.com/fabien5111/MC`), `git fetch` y aboutit **sans aucun identifiant**
— le dépôt est public, la lecture est anonyme, et rien ne peut donc expirer
côté droits. `pm2` y fait tourner `je-patisse`, sous Node 22.23.2.

Deux conséquences à garder en tête :

- **`node`, `npm` et `pm2` vivent sous `/opt/.nvm/versions/node/<version>/bin`**,
  un répertoire que le PATH ne doit qu'au profil du shell *interactif*. Une
  commande lancée par `ssh … 'bash -s'` ne le voit pas : `scripts/deploiement-app.sh`
  résout donc ce répertoire lui-même. Ne pas retirer ce bloc en croyant
  simplifier — sans lui, `npm ci` échoue sur un « command not found » alors
  que la même commande marche parfaitement dans le Web SSH.
- **Le compte SSH de la passerelle s'adresse au conteneur**, pas au compte :
  `216658-11487@gate.jpe.infomaniak.com`, soit **`<numéro de nœud>-<identifiant>`**
  — dans cet ordre, et c'est contre-intuitif. La chaîne mise en avant par le
  tableau de bord (onglet *Connexion SSH*, `11487@gate…`) est celle d'un accès
  **humain** : elle ouvre un menu interactif de choix du conteneur, que rien
  ne peut renseigner dans un déploiement automatique. La forme par conteneur
  se lit dans l'onglet **SFTP / Accès SSH direct**, en sélectionnant le nœud
  dans la liste déroulante : elle y est donnée telle quelle, champ *Nom
  d'utilisateur*.

- **La clé privée se transmet en base64, sur une seule ligne.** Elle est
  générée sur le nœud, donc recopiée depuis un terminal web — où l'habillage
  du texte la mutile sans rien signaler. Le piège est qu'une clé ainsi
  tronquée **paraît valide** : l'en-tête et le pied subsistent, et
  `ssh-keygen -lf` en calcule encore l'empreinte, qui ne dépend que de la
  partie publique. L'échec n'arrive qu'à l'usage, sous la forme
  « `Load key … error in libcrypto` » suivie d'un `Permission denied` — qui
  envoie chercher un problème de droits là où il n'y a qu'un fichier abîmé.
  Un indice discret le trahit : `ssh-keygen -lf` affiche « no comment », le
  commentaire de la clé vivant justement dans la partie privée.

  Sur le nœud : `base64 ~/.ssh/deploiement_github | tr -d '\n'`, et ce bloc
  d'une ligne va dans le secret. Le workflow accepte les deux formes (PEM
  brut ou base64), retire les retours chariot, puis **vérifie la partie
  privée** en dérivant la clé publique (`ssh-keygen -y`) — un contrôle qui,
  contrairement à l'empreinte, échoue vraiment sur une clé tronquée.

  **Le symptôme, si on se trompe d'ordre**, ne ressemble pas à un problème de
  compte : `Connection closed by <ip> port 3022`, sans « Permission denied »
  ni la moindre mention de clé. La passerelle (`JSSHProxy`) raccroche dès la
  lecture du nom d'utilisateur, **avant** d'avoir proposé la moindre méthode
  d'authentification — ce qui envoie chercher du côté de la clé, où il n'y a
  rien à trouver. D'où le mode `test_connexion` du workflow : en verbeux, la
  distinction est immédiate (une clé refusée, elle, produit un
  « Offering public key » suivi d'un « Permission denied »).

Le script s'arrête avec un message explicite si `/home/jelastic/ROOT` cessait
d'être un clone git — ce serait le cas si le nœud passait au panneau Git de
Jelastic plutôt qu'à un clone classique.

La procédure manuelle ci-dessous reste valable et reste la porte de sortie :
elle est ce que le workflow exécute, ni plus ni moins.

## Aperçu d'une PR (environnement `jepatisse-preview`)

Le palier qui manquait. Jusqu'ici, entre « je fusionne » et « c'est en ligne sur
le nœud qui sert `dev` **et** `www` », il n'y avait rien : le premier endroit où
l'on pouvait regarder une correction était déjà le nœud de tout le monde.

`.github/workflows/deploiement-preview.yml` déploie la branche d'une PR sur un
**environnement d'aperçu distinct**, et commente son URL sur la PR.

### Un ENVIRONNEMENT séparé, pas une couche — et ça a coûté une panne

Le premier essai, le 14/09, a ajouté le nœud d'aperçu comme un second nœud de
la **couche applicative de `jepatisse-app`**, en comptant sur un `server_name`
propre dans `/etc/nginx/conf.d/` de l'équilibreur 216680 pour l'isoler. Ça ne
tient pas : **la plateforme régénère `upstream common` à partir de la couche
entière**, et y a rangé le nœud d'aperçu — vide, tout juste créé.
`dev.jepatisse.com` s'est mis à répondre depuis lui, servant l'application
Express d'usine (`Cannot GET /`). Un bloc dans `conf.d/` ne protège de rien
ici : l'upstream est réécrit au-dessus de lui.

La panne a duré au-delà du retrait de la couche, pour une deuxième raison qu'il
faut connaître : la plateforme a bien réécrit `nginx-jelastic.conf` avec la
bonne cible, mais le NGINX **en cours d'exécution** ne l'a jamais relu — et
`nginx -s reload` est refusé depuis le Web SSH (`kill(…) failed (1: Operation
not permitted)`, l'utilisateur du shell n'a pas le droit de signaler le
master). Seul un **redémarrage du nœud d'équilibrage** depuis le tableau de
bord referme l'écart. Symptôme pendant ce temps : 502 sur toutes les requêtes,
alors que le nœud applicatif répond parfaitement en local et que le fichier de
configuration sur disque est juste.

**Règle qui en découle : ne jamais ajouter de nœud à la couche Node.js de
`jepatisse-app`.** Un aperçu vit dans son propre environnement, avec sa propre
adresse.

### L'étiquette est l'autorisation

L'aperçu ne part **jamais** du seul fait qu'une PR existe : il faut poser
l'étiquette **`preview`** dessus. Ce n'est pas de l'ergonomie, c'est la
sécurité du dispositif — ce dépôt est **public**, n'importe qui peut ouvrir une
PR, et un aperçu construit du code sur une vraie machine avec de vrais secrets.
Or poser une étiquette exige le droit d'écriture sur le dépôt : c'est donc
forcément le geste délibéré de quelqu'un qui a lu le code.

Retirer l'étiquette, ou fermer la PR, arrête l'aperçu et libère le créneau.

### Un seul créneau, et il est annoncé

Un seul nœud d'aperçu, donc **une PR à la fois**. Le workflow refuse de démarrer
si une autre PR ouverte porte déjà l'étiquette, en la nommant — plutôt que
d'écraser en silence l'aperçu d'un autre, qui testerait alors du code qui n'est
pas le sien sans s'en apercevoir.

### Ce qu'un aperçu ne prouve pas

**La base de données est la même.** Le nœud est séparé, pas les données : un
aperçu interroge le même PostgreSQL que `dev` et `www`. Un test destructif s'y
voit en vrai, et une PR qui suppose une migration SQL ne peut pas être essayée
tant que cette migration n'est pas appliquée à la base commune — ce qui affecte
aussitôt tout le monde. C'est le plafond du dispositif, quelle que soit
l'infrastructure : le commentaire déposé sur la PR le rappelle à chaque fois.

### Ce qu'il ne fait pas, volontairement

- **Pas d'appel à Jira.** Un aperçu n'est pas un déploiement : annoncer
  « Déployé » ferait partir l'e-mail irréversible au demandeur
  (`docs/contact-jira.md` §2) pour du code qui n'est allé nulle part.
- **Pas de déploiement GitHub « production ».** L'historique des déploiements
  doit rester celui de ce qui sert les visiteurs.
- **Il ne touche jamais au nœud 216658.** C'est la raison d'être d'un
  environnement séparé : une construction d'aperçu ne doit pas disputer son
  processeur au site qui répond aux visiteurs — ni, on l'a appris à ses dépens,
  pouvoir entrer dans son équilibrage.

### Le même script que la production

`scripts/deploiement-app.sh` est utilisé **sans une ligne de différence** par
les deux workflows, et la validation des secrets SSH est une action commune
(`.github/actions/preparer-connexion-ssh`). Un script d'aperçu séparé finirait
par diverger — et l'aperçu cesserait alors de prouver quoi que ce soit sur le
déploiement réel, ce qui est pourtant tout son objet.

### Ce qu'il faut lui donner

**Où :** Settings > Secrets and variables > Actions, sur le dépôt GitHub.

| Nom | Type | Rôle |
|---|---|---|
| `PREVIEW_SSH_USER` | Secret | Compte du nœud d'aperçu, `<numéro de nœud>-11487`. **Seul secret réellement nouveau.** |
| `PREVIEW_SSH_HOST` | Secret | Facultatif — à défaut, `DEPLOY_SSH_HOST` est réutilisé (même passerelle). |
| `PREVIEW_SSH_KEY` | Secret | Facultatif — à défaut, `DEPLOY_SSH_KEY` est réutilisée. La clé publique étant enregistrée sur le **compte** Jelastic, elle ouvre déjà tous ses nœuds. |
| `PREVIEW_URL` | Variable | **Obligatoire, sans valeur par défaut** — l'adresse que la plateforme donne à l'environnement d'aperçu (`https://<environnement>.jcloud-ver-jpe.ik-server.com`). Une valeur en dur dans le workflow finirait par désigner un environnement détruit. |
| `PREVIEW_RACINE_APP` | Variable | `/home/jelastic/ROOT` par défaut. |
| `PREVIEW_APP_PM2` | Variable | `je-patisse` par défaut. |

### Prérequis d'infrastructure

**Où :** tableau de bord Jelastic, **nouvel** environnement.

1. **Créer un environnement** à part — pile **Node.js 22.x** (variante `-pm2`),
   **un seul nœud**, **pas de couche d'équilibrage**, région Genève. Cloudlets :
   réserve 1, limite 24 — c'est la construction Next.js qui demande la mémoire,
   et on garde le même plafond que la production pour que l'aperçu reste une
   répétition fidèle.
2. **Pas de domaine personnalisé.** On utilise l'adresse que la plateforme
   donne à l'environnement, servie en HTTPS par son infrastructure partagée.
   Un `preview.jepatisse.com` imposerait une couche d'équilibrage rien que pour
   terminer le TLS (un nœud Node.js nu n'a pas de terminaison TLS : la pile y
   pose une simple redirection nft depuis le port 80), plus un enregistrement
   DNS et un certificat à renouveler — pour une URL qu'on lit dans un
   commentaire de PR et qu'on oublie trois jours plus tard.
3. **Relever le numéro de nœud**, puis sa chaîne de connexion dans l'onglet
   *SFTP / Accès SSH direct* — c'est `PREVIEW_SSH_USER`. La clé SSH, elle, est
   enregistrée sur le **compte** Jelastic : elle ouvre déjà ce nœud, rien à
   reposer.
4. **Amorcer le nœud** : `/home/jelastic/ROOT` doit être un **clone git** du
   dépôt (`scripts/deploiement-app.sh` met le code à jour par `git fetch`, il ne
   copie rien). Le premier déploiement démarre lui-même l'application depuis
   `ecosystem.config.js` — inutile de la lancer à la main.
5. **Poser les variables d'environnement** comme celles du 216658, **à quatre
   exceptions près, et chacune compte** :
   - **`COMING_SOON` absente.** `middleware.ts` n'exempte que
     `dev.jepatisse.com` (comparaison sur `Host`) : posée ici, elle servirait la
     page d'attente à la place de l'aperçu.
   - **`SMTP_*` et `JIRA_*` absentes.** Un aperçu ne doit pouvoir ni envoyer un
     e-mail à un demandeur réel, ni créer un ticket. `lib/jira.ts` nomme la
     variable manquante et rend une erreur — il ne plante pas.
   - **`CRON_SECRET` absente.** Aucune tâche planifiée ne vise l'aperçu ; la
     poser n'ouvrirait qu'une porte.
   - **`PWA_DISABLE_SERVICE_WORKER=true`.** L'aperçu est une origine distincte,
     son service worker ne peut donc pas polluer `dev` ni `www` — mais un cache
     de worker sur un build qui change à chaque push n'apporte rien et brouille
     ce qu'on vient vérifier.

   Attention aux **`NEXT_PUBLIC_*`** : elles sont inlinées dans le bundle **au
   build, sur ce nœud-ci**. Fausses ici, elles donnent un aperçu qui ment sans
   lever la moindre erreur.
6. **Autoriser l'origine auprès de l'API**, sans quoi l'aperçu ne prouve rien
   — voir la section suivante.

### Deux verrous côté API, tous deux nécessaires pour se connecter sur l'aperçu

Le navigateur appelle `auth.jepatisse.com` **en direct**. Deux garde-fous
distincts, sur deux nœuds distincts de l'environnement `jepatisse-bdd`, doivent
tous les deux connaître la nouvelle origine — un seul suffi(sai)t pour l'un
des deux modes de connexion, mais pas pour l'autre :

| Verrou | Où | Débloque |
|---|---|---|
| Motif CORS de `/etc/nginx/conf.d/ssl.conf` | nœud **216115** (équilibreur) | Connexion e-mail, favoris, votes — toute écriture depuis le navigateur |
| `GOTRUE_URI_ALLOW_LIST` | nœud **216114** (GoTrue) | Connexion **Google** — c'est cette liste qui autorise GoTrue à renvoyer le navigateur vers l'aperçu une fois l'écran Google passé |

**Pas de configuration côté Google Cloud Console.** L'URL de redirection
enregistrée auprès de Google est fixe, indépendante du site d'origine —
`GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI = https://auth.jepatisse.com/auth/v1/callback`
— et fonctionne déjà pour toutes les origines. Seule la liste GoTrue, qui
gouverne la redirection *finale* vers l'application, doit apprendre la
nouvelle adresse.

**Mode opératoire pour `GOTRUE_URI_ALLOW_LIST`** — même discipline que le
motif CORS (relever l'existant, étendre, vérifier avant et après) :

1. **Où :** panneau *Configuration manager* du nœud **216114** → relever la
   valeur actuelle de `GOTRUE_URI_ALLOW_LIST` (motif à glob, séparé par des
   virgules — ex. `https://dev.jepatisse.com/**,https://www.jepatisse.com/**`).
2. Y ajouter `,https://<origine-a-autoriser>/**`, enregistrer.
3. **Redémarrer le nœud** (bouton *Redémarrer les conteneurs* de la couche
   « Auth »). Une variable posée dans le panneau ne vaut rien tant que le
   processus ne l'a pas relue — même piège que documenté pour `pm2` dans
   `CLAUDE.md`, ici pour un conteneur Docker BusyBox.
4. **Vérifier sur le VRAI processus**, jamais sur PID 1 (`init`, le lanceur du
   conteneur) : le binaire GoTrue s'appelle `auth` dans ce conteneur —
   `ps -o pid,ppid,comm` pour le trouver, puis
   `tr '\0' '\n' < /proc/<pid>/environ | grep GOTRUE_URI_ALLOW_LIST`. Un
   redémarrage qui n'a pas eu lieu se voit à `ps -o pid,etime,comm` : si
   `init` affiche un temps aussi long que les autres processus système, rien
   n'a redémarré — vécu le 15/09, un premier clic n'avait pas visé la bonne
   icône (« Redémarrer les conteneurs » de la couche, pas l'environnement).

**Effet de bord à connaître sur le nœud d'aperçu lui-même** : fermer une PR
étiquetée arrête l'application (`pm2 stop`, § « Le même script que la
production » plus haut) sans la redéployer. Le prochain aperçu répond donc en
**502** tant qu'une PR n'a pas été étiquetée `preview` à nouveau — pas une
panne, l'état attendu entre deux aperçus.

## Construire et déployer l'application (à la main)

Le code est déployé depuis Git, puis **construit sur le nœud**.

**Où :** Web SSH du nœud **216658**.

```bash
cd /home/jelastic/ROOT && npm ci --include=dev && rm -rf .next && NODE_ENV=production npm run build
```

Trois détails qui ont chacun coûté une panne :

- **`--include=dev` est obligatoire.** Avec `NODE_ENV=production` dans
  l'environnement, l'installation de la pile élague les devDependencies ;
  sans `typescript`, Next ne sait plus lire les alias de chemins de
  `tsconfig.json` et la construction échoue sur `Can't resolve '@/lib/...'`.
- **`NODE_ENV=production` est obligatoire aussi.** La pile démarre en
  `development` par défaut, ce qui fait échouer la génération de `/404` sur
  un message trompeur (`<Html> should not be imported outside of
  pages/_document`) qui n'a rien à voir avec le code.
- **`ecosystem.config.js` pilote le démarrage.** La pile est en variante
  `-pm2` et ne lit **jamais** `scripts.start` du `package.json`.

À rejouer après tout redémarrage du nœud et après une installation Let's
Encrypt, qui en déclenche une elle-même.

## Variables d'environnement

Posées dans le panneau **Variables** du nœud applicatif (216658), pas dans un
fichier. La liste complète et le rôle de chacune sont dans `CLAUDE.md`.

**Le piège à connaître, il a coûté deux pannes le 13/09** : le panneau et le
processus sont deux choses différentes. Après avoir modifié une variable,
vérifier ce que le **processus** a réellement reçu :

```bash
pm2 env 0 | grep <NOM_DE_LA_VARIABLE>
```

`pm2 restart --update-env` ne suffit pas — il propage l'environnement du shell
appelant, donc l'ancienne valeur si la session était ouverte avant la
modification. **Redémarrer le nœud**, puis revérifier.

Sur un nœud Docker (GoTrue, PostgREST), l'équivalent est
`/proc/<pid>/environ` du vrai processus — **pas** `/proc/1/environ`, qui est
le lanceur de la plateforme et ne porte pas les variables applicatives :

```bash
P=$(pgrep -f '/usr/local/bin/auth' | tail -1); tr '\0' '\n' < /proc/$P/environ | grep GOTRUE_
```

Les `NEXT_PUBLIC_*` comptent **aux deux moments** : inlinées dans le bundle
navigateur au build, et relues dans `process.env` par le code serveur à
l'exécution. Une valeur changée sans reconstruction laisse donc le navigateur
sur l'ancienne ; une valeur absente au build fige `undefined` dans le bundle
et lève une exception côté client sans aucune trace côté serveur. Le contrôle
qui vaut est fonctionnel (charger une page qui en dérive), jamais un `grep`
sur le bundle.

## Tâches planifiées

| Tâche | Où | Cadence |
|---|---|---|
| Sauvegarde complète pgBackRest | `pg_cron`, dans la base (nœud 216075) | 3 h 30 GMT |
| `/api/cron/abonnements` | `.github/workflows/cron-abonnements.yml` | 2 h 00 |
| `/api/cron/contact-jira` | `.github/workflows/cron-contact-jira.yml` | 2 h 30 |

Virtuozzo n'offre **aucun** planificateur de tâches, ni sur les nœuds Docker
ni sur les piles natives : le seul « scheduler » proposé est Env Start/Stop,
qui éteint l'environnement. D'où `pg_cron` pour la base, et GitHub Actions
pour les deux crons applicatifs.

**Après tout redéploiement du nœud PostgreSQL**, `pgbackrest` disparaît (c'est
un paquet `apk`) et la sauvegarde nocturne échoue en silence. À rejouer :

```bash
apk add --no-cache pgbackrest && pgbackrest --stanza=jepatisse check
```

## Certificats

Let's Encrypt, installé par l'add-on du nœud équilibreur. Le renouvellement
est automatique.

**Après une réinstallation ou un changement de topologie**, revérifier
`/etc/nginx/nginx-jelastic.conf` : la plateforme le régénère, ce qui efface le
relèvement des tampons d'en-têtes (`client_header_buffer_size 4k`,
`large_client_header_buffers 8 32k`) posé pour les cookies de session. Les
réglages qui doivent survivre vont dans un fichier séparé de
`/etc/nginx/conf.d/`.

## Vérifier après déploiement

Six points, ceux de la vérification du 13/09 (§ 7.17) :

- [ ] `/` s'affiche, et `/connexion` accepte e-mail **et** Google
- [ ] mot de passe oublié : l'e-mail arrive réellement
- [ ] `/creer` : enregistrer une recette **avec photos** (exerce le dépôt signé
      vers le stockage objet)
- [ ] `/importer` : import par copier/coller (exerce `ANTHROPIC_API_KEY`)
- [ ] `/admin` avec un compte `role = admin`, et le lien « en tant que »
- [ ] `/profil` accessible connecté, redirigé vers `/connexion` sinon

Deux symptômes trompeurs, rencontrés en vrai :

- **« CORS Missing Allow Origin » sur un dépôt de photo** n'est presque jamais
  du CORS : un refus de signature TempURL (401) sort avant le contrôleur
  d'objet qui pose les en-têtes CORS. Vérifier
  `SWIFT_TEMPURL_KEY_PHOTOS` contre la clé du conteneur.
- **Un 504 sur un import IA** vient de l'équilibreur, pas du code :
  `proxy_read_timeout` vaut 60 s par défaut, et `maxDuration` était une
  directive Vercel, inerte ici.

## Résidu Vercel

**Aucun domaine ne pointe plus sur Vercel** depuis la phase 3 du lot A
(§ 7.21) — les quatre domaines publics sont sur Infomaniak, et les deux crons
tournent depuis GitHub Actions. Le projet **`mc`** reste techniquement en
place (URL `*.vercel.app`, aucun domaine attaché) : à retirer, avec le second
projet **`dev_jp`** (`mc-oqp7.vercel.app`), pour clore la phase 4.

**Ce qui bloquait cette suppression sans que ça se voie** : ces deux projets
construisent encore le dépôt à chaque push, et c'est leur `deployment_status`
qui déclenchait `jira-deploiement.yml`. Les supprimer aurait arrêté la chaîne
« ticket → Déployé → e-mail au demandeur » sans le moindre message d'erreur —
des déploiements réussis, et plus un seul ticket transitionné. Depuis
`deploiement-app.yml` (voir « Déployer `main` automatiquement »), la chaîne ne
dépend plus d'eux : **la phase 4 peut être close une fois ce workflow armé et
observé sur un vrai déploiement.**
