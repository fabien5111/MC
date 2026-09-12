// Fichier de gestionnaire de processus pm2 — c'est par lui que la pile
// Node.js de Virtuozzo démarre l'application (lot A, docs/migration-infomaniak.md § 7.16).
//
// POURQUOI CE FICHIER EXISTE. Le script de la pile (`/usr/local/sbin/nodejs`)
// ne consulte JAMAIS `scripts.start` de `package.json` sur le chemin pm2 : il
// exige soit un fichier de gestionnaire de processus, soit un fichier
// d'application détecté par son nom (`server.js`, `app.js`, `index.js` —
// aucun n'existe dans un projet App Router). Sans ce fichier, le service
// échoue au démarrage sans autre message que « Failed to start ».
//
// Un `server.js` aurait aussi satisfait la pile, mais un serveur Next.js
// personnalisé désactive une partie de l'optimisation statique. On lance donc
// `next start` tel quel.
module.exports = {
  apps: [
    {
      name: 'je-patisse',
      // Le binaire de Next directement plutôt que `npm start` : pm2 supervise
      // alors le processus réel, et non un npm intermédiaire qui brouille la
      // transmission des signaux d'arrêt.
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3000',

      // UNE SEULE INSTANCE, ET CE N'EST PAS UN RÉGLAGE DE CONFORT.
      // `unstable_cache` et `revalidateTag` (8 fichiers) sont mémorisés PAR
      // PROCESSUS : à deux instances, une invalidation prononcée sur l'une
      // laisserait l'autre servir indéfiniment la valeur périmée, sans erreur
      // ni symptôme visible. Passer à plusieurs instances impose d'abord un
      // `cacheHandler` partagé (Redis). Cf. `docs/note-regression-cache.md`.
      instances: 1,
      exec_mode: 'fork',

      // Le port n'est pas imposé par la plateforme : elle détecte celui que
      // l'application écoute et installe une redirection nft depuis le 80.
      // On le fixe quand même pour que cette détection soit déterministe.
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },

      autorestart: true,
      // Le nœud est plafonné à 24 cloudlets (3 Go). On redémarre avant la
      // limite du conteneur plutôt que de se faire tuer par le noyau, ce qui
      // ne laisserait aucune trace lisible.
      max_memory_restart: '2G',
    },
  ],
};
