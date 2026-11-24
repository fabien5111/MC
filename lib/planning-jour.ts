// Vue « Par jour » d'En cuisine (`PlanningDayView`) : logique pure de
// présentation, testée (`planning-jour.test.ts`).
import { formatTime } from '@/lib/format';

// Palette fixe des fournées : la couleur d'une fournée est tirée de son id,
// donc stable d'un jour à l'autre et d'une visite à l'autre.
export const COULEURS_FOURNEE = ['#8a3b4a', '#4f7a5a', '#a8702a', '#3f5f86', '#7a4f8a', '#5f6b70'] as const;

export function couleurFournee(id: number): string {
  const n = COULEURS_FOURNEE.length;
  return COULEURS_FOURNEE[((Math.trunc(id) % n) + n) % n];
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

// Nombre de colonnes de la vue semaine selon la largeur de la fenêtre.
export function colonnesSemaine(largeur: number): number {
  if (largeur >= 1600) return 7;
  if (largeur >= 1280) return 5;
  return 4;
}

// Minutes de travail actif d'une journée (préparation + cuisson, hors repos).
export function travailActif(items: { prep_time: number | null; cook_time: number | null }[]): number {
  return items.reduce((t, it) => t + (it.prep_time || 0) + (it.cook_time || 0), 0);
}
