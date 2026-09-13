# Déploiement

Le site tourne sur **Infomaniak** — Virtuozzo Cloud pour l'application et la
base, Public Cloud (Swift) pour les photos. La migration depuis Vercel +
Supabase est documentée pas à pas dans `docs/migration-infomaniak.md` ; ce
fichier ne décrit que l'état courant et les gestes d'exploitation.

> **Bascule en cours.** `dev.jepatisse.com` est servi depuis Virtuozzo.
> `www.jepatisse.com` et les domaines de redirection sont **encore sur
> Vercel** (phase 3 du lot A, § 7.16 du dossier de migration) — ils affichent
> la page d'attente `COMING_SOON`. Les deux hébergements pointent sur la
> **même** base Infomaniak.

## Les environnements Virtuozzo

Deux environnements distincts, et c'est structurel : le moteur d'un
environnement Jelastic est figé à sa création. `jepatisse` porte une image
Docker à l'étage applicatif, ce qui y interdit les piles natives — d'où un
second environnement pour l'application. L'effet de bord est heureux : un
redéploiement applicatif, le geste le plus fréquent, ne peut pas atteindre la
base.

| Environnement | Nœud | Rôle |
|---|---|---|
| `jepatisse-app` | 216658 | Application Next.js (pile Node.js 22.x native, `pm2`) |
| `jepatisse-app` | 216680 | Équilibreur NGINX — TLS de `dev.jepatisse.com` |
| `jepatisse` | 216115 | Équilibreur NGINX — TLS de `auth.jepatisse.com`, tient le rôle de Kong sur `/auth/v1/` et `/rest/v1/` |
| `jepatisse` | 216075 | PostgreSQL 17.6 (image `supabase/postgres`) |
| `jepatisse` | 216114 | GoTrue (authentification) |
| `jepatisse` | 216242 | PostgREST (API REST sur la base) |

Région : **Genève**. Application et base partagent la plateforme et la région
— aucune requête ne traverse une frontière réseau lointaine.

## Construire et déployer l'application

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
