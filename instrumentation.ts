// Point d'entrée de démarrage du serveur Next.js (stable depuis Next 15) :
// `register()` est appelée une fois, au démarrage du processus.
//
// Seul usage : lancer la boucle de vidange de la file de notifications
// (`lib/outbox-boucle.ts`), qui remplace une tâche planifiée GitHub trop
// irrégulière. Elle ne démarre que si `OUTBOX_BOUCLE=true`.
export async function register() {
  // Ni dans le runtime Edge, ni pendant `next build` (qui peut évaluer ce fichier
  // pour collecter les pages : aucune base à vider à ce moment-là).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { demarrerVidangeOutbox } = await import('@/lib/outbox-boucle');
  demarrerVidangeOutbox();
}
