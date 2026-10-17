// Garde du middleware pour un compte suspendu ou désactivé (JEP-272) : un
// membre bloqué se connecte (plus de bannissement GoTrue) mais n'a accès qu'à
// `/compte-suspendu` — cf. `cheminOuvertAuCompteBloque`, `lib/moderation.ts`.
//
// Le middleware s'exécute sur CHAQUE requête : lire le statut en base à chaque
// fois coûterait une requête par page (la leçon de `docs/note-regression-cache.md`).
// La ligne de modération est donc mise en cache **en mémoire du processus**
// pour 60 s par membre — `pm2` n'a qu'une instance — et seul un membre
// connecté la paie, au plus une fois par minute. Le cache garde la LIGNE, pas
// un booléen : une suspension datée échoit toute seule (`etatModeration`).
//
// Il vit sur `globalThis` parce que le middleware et les Route Handlers sont
// empaquetés séparément : sans cela, `invaliderBlocage()` (appelé par la route
// de modération) viderait un cache que le middleware ne voit pas.
//
// Tolérant aux pannes, comme le reste du middleware : clé service_role absente
// ou lecture en échec = « non bloqué ». Le contrôle fin reste dans
// `requireUser()` et la RLS ; cette garde n'ajoute que le renvoi des pages
// publiques.
import { createAdminClient } from '@/lib/supabase/admin';
import { estBloque, etatModeration, type LigneModeration } from '@/lib/moderation';
import { lireLigneModeration } from '@/lib/moderation-lecture';

const DUREE_CACHE_MS = 60_000;

type Entree = { ligne: LigneModeration | null; expire: number };
type Cache = Map<string, Entree>;

const g = globalThis as typeof globalThis & { __mcBlocage?: Cache };
function cache(): Cache {
  return (g.__mcBlocage ??= new Map());
}

/** Le membre est-il bloqué (suspendu non échu, ou désactivé) ? */
export async function membreBloqueEnCache(userId: string, maintenant: Date = new Date()): Promise<boolean> {
  const c = cache();
  let entree = c.get(userId);
  if (!entree || entree.expire <= maintenant.getTime()) {
    let ligne: LigneModeration | null = null;
    try {
      ligne = await lireLigneModeration(createAdminClient(), userId);
    } catch {
      // Clé absente ou panne : non bloqué, sans mémoriser l'échec.
      return false;
    }
    entree = { ligne, expire: maintenant.getTime() + DUREE_CACHE_MS };
    c.set(userId, entree);
    // Borne la mémoire : un processus qui voit passer des milliers de membres.
    if (c.size > 5000) for (const k of c.keys()) { c.delete(k); if (c.size <= 4000) break; }
  }
  return estBloque(etatModeration(entree.ligne, maintenant));
}

/** À appeler après toute écriture du statut d'un membre : effet immédiat. */
export function invaliderBlocage(userId: string): void {
  cache().delete(userId);
}
