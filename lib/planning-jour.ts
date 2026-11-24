// Vue « Par jour » d'En cuisine (`PlanningDayView`) : logique pure de
// présentation, testée (`planning-jour.test.ts`).
import { formatTime } from '@/lib/format';

// Palette des fournées : teintes franches et lisibles par les daltoniens
// (d'après Okabe-Ito, foncées pour tenir sur fond blanc), dans un ordre où
// deux voisines sont toujours bien distinctes. Le bordeaux du site vient tard :
// en tête, il se confondrait avec les titres et les boutons.
export const COULEURS_FOURNEE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00', '#56B4E9', '#8A1C3B', '#7A5C2E'] as const;

// Repli : couleur tirée de l'id, pour une fournée absente de la table par rang.
export function couleurFournee(id: number): string {
  const n = COULEURS_FOURNEE.length;
  return COULEURS_FOURNEE[((Math.trunc(id) % n) + n) % n];
}

// Couleur par RANG d'apparition (`planIds` dans l'ordre du planning, doublons
// admis) : la première fournée prend la première teinte, etc. — les 8 premières
// sont ainsi garanties distinctes, ce qu'une couleur tirée de l'id ne garantit
// pas. Affichage seul, jamais enregistré : la couleur d'une fournée peut changer
// quand une fournée plus ancienne quitte le planning.
export function couleursParRang(planIds: number[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const id of planIds) {
    if (!m.has(id)) m.set(id, COULEURS_FOURNEE[m.size % COULEURS_FOURNEE.length]);
  }
  return m;
}

// Regroupe les étapes CONSÉCUTIVES d'une même fournée sous un seul en-tête.
// Jamais un regroupement global par fournée : l'ordre de la journée
// (`day_order_index`, réordonné par le membre) peut alterner entre fournées
// (A, B, A), et il doit rester celui qu'on voit — l'en-tête réapparaît alors à
// chaque changement.
export function grouperConsecutifs<T extends { planId: number }>(items: T[]): { planId: number; items: T[] }[] {
  const out: { planId: number; items: T[] }[] = [];
  for (const it of items) {
    const dernier = out[out.length - 1];
    if (dernier && dernier.planId === it.planId) dernier.items.push(it);
    else out.push({ planId: it.planId, items: [it] });
  }
  return out;
}

export type TempsEtape = {
  prep_time: number | null;
  wait_time: number | null;
  cook_time: number | null;
  cook_temp: number | null;
};

// Temps d'une étape en une ligne : « 20 min prép · 1h repos · 25 min à 170 °C »
// et, s'il y a plus d'une composante, le total à part (affiché en gras).
// `resteSeul` : étape déjà faite mais pas terminée — la préparation est
// derrière, il ne reste que la cuisson (même règle que l'ancien affichage).
export function tempsEtape(it: TempsEtape, resteSeul = false): { parties: string[]; total: string | null } {
  const parties: string[] = [];
  if (it.prep_time && !resteSeul) parties.push(`${formatTime(it.prep_time)} prép`);
  if (it.wait_time && !resteSeul) parties.push(`${formatTime(it.wait_time)} repos`);
  if (it.cook_time) parties.push(`${formatTime(it.cook_time)} ${it.cook_temp ? `à ${it.cook_temp} °C` : 'cuisson'}`);
  else if (it.cook_temp) parties.push(`cuisson à ${it.cook_temp} °C`);
  const minutes = (resteSeul ? 0 : (it.prep_time || 0) + (it.wait_time || 0)) + (it.cook_time || 0);
  const nb = parties.length;
  return { parties, total: nb > 1 && minutes > 0 ? formatTime(minutes) : null };
}

// Déplacement d'une étape d'un cran dans sa journée (« Monter » / « Descendre »
// de la feuille d'actions). `null` si elle est déjà en tête / en fin.
export function indexDeplacement(idx: number, longueur: number, sens: -1 | 1): number | null {
  const cible = idx + sens;
  return cible < 0 || cible >= longueur ? null : cible;
}

