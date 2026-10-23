#!/usr/bin/env bash
# Construction et redémarrage de l'application SUR le nœud applicatif (216658).
#
# Ce script ne s'exécute jamais sur le runner GitHub : il lui est envoyé par
# l'entrée standard (`ssh … 'bash -s' -- <sha> … < scripts/deploiement-app.sh`,
# cf. .github/workflows/deploiement-app.yml). Il vit donc dans le dépôt — la
# version déployée est toujours celle du commit déployé — sans jamais avoir à
# être copié ni maintenu à la main sur le nœud.
#
# Il reprend la commande canonique de DEPLOY.md, à une différence près — le
# build se fait À CÔTÉ de celui qui est en service (JEP-299) :
#
#     npm ci --include=dev && NEXT_DIST_DIR=.next-construction NODE_ENV=production npm run build
#
# puis bascule par deux renommages. Ses trois pièges restent (chacun a coûté
# une panne) : `--include=dev` obligatoire sans quoi `typescript` manque et les
# alias `@/…` ne résolvent plus ; `NODE_ENV=production` obligatoire sans quoi
# la génération de `/404` échoue sur un message trompeur ;
# `ecosystem.config.js` pilote le démarrage, jamais `scripts.start`.
#
# POURQUOI CONSTRUIRE À CÔTÉ. Jusqu'au 04/10/2026, le script faisait
# `rm -rf .next` AVANT de construire. Ce soir-là, la construction a échoué sur
# le nœud alors que le contrôle du runner était vert (téléchargement d'une
# police chez Google — depuis supprimé, cf. `app/fonts.ts`) : pm2 tournait
# encore sur l'ancienne version en mémoire, mais les fichiers JavaScript
# qu'elle référençait avaient disparu du disque — `ChunkLoadError` et écran
# d'erreur sur tout ce qui charge du code à la demande, une demi-heure durant.
# Désormais le `.next` servi n'est touché qu'une fois la construction RÉUSSIE :
#
#     .next               → .next-precedent   (version en service, gardée)
#     .next-construction  → .next             (nouvelle version)
#
# puis `pm2 restart`. Une construction qui échoue laisse `.next` intact, le
# site continue de servir la version précédente, et le script sort en erreur
# (workflow au rouge, comme avant).
#
# Ce qui a été vérifié avant d'adopter le renommage : Next inscrit le nom du
# dossier de build dans les modules compilés (`distDir:".next-construction"`),
# mais `next start` — lancé sans `NEXT_DIST_DIR`, donc sur `.next` — sert
# pages, chunks et caches depuis `.next` sans jamais recréer ni lire
# `.next-construction`. Contrôlé sur un build complet renommé (pages
# dynamiques, statiques, chunks JS, sitemap, image OG : tout en 200).
#
# Entre les deux renommages, il n'existe aucun `.next` pendant quelques
# microsecondes : une requête qui tomberait exactement là chercherait un
# fichier absent. Assumé — contre une demi-heure de panne auparavant.
#
# Espace disque : deux builds coexistent pendant la construction (le servi et
# celui de travail), puis le précédent est gardé jusqu'au déploiement
# suivant, qui le supprime avant de construire. Il permet de revenir en
# arrière à la main (DEPLOY.md, « Revenir à la version précédente »).
#
# Aucun argument n'est deviné : tout arrive en positionnel, parce que les
# variables d'environnement ne traversent pas SSH sans `SendEnv`/`AcceptEnv`
# côté serveur — s'en remettre à elles produirait des valeurs vides, donc un
# déploiement dans le mauvais répertoire.
set -euo pipefail

SHA="${1:-}"
RACINE="${2:-/home/jelastic/ROOT}"
APP_PM2="${3:-je-patisse}"

echouer() {
  echo "ERREUR : $1" >&2
  exit 1
}

[ -n "$SHA" ] || echouer "SHA à déployer attendu en premier argument."

echo "── Déploiement de $SHA dans $RACINE (application pm2 « $APP_PM2 ») ──"

cd "$RACINE" || echouer "Répertoire $RACINE introuvable sur le nœud."

