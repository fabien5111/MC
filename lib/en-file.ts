// Exécution « une à la fois » par clé — module PUR, sans effet de bord au
// chargement.
//
// Sert à sérialiser un traitement qui ne supporte pas d'être joué deux fois en
// même temps dans le même processus : la vidange de la file de notifications,
// appelée à la fois par la boucle interne (`lib/outbox-boucle.ts`) et par la
// route `GET /api/cron/notifications`. Sans cela, deux vidanges simultanées
// liraient les mêmes lignes non traitées et notifieraient deux fois.
//
// **La file vit sur `globalThis`**, pas dans une variable de module : le
// middleware, les routes et l'instrumentation sont empaquetés séparément par
// Next et chacun aurait sa propre copie du module — donc sa propre file, qui ne
// sérialiserait rien (même piège que le cache d'état d'un compte bloqué).
//
// Garantie limitée à UN processus. `pm2` tourne en une seule instance
// (`ecosystem.config.js`) : c'est suffisant ici, et c'est une raison de plus de
// ne jamais passer à plusieurs instances sans repenser cela.
type Files = Map<string, Promise<unknown>>;
const g = globalThis as typeof globalThis & { __mcEnFile?: Files };

/**
 * Joue `tache` après la fin (réussie ou non) de la précédente tâche de la même
 * clé. Le résultat — ou l'échec — de `tache` est rendu tel quel à l'appelant ;
 * un échec ne bloque jamais les suivantes.
 */
export function enFile<T>(cle: string, tache: () => Promise<T>): Promise<T> {
  const files = (g.__mcEnFile ??= new Map());
  const precedente = files.get(cle) ?? Promise.resolve();
  const courante = precedente.then(tache, tache);
  files.set(
    cle,
    courante.then(
      () => undefined,
      () => undefined,
    ),
  );
  return courante;
}
