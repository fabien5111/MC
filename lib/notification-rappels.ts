// Calculs de dates des rappels de fournée (JEP-280) — PUR.
//
// **Tout se calcule en `Europe/Zurich`, pas en UTC.** Le cron tourne à
// 05:30 UTC, soit 6 h 30 ou 7 h 30 en Suisse : le jour calendaire est le même,
// mais un cron qui retarderait (GitHub le fait) au-delà de minuit UTC, ou une
// comparaison de dates faite en UTC, ferait partir « le rappel d'aujourd'hui »
// la veille ou le lendemain. La date d'une fournée (`planned_date`) est un jour
// civil local : on la compare à un jour civil local.
const FUSEAU = 'Europe/Zurich';

/** Jour civil (AAAA-MM-JJ) de l'instant donné, en heure de Zurich. */
export function dateZurich(instant: Date): string {
  // `en-CA` formate en AAAA-MM-JJ.
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    instant,
  );
}

/** Ajoute `n` jours à un jour civil AAAA-MM-JJ (calcul en UTC pur : aucun saut d'heure d'été). */
export function ajouterJours(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

/** Jour auquel tombe une étape : la dégustation moins son décalage (`day_offset`, ≥ 0). */
export function jourDEtape(plannedDate: string, dayOffset: number | null | undefined): string {
  return ajouterJours(plannedDate, -Math.max(0, dayOffset || 0));
}

export type EtapeRappel = { title: string; day_offset: number | null; done: boolean };

/** Titres des étapes non faites qui tombent AUJOURD'HUI. */
export function etapesACommencer(etapes: EtapeRappel[], plannedDate: string, aujourdhui: string): string[] {
  return etapes.filter((e) => !e.done && jourDEtape(plannedDate, e.day_offset) === aujourdhui).map((e) => e.title);
}

/**
 * La fournée a-t-elle déjà commencé ? Vrai si l'une de ses étapes (faite ou
 * non) tombe aujourd'hui ou avant : le rappel de la veille ne peut plus dire
 * « commence demain » (JEP-375).
 */
export function fourneeDejaCommencee(etapes: EtapeRappel[], plannedDate: string, aujourdhui: string): boolean {
  return etapes.some((e) => jourDEtape(plannedDate, e.day_offset) <= aujourdhui);
}

/** Heure UTC (minutes depuis minuit) du créneau quotidien : 05:30, cf. cron-notifications.yml. */
const MINUTE_QUOTIDIEN_UTC = 5 * 60 + 30;

/**
 * Jour à rattraper par la passe quotidienne, ou `null` si son heure n'est pas
 * encore venue. GitHub retarde souvent les tâches planifiées, voire en saute :
 * le 04/10/2026, trois passes `outbox` seulement avaient tourné en douze heures
 * et la passe de 05:30 UTC jamais. N'importe quelle passe `outbox` passée ce
 * créneau peut donc jouer la quotidienne du jour, une fois (cf.
 * `reserverQuotidien`). Avant 05:30 UTC, on ne devance pas l'horaire normal.
 *
 * **Le jour UTC et le jour de Zurich doivent coïncider.** Entre 22 h (été) ou
 * 23 h (hiver) et minuit UTC, Zurich est déjà au lendemain alors que l'heure
 * UTC, elle, est bien « après 05:30 » : sans ce garde-fou, la boucle jouait la
 * passe du lendemain à 0 h 02 heure suisse (relevé du 22 et du 23/10/2026) —
 * rappels de fournée et leurs push partis en pleine nuit, sur un téléphone en
 * veille. Le lendemain attend donc son propre créneau de 05:30 UTC.
 */
export function quotidienARattraper(maintenant: Date): string | null {
  const minutes = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
  if (minutes < MINUTE_QUOTIDIEN_UTC) return null;
  const jour = dateZurich(maintenant);
  return jour === maintenant.toISOString().slice(0, 10) ? jour : null;
}