# LE PIÈGE DE LA SESSION NON INTERACTIVE — relevé du 14/09 sur le nœud 216658.
# `node`, `npm` et `pm2` y vivent sous /opt/.nvm/versions/node/<version>/bin,
# un répertoire que le PATH ne doit qu'au profil du shell INTERACTIF. Une
# commande lancée par `ssh … 'bash -s'` n'ouvre ni shell de connexion ni shell
# interactif : selon la façon dont bash a été construit, `~/.bashrc` peut
# n'être jamais lu — et `npm ci` échoue alors sur un « command not found » dès
# la première ligne utile, alors que la même commande marche parfaitement dans
# le Web SSH. On résout donc le répertoire ici plutôt que de parier sur un
# profil qu'on ne contrôle pas.
#
# Premier passage : le répertoire qui porte npm ET pm2, c'est-à-dire la
# version de Node sous laquelle la plateforme fait réellement tourner
# l'application. Second passage, plus tolérant, si les deux sont dissociés.
if ! command -v npm >/dev/null 2>&1 || ! command -v pm2 >/dev/null 2>&1; then
  for repertoire in /opt/.nvm/versions/node/*/bin "$HOME"/.nvm/versions/node/*/bin; do
    if [ -x "$repertoire/npm" ] && [ -x "$repertoire/pm2" ]; then
      PATH="$repertoire:$PATH"
      echo "   PATH complété : $repertoire"
      break
    fi
  done
fi
if ! command -v npm >/dev/null 2>&1; then
  for repertoire in /opt/.nvm/versions/node/*/bin "$HOME"/.nvm/versions/node/*/bin; do
    if [ -x "$repertoire/npm" ]; then
      PATH="$repertoire:$PATH"
      echo "   PATH complété : $repertoire"
      break
    fi
  done
fi
export PATH

command -v node >/dev/null 2>&1 || echouer "node introuvable sur le nœud, même après résolution du PATH. Vérifier l'installation de la pile Node.js."
command -v npm >/dev/null 2>&1 || echouer "npm introuvable sur le nœud, même après résolution du PATH. Vérifier l'installation de la pile Node.js."
echo "   node $(node -v) · npm $(npm -v)"

# Le dépôt doit être un clone git classique. S'il ne l'est pas (déploiement
# piloté par le panneau Jelastic, archive déposée à la main…), on s'arrête
# plutôt que de tenter une mise à jour qui n'a pas de sens ici : c'est un
# point de configuration à trancher côté console, pas à contourner.
[ -d .git ] || echouer "$RACINE n'est pas un clone git — ce script met à jour le code par « git fetch ». Vérifier le mode de déploiement du nœud (panneau Git de l'environnement) avant d'armer le workflow."

# `git fetch` d'abord la branche, puis remise à plat sur le SHA EXACT choisi
# par le workflow. Viser le SHA et non la pointe de la branche évite de
# déployer silencieusement un commit plus récent qu'un push arrivé entre le
# déclenchement et l'exécution — le contrôle amont ne l'aurait pas vérifié.
echo "→ Récupération du code"
git fetch --prune origin || echouer "« git fetch » a échoué. Le dépôt étant PUBLIC et le remote en HTTPS, la récupération est anonyme : aucun identifiant n'entre en jeu, chercher donc du côté du réseau sortant du nœud, pas des droits. Si le dépôt devenait privé un jour, c'est ici que ça casserait — il faudrait alors poser un assistant d'identifiants « store » sur le nœud (« cache » expire et ne revient pas tout seul dans un déploiement automatique)."
git reset --hard "$SHA" || echouer "« git reset --hard $SHA » a échoué — le commit n'a pas été récupéré."
git --no-pager log -1 --format='   %h %s (%an, %ad)' --date=short

echo "→ Installation des dépendances"
npm ci --include=dev

# Le précédent d'avant n'a plus d'usage : on rend sa place sur le disque AVANT
# de construire, pour ne jamais avoir trois builds à la fois. Le dossier de
# travail d'une tentative avortée (script interrompu) part avec.
echo "→ Construction (à côté du build en service)"
rm -rf .next-precedent .next-construction
if ! NEXT_DIST_DIR=.next-construction NODE_ENV=production npm run build; then
  rm -rf .next-construction
  # Next réécrit `tsconfig.json` pour y inclure les types du dossier de build ;
  # on remet le fichier versionné, sans attendre le prochain `git reset`.
  git checkout -- tsconfig.json 2>/dev/null || true
  echouer "La construction a échoué. Le build en service (.next) n'a pas été touché : le site continue de servir la version précédente, sans redémarrage."
