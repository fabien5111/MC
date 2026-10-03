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
