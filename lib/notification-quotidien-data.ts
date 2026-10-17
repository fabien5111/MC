// Passe quotidienne du moteur de notifications (rappels de fournée +
// récapitulatifs) — SERVEUR UNIQUEMENT. Un seul code pour ses deux appelants :
// `GET /api/cron/notifications` (tâche GitHub et son rattrapage) et la boucle
// interne (`lib/outbox-boucle.ts`), qui la joue elle aussi dès 05:30 UTC au
// lieu d'attendre un créneau GitHub parfois sauté ou retardé de plusieurs heures.
//
// Le jour est réservé en base (`reserverQuotidien`) : quel que soit l'appelant,
// la passe ne tourne qu'UNE fois par jour de Zurich. Rappels et récapitulatifs
// sont en outre dédoublonnés — un rejeu explicite (`?passe=quotidien`) reste
// sans danger.
import { envoyerRecapitulatifs, libererQuotidien, reserverQuotidien } from '@/lib/notification-jobs-data';
import { genererRappels } from '@/lib/notification-rappels-data';
import { quotidienARattraper } from '@/lib/notification-rappels';
import { enFile } from '@/lib/en-file';

/** Pause avant de retenter une réservation refusée ou une passe échouée (par processus). */
export const DELAI_NOUVEL_ESSAI_MS = 10 * 60_000;

export type ResultatQuotidienne = {
  rappels: Awaited<ReturnType<typeof genererRappels>>;
  recap: Awaited<ReturnType<typeof envoyerRecapitulatifs>>;
};

/**
 * Joue la passe : les rappels d'abord (ils peuvent alimenter la file des
 * récapitulatifs, qui part juste après), la file hebdomadaire en plus le lundi
 * (UTC). `libererSiEchec` : la réservation du jour est rendue, la suivante
 * réessaiera — un échec avant tout envoi ne condamne pas la journée.
 */
export async function jouerPasseQuotidienne(
  admin: unknown,
  maintenant: Date,
  options: { libererSiEchec: boolean },
): Promise<ResultatQuotidienne> {
  try {
    const rappels = await genererRappels(admin, maintenant);
    const recap = await envoyerRecapitulatifs(admin, { hebdo: maintenant.getUTCDay() === 1 });
    return { rappels, recap };
  } catch (e) {
    if (options.libererSiEchec) await libererQuotidien(admin);
    throw e;
  }
}

type EtatProcessus = { jourFait: string; pasAvant: number };
const g = globalThis as typeof globalThis & { __mcQuotidien?: EtatProcessus };
const etat = (): EtatProcessus => (g.__mcQuotidien ??= { jourFait: '', pasAvant: 0 });

/**
 * Rattrapage appelé à CHAQUE tour de la boucle : ne fait rien avant 05:30 UTC,
 * rien non plus une fois le jour joué. Sans la mémoire du processus, chaque
 * minute de la journée coûterait deux requêtes de réservation pour rien.
 *
 * Une réservation refusée (un autre appelant a joué le jour — la tâche GitHub —,
 * ou lecture impossible) n'est retentée que toutes les 10 minutes : le coût
 * reste négligeable et une panne passagère ne condamne pas la journée. Même
 * délai après un échec de la passe. Sérialisée avec les autres appels du
 * processus (`enFile`) : jamais deux passes en même temps.
 *
 * Renvoie le résultat si la passe a été jouée par cet appel, sinon `null`.
 */
export function rattraperQuotidienne(admin: unknown, maintenant: Date = new Date()): Promise<ResultatQuotidienne | null> {
  return enFile('passe-quotidienne', async () => {
    const jour = quotidienARattraper(maintenant);
    const e = etat();
    if (!jour || e.jourFait === jour || maintenant.getTime() < e.pasAvant) return null;
    if (!(await reserverQuotidien(admin, jour))) {
      e.pasAvant = maintenant.getTime() + DELAI_NOUVEL_ESSAI_MS;
      return null;
    }
    try {
      const r = await jouerPasseQuotidienne(admin, maintenant, { libererSiEchec: true });
      e.jourFait = jour;
      return r;
    } catch (err) {
      e.pasAvant = maintenant.getTime() + DELAI_NOUVEL_ESSAI_MS;
      throw err;
    }
  });
}