fi
git checkout -- tsconfig.json 2>/dev/null || true

# Sans `BUILD_ID`, `next start` refuse de démarrer : un build sans lui n'est
# pas complet, on ne bascule pas dessus.
[ -f .next-construction/BUILD_ID ] || echouer "La construction a rendu la main sans produire .next-construction/BUILD_ID. Le build en service n'a pas été touché."

echo "→ Bascule sur le nouveau build"
if [ -d .next ]; then
  mv .next .next-precedent
fi
if ! mv .next-construction .next; then
  # Ne jamais rester sans `.next` : on remet la version précédente en place.
  [ -d .next-precedent ] && mv .next-precedent .next
  echouer "Le renommage .next-construction → .next a échoué. La version précédente a été remise en place ; aucun redémarrage n'a eu lieu."
fi
echo "   build en service : $(cat .next/BUILD_ID) (précédent gardé dans .next-precedent)"

# pm2 n'est pas forcément dans le PATH d'une session SSH non interactive : la
# pile Node.js de la plateforme l'installe hors des chemins standards selon
# les versions. On le cherche explicitement plutôt que d'échouer sur un
# « command not found » qui se lirait comme un problème de déploiement.
echo "→ Redémarrage"
PM2=""
if command -v pm2 >/dev/null 2>&1; then
  PM2="pm2"
else
  for chemin in /usr/local/bin/pm2 /usr/bin/pm2 /opt/.nvm/versions/node/*/bin/pm2 "$HOME"/.nvm/versions/node/*/bin/pm2 "$HOME/.npm-global/bin/pm2"; do
    if [ -x "$chemin" ]; then
      PM2="$chemin"
      break
    fi
  done
fi
[ -n "$PM2" ] || echouer "pm2 introuvable sur le nœud. Redémarrer l'application depuis le panneau Virtuozzo, puis signaler ce chemin manquant."

# AMORÇAGE D'UN NŒUD VIERGE — relevé du 14/09, à la création du nœud d'aperçu.
# `pm2 restart` échoue quand il n'a rien à redémarrer, ce qui est précisément
# l'état d'un nœud neuf : le premier déploiement n'aurait jamais pu réussir.
# Le démarrage n'a lieu que dans ce cas, et le contrôle qui le précède n'est
# pas une précaution de style — un `pm2 start` inconditionnel ferait tourner un
# SECOND processus sur le même port. La moitié des requêtes servirait alors
# l'ancien build, sans qu'aucune erreur ne le signale nulle part.
if "$PM2" describe "$APP_PM2" >/dev/null 2>&1; then
  # Jamais `--update-env` : il propage l'environnement du shell appelant — donc
  # celui de cette session SSH — et remplacerait les variables que la plateforme
  # a posées sur le processus. C'est exactement le piège documenté dans
  # DEPLOY.md, qui a coûté deux pannes le 13/09. Un redémarrage simple recharge
  # le code neuf en gardant l'environnement du processus.
  "$PM2" restart "$APP_PM2"
else
  echo "   « $APP_PM2 » inconnu de pm2 — premier démarrage depuis ecosystem.config.js."
  "$PM2" start ecosystem.config.js
  # Le nom vient de deux endroits qui peuvent diverger : le workflow (variable
  # APP_PM2) et `ecosystem.config.js`. S'ils ne concordent pas, chaque
  # déploiement relancerait un processus de plus en croyant amorcer un nœud
  # vierge. On le constate tout de suite plutôt qu'au cinquième.
  "$PM2" describe "$APP_PM2" >/dev/null 2>&1 || echouer "« $APP_PM2 » reste inconnu de pm2 après démarrage : le nom attendu par le workflow ne correspond pas à celui déclaré dans ecosystem.config.js. Aligner les deux avant de rejouer."
  "$PM2" save || echo "   (« pm2 save » a échoué — sans conséquence sur ce déploiement.)"
fi
"$PM2" status

echo "── Déploiement terminé sur le nœud ──"
