// Saisie d'une durée en minutes OU en heures (JEP-20), pour les temps
// d'attente : une nuit au réfrigérateur se tape « 12 h », pas « 720 ».
// La base garde des minutes entières ; seule la saisie change d'unité.
// Pur, utilisable côté serveur comme côté client.

export type UniteDuree = 'min' | 'h';

// Raccourci « Une nuit » des champs d'attente.
export const DUREE_NUIT_MIN = 12 * 60;

// Texte saisi (virgule ou point décimal) dans l'unité choisie → minutes
// entières, ou `null` si le champ est vide ou illisible. Une valeur négative
// vaut 0, comme les champs en minutes qu'il remplace.
export function versMinutes(texte: string, unite: UniteDuree): number | null {
  const t = texte.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(unite === 'h' ? n * 60 : n));
}

// Unité dans laquelle présenter une durée déjà enregistrée : les heures dès
// 1 h, si la valeur tombe sur la demi-heure (720 → 12 h, 90 → 1,5 h) ;
// sinon les minutes, pour ne jamais afficher « 1,2833 h ».
export function uniteParDefaut(minutes: number | null | undefined): UniteDuree {
  return minutes != null && minutes >= 60 && minutes % 30 === 0 ? 'h' : 'min';
}

// Minutes → texte du champ dans l'unité donnée (point décimal : c'est ce
// qu'attend un `<input type="number">`).
export function depuisMinutes(minutes: number | null | undefined, unite: UniteDuree): string {
  if (minutes == null) return '';
  if (unite === 'min') return String(minutes);
  return String(Math.round((minutes / 60) * 100) / 100);
}