// Date du jour au format `YYYY-MM-DD`, dans le fuseau du NAVIGATEUR (jamais
// `toISOString`, qui donne la date UTC).
export function dateIsoLocale(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Vue semaine (ordinateur) : premier jour affiché.
//  - le premier jour qui porte une étape non terminée, s'il est passé ou
//    aujourd'hui (on reprend là où on en est, retard compris) ;
//  - sinon (tout est fait jusqu'à aujourd'hui, ou rien n'est en cours),
//    aujourd'hui — à défaut le premier jour planifié qui suit ;
//  - sinon (tout est dans le passé), le dernier jour planifié.
// `jours` est trié par date croissante. `aujourdhui` nul (pas encore connu
// côté navigateur) : le premier jour non terminé, quel qu'il soit.
export function premierJourAffiche(jours: { date: string; incomplet: boolean }[], aujourdhui: string | null): number {
  if (jours.length === 0) return 0;
  const premierIncomplet = jours.findIndex((j) => j.incomplet);
  if (aujourdhui === null) return premierIncomplet >= 0 ? premierIncomplet : 0;
  if (premierIncomplet >= 0 && jours[premierIncomplet].date <= aujourdhui) return premierIncomplet;
  const aVenir = jours.findIndex((j) => j.date >= aujourdhui);
  return aVenir >= 0 ? aVenir : jours.length - 1;
}

// Vue semaine : largeur minimale d'une colonne de jour, et plafond.
export const COLONNE_MIN_PX = 260;
export const COLONNES_MAX = 5;
const ECART_COLONNES_PX = 12; // `gap-3` de la grille

// Nombre de colonnes de la vue semaine d'après la largeur RÉELLEMENT disponible
// (pas celle de la fenêtre) : autant que possible sans descendre sous
// `COLONNE_MIN_PX`, entre 2 et `COLONNES_MAX`.
export function colonnesSemaine(largeur: number): number {
  const n = Math.floor((largeur + ECART_COLONNES_PX) / (COLONNE_MIN_PX + ECART_COLONNES_PX));
  return Math.max(2, Math.min(COLONNES_MAX, n));
}

// Minutes de travail actif d'une journée (préparation + cuisson, hors repos).
export function travailActif(items: { prep_time: number | null; cook_time: number | null }[]): number {
  return items.reduce((t, it) => t + (it.prep_time || 0) + (it.cook_time || 0), 0);
}

// Ajoute `n` jours (négatif : retire) à une date `YYYY-MM-DD`, en calendrier
// LOCAL : `setDate` suit les changements d'heure, jamais une addition de
// 24 h en millisecondes.
export function ajouterJoursIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateIsoLocale(d);
}

// `nb` jours calendaires consécutifs à partir de `debut` (inclus), jours vides
// compris : la vue semaine garde ainsi une grille pleine et sans saut de date.
export function joursConsecutifs(debut: string, nb: number): string[] {
  return Array.from({ length: Math.max(0, nb) }, (_, i) => ajouterJoursIso(debut, i));
}

// Nombre de jours entre une étape déplacée et la dégustation de sa fournée :
// la valeur à écrire dans `batch_steps.day_offset` (jours AVANT la dégustation)
// pour que l'étape tombe le `dateCible`. Négatif = après la dégustation, ce que
// le modèle n'admet pas. Calendrier LOCAL, arrondi pour absorber un changement
// d'heure (23 h ou 25 h entre deux minuits).
export function decalageVersDate(datePlanifiee: string, dateCible: string): number {
  const a = new Date(datePlanifiee + 'T00:00:00').getTime();
  const b = new Date(dateCible + 'T00:00:00').getTime();
  return Math.round((a - b) / 86400000);
}

// Nouvel ordre d'une journée quand une étape y est déposée : devant `avantId`
// (sinon en fin de journée), l'étape déposée étant d'abord retirée de la liste
// si elle y figurait déjà. Rend les identifiants dans l'ordre définitif.
export function ordreApresDepot(ids: number[], deposeId: number, avantId: number | null): number[] {
  const reste = ids.filter((x) => x !== deposeId);
  const i = avantId === null ? -1 : reste.indexOf(avantId);
  if (i < 0) return [...reste, deposeId];
  return [...reste.slice(0, i), deposeId, ...reste.slice(i)];
}
