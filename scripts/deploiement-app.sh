#!/usr/bin/env bash
# Construction et redémarrage de l'application SUR le nœud applicatif (216658).
#
# Ce script ne s'exécute jamais sur le runner GitHub : il lui est envoyé par
# l'entrée standard (`ssh … 'bash -s' -- <sha> … < scripts/deploiement-app.sh`,
# cf. .github/workflows/deploiement-app.yml). Il vit donc dans le dépôt — la
# version déployée est toujours celle du commit déployé — sans jamais avoir à
# être copié ni maintenu à la main sur le nœud.
#
# Il reprend VERBATIM la commande canonique de DEPLOY.md :
#
#     npm ci --include=dev && rm -rf .next && NODE_ENV=production npm run build
#
# et ses trois pièges (chacun a coûté une panne) : `--include=dev` obligatoire
# sans quoi `typescript` manque et les alias `@/…` ne résolvent plus ;
# `NODE_ENV=production` obligatoire sans quoi la génération de `/404` échoue
# sur un message trompeur ; `ecosystem.config.js` pilote le démarrage, jamais
# `scripts.start`.
#
# LA FENÊTRE À CONNAÎTRE. `rm -rf .next` précède la construction : entre les
# deux, le site n'a plus de build. Une construction qui échoue ici laisse donc
# l'application en panne jusqu'à correction. C'est précisément la raison
# d'être du travail `controle` du workflow appelant, qui rejoue `typecheck`,
# `build` et la suite de tests sur le runner AVANT d'ouvrir cette connexion :
# un commit qui ne compile pas n'atteint jamais le nœud. On garde malgré tout
# l'ordre documenté plutôt que de l'improviser ici — c'est la procédure
# éprouvée, et la barrière amont est le bon endroit pour couvrir son défaut.
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

echo "→ Construction"
rm -rf .next
NODE_ENV=production npm run build

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

# Jamais `--update-env` : il propage l'environnement du shell appelant — donc
# celui de cette session SSH — et remplacerait les variables que la plateforme
# a posées sur le processus. C'est exactement le piège documenté dans
# DEPLOY.md, qui a coûté deux pannes le 13/09. Un redémarrage simple recharge
# le code neuf en gardant l'environnement du processus.
"$PM2" restart "$APP_PM2"
"$PM2" status

echo "── Déploiement terminé sur le nœud ──"
