// Boucle interne de vidange de la file de notifications — SERVEUR UNIQUEMENT.
//
// POURQUOI ELLE EXISTE. Les événements nés d'une écriture du navigateur
// (favori, avis, abonné, validation…) sont posés dans `notification_outbox` par
// des triggers SQL, puis vidés par `GET /api/cron/notifications`. Cette route
// était appelée par une tâche planifiée GitHub censée tourner toutes les 15
// minutes. Mesuré le 17/10/2026 : 8 exécutions en 22 heures au lieu de 88, avec
// des trous de 2 à 4 heures — une cloche et des notifications sur le téléphone
// qui arrivent des heures en retard. GitHub ne garantit pas ses horaires
// (`schedule` est « au mieux », fortement espacé sous charge).
//
// CE QUE FAIT LA BOUCLE. Chaque minute, le processus de l'application vide
// lui-même la file : un seul SELECT quand elle est vide. Elle joue aussi la
// passe quotidienne (rappels de fournée, récapitulatifs) dès 05:30 UTC, une
// fois par jour (`rattraperQuotidienne`). La tâche GitHub reste
// en place comme filet de sécurité ; la vidange étant sérialisée par processus
// (`enFile`), les deux ne se marchent pas dessus.
//
// **EN OPT-IN** (`OUTBOX_BOUCLE=true`). L'aperçu de PR (`jepatisse-preview`)
// tourne avec de vrais secrets et la même base : une boucle active là-bas
// viderait la file EN CONCURRENCE avec la production, et la sérialisation ne
// vaut que dans un processus — chaque événement serait notifié deux fois. Seul
// le nœud applicatif de production pose la variable.
//
// Démarrée par `instrumentation.ts` ; la logique de boucle (`creerBoucle`) est
// pure et testée, le branchement réel (`demarrerVidangeOutbox`) ne fait que
// l'assembler.
import { createAdminClient } from '@/lib/supabase/admin';
import { viderOutbox } from '@/lib/notification-jobs-data';
import { rattraperQuotidienne } from '@/lib/notification-quotidien-data';

/** Période de la vidange. Une minute : l'attente maximale d'un favori, d'un avis, d'un abonné. */
export const INTERVALLE_VIDANGE_MS = 60_000;
/** Délai avant le premier tour : laisse le serveur finir de démarrer. */
export const DELAI_PREMIER_TOUR_MS = 15_000;

export type Boucle = { arreter: () => void };

type OptionsBoucle = {
  /** Délai avant le premier tour (défaut : une période). */
  delaiInitialMs?: number;
  /** Appelée quand un tour échoue — la boucle, elle, continue. */
  surErreur?: (erreur: unknown) => void;
};

/**
 * Joue `tache` toutes les `intervalleMs`. Un tour qui dure plus longtemps que la
 * période n'empile pas les suivants : ils sont sautés. Un échec n'arrête jamais
 * la boucle. Les minuteries sont « unref » : elles ne retiennent pas le
 * processus à l'arrêt.
 */
export function creerBoucle(tache: () => Promise<unknown>, intervalleMs: number, options: OptionsBoucle = {}): Boucle {
  let enCours = false;
  let arretee = false;

  const tour = async () => {
    if (enCours || arretee) return;
    enCours = true;
    try {
      await tache();
    } catch (e) {
      options.surErreur?.(e);
    } finally {
      enCours = false;
    }
  };

  const premier = setTimeout(() => void tour(), options.delaiInitialMs ?? intervalleMs);
  const periodique = setInterval(() => void tour(), intervalleMs);
  premier.unref?.();
  periodique.unref?.();

  return {
    arreter() {
      arretee = true;
      clearTimeout(premier);
      clearInterval(periodique);
    },
  };
}

const g = globalThis as typeof globalThis & { __mcBoucleOutbox?: Boucle };

/** La boucle est-elle demandée ? Un opt-in strict : seule la valeur `true` l'active. */
export function boucleOutboxActivee(env: Record<string, string | undefined> = process.env): boolean {
  return env.OUTBOX_BOUCLE === 'true';
}

/**
 * Démarre la boucle de vidange, une seule fois par processus (le rechargement
 * à chaud et un double appel de `register()` ne la dupliquent pas). Sans effet
 * si `OUTBOX_BOUCLE` n'est pas `true`.
 */
export function demarrerVidangeOutbox(): void {
  if (!boucleOutboxActivee() || g.__mcBoucleOutbox) return;

  // Même message d'erreur répété chaque minute : on ne le journalise qu'une fois,
  // tant qu'il ne change pas — sinon une clé absente noierait le journal.
  let derniereErreur = '';
  g.__mcBoucleOutbox = creerBoucle(
    async () => {
      const admin = createAdminClient();
      const r = await viderOutbox(admin);
      if (r.traites || r.echecs) {
        console.log(`notifications/boucle : ${r.traites} traité(s), ${r.echecs} échec(s)`);
      }
      // Puis la passe quotidienne (rappels de fournée, récapitulatifs), dès
      // 05:30 UTC : une fois par jour de Zurich, réservée en base, donc sans
      // doublon avec la tâche GitHub.
      const q = await rattraperQuotidienne(admin);
      if (q) {
        console.log(
          `notifications/boucle : passe quotidienne jouée — rappels ${JSON.stringify(q.rappels)}, récapitulatifs ${JSON.stringify(q.recap)}`,
        );
      }
      derniereErreur = '';
    },
    INTERVALLE_VIDANGE_MS,
    {
      delaiInitialMs: DELAI_PREMIER_TOUR_MS,
      surErreur: (e) => {
        const message = (e as Error)?.message ?? String(e);
        if (message === derniereErreur) return;
        derniereErreur = message;
        console.error('notifications/boucle : tour échoué :', message);
      },
    },
  );
  console.log(`notifications/boucle : démarrée, vidange de la file toutes les ${INTERVALLE_VIDANGE_MS / 1000} s`);
}
