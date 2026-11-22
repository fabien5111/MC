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

// Variante de la relecture d'import (22/11/2026) : l'IA rend souvent des
// attentes en minutes brutes (« 260 min ») que l'auteur n'a pas choisies. Au-
// delà de 90 min, on les présente en heures, même hors de la demi-heure
// (260 → 4,33 h, `heuresMinutesTexte` en donne la valeur exacte). L'aller-
// retour reste sans perte : 2 décimales d'heure = 0,3 min d'écart au plus.
export function uniteImport(minutes: number | null | undefined): UniteDuree {
  return minutes != null && minutes > 90 ? 'h' : uniteParDefaut(minutes);
}

// « 4 h 20 » / « 4 h » — rappel exact d'une durée affichée en heures décimales.
export function heuresMinutesTexte(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

// Minutes → texte du champ dans l'unité donnée (point décimal : c'est ce
// qu'attend un `<input type="number">`).
export function depuisMinutes(minutes: number | null | undefined, unite: UniteDuree): string {
  if (minutes == null) return '';
  if (unite === 'min') return String(minutes);
  return String(Math.round((minutes / 60) * 100) / 100);
}
