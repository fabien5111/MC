// Rédaction des textes d'une recette par IA (JEP-414) — logique pure.
//
// L'IA propose, le membre décide : aucune proposition n'est écrite sans un
// geste (« Ajouter », « Remplacer », ou « Ajouter la sélection »). Deux usages,
// une seule route (`POST /api/recette/rediger`) :
//   - un CHAMP à la fois (bouton à côté du champ), 1 crédit ;
//   - « Compléter avec l'IA » : tous les champs VIDES d'un coup, 1 crédit par
//     tranche de 3 champs, 2 au minimum (`coutCompletion`).
//
// Le navigateur envoie la recette telle qu'elle est dans l'éditeur (rien n'est
// encore enregistré) ; le serveur la borne (`normaliserRecette`) et RECOMPTE
// lui-même les champs vides : annoncer moins de champs ne fait pas payer moins.
//
// Module sans accès base : lu par la route, l'invite IA et les composants.
import { ADVANCE_NOTE_MAX } from '@/lib/recipe-view';
import type { EtatCredits } from '@/lib/credits-ia';

/** Clé de droit (grille des formules) : PLUS, PRO, essai PRO. */
export const DROIT_REDACTION = 'redaction_ia';

/** Ce que la page transmet à l'éditeur : droit de la formule et solde. */
export type EtatRedaction = { acces: boolean; credits: EtatCredits | null };

/** Champs que l'IA sait proposer. */
export const CHAMPS_REDACTION = ['description', 'conseils', 'degustation', 'conseil_etape', 'avance_etape'] as const;
export type ChampRedaction = (typeof CHAMPS_REDACTION)[number];

/** Champs de la recette (les autres sont portés par une étape). */
export const CHAMPS_RECETTE: readonly ChampRedaction[] = ['description', 'conseils', 'degustation'];

export const LIBELLE_CHAMP: Record<ChampRedaction, string> = {
  description: 'Description',
  conseils: 'Conseils et astuces de la recette',
  degustation: 'Dégustation et conservation',
  conseil_etape: 'Conseils de l’étape',
  avance_etape: 'Préparation à l’avance',
};

/** Longueur maximale d'une proposition, par champ (garde-fou côté serveur). */
export const LONGUEUR_MAX: Record<ChampRedaction, number> = {
  description: 600,
  conseils: 900,
  degustation: 700,
  conseil_etape: 400,
  avance_etape: ADVANCE_NOTE_MAX,
};

// ── Coûts : écrits dans lib/credits-ia.ts (seul endroit), ré-exportés ici ──

export {
  COUT_REDACTION_CHAMP,
  CHAMPS_PAR_CREDIT,
  COUT_COMPLETION_MIN,
  ETAPES_MAX_COMPLETION,
  coutCompletion,
} from '@/lib/credits-ia';
import { ETAPES_MAX_COMPLETION } from '@/lib/credits-ia';

// ── Recette telle que l'éditeur la décrit ───────────────────

export type EtapeRedaction = {
  titre: string;
  /** Description ou sous-étapes, une par ligne. */
  texte: string;
  /** « 200 g Farine — tamisée », une ligne par ingrédient. */
  ingredients: string[];
  /** « Préparation 20 min · Cuisson 25 min à 180 °C », facultatif. */
  temps: string;
  conseils: string;
  avance: boolean;
  avanceNote: string;
};

export type RecetteRedaction = {
  titre: string;
  description: string;
  /** Rendement en clair (« 8 parts », « Cercle Ø 22 cm »), facultatif. */
  rendement: string;
  etapes: EtapeRedaction[];
  conseils: string;
  degustation: string;
};

export type CibleRedaction = { champ: ChampRedaction; etape?: number };

const ETAPES_MAX = 40;
const INGREDIENTS_MAX = 40;

const chaine = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Borne la recette envoyée par le navigateur : longueurs, nombre d'étapes et
 * d'ingrédients. `null` si elle est inexploitable (ni titre ni étape).
 */
export function normaliserRecette(input: unknown): RecetteRedaction | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const etapes: EtapeRedaction[] = (Array.isArray(r.etapes) ? r.etapes : []).slice(0, ETAPES_MAX).map((e) => {
    const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    return {
      titre: chaine(o.titre, 160),
      texte: chaine(o.texte, 3000),
      ingredients: (Array.isArray(o.ingredients) ? o.ingredients : [])
        .slice(0, INGREDIENTS_MAX)
        .map((i) => chaine(i, 200))
        .filter(Boolean),
      temps: chaine(o.temps, 200),
      conseils: chaine(o.conseils, 1500),
      avance: o.avance === true,
      avanceNote: chaine(o.avanceNote, ADVANCE_NOTE_MAX),
    };
  });
  const recette: RecetteRedaction = {
    titre: chaine(r.titre, 160),
    description: chaine(r.description, 2000),
    rendement: chaine(r.rendement, 300),
    etapes,
    conseils: chaine(r.conseils, 3000),
    degustation: chaine(r.degustation, 2000),
  };
  if (!recette.titre && !etapes.some((e) => e.titre || e.texte || e.ingredients.length)) return null;
  return recette;
}

/** Une étape porte-t-elle quelque chose sur quoi l'IA peut s'appuyer ? */
function etapeRenseignee(e: EtapeRedaction): boolean {
  return Boolean(e.titre || e.texte || e.ingredients.length);
}

/** La cible désigne-t-elle un champ qui existe dans cette recette ? */
export function cibleValide(r: RecetteRedaction, c: CibleRedaction): boolean {
  if (!CHAMPS_REDACTION.includes(c.champ)) return false;
  if (CHAMPS_RECETTE.includes(c.champ)) return c.etape == null;
  return Number.isInteger(c.etape) && (c.etape as number) >= 0 && (c.etape as number) < r.etapes.length && etapeRenseignee(r.etapes[c.etape as number]);
}

/** Lit une cible envoyée par le navigateur. */
export function lireCible(v: unknown): CibleRedaction | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.champ !== 'string' || !CHAMPS_REDACTION.includes(o.champ as ChampRedaction)) return null;
  const champ = o.champ as ChampRedaction;
  if (CHAMPS_RECETTE.includes(champ)) return { champ };
  const etape = Number(o.etape);
  return Number.isInteger(etape) && etape >= 0 ? { champ, etape } : null;
}

/**
 * Champs VIDES que « Compléter avec l'IA » proposerait de remplir, dans
 * l'ordre de l'éditeur : la recette, puis chaque étape (conseils, préparation
 * à l'avance). Préparation à l'avance « vide » = case non cochée (l'IA dit si
 * l'étape s'y prête) ou case cochée sans note (l'IA propose la note).
 * Au-delà de `ETAPES_MAX_COMPLETION` étapes, les suivantes sont ignorées et
 * comptées dans `etapesIgnorees`. Une étape sans titre, texte ni ingrédient
 * n'est pas proposée : l'IA n'aurait rien à lire.
 */
export function champsVides(r: RecetteRedaction): { cibles: CibleRedaction[]; etapesIgnorees: number } {
  const cibles: CibleRedaction[] = [];
  if (!r.description) cibles.push({ champ: 'description' });
  if (!r.conseils) cibles.push({ champ: 'conseils' });
  if (!r.degustation) cibles.push({ champ: 'degustation' });
  let traitees = 0;
  let etapesIgnorees = 0;
  r.etapes.forEach((e, i) => {
    if (!etapeRenseignee(e)) return;
    const aRemplir = !e.conseils || !e.avance || !e.avanceNote;
    if (!aRemplir) return;
    if (traitees >= ETAPES_MAX_COMPLETION) {
      etapesIgnorees += 1;
      return;
    }
    traitees += 1;
    if (!e.conseils) cibles.push({ champ: 'conseil_etape', etape: i });
    if (!e.avance || !e.avanceNote) cibles.push({ champ: 'avance_etape', etape: i });
  });
  return { cibles, etapesIgnorees };
}

/** Clé stable d'une cible (`conseil_etape:3`). */
export function cleCible(c: CibleRedaction): string {
  return c.etape == null ? c.champ : `${c.champ}:${c.etape}`;
}

/** Texte actuel du champ visé (vide si absent). */
export function valeurActuelle(r: RecetteRedaction, c: CibleRedaction): string {
  if (c.champ === 'description') return r.description;
  if (c.champ === 'conseils') return r.conseils;
  if (c.champ === 'degustation') return r.degustation;
  const e = c.etape != null ? r.etapes[c.etape] : undefined;
  if (!e) return '';
  return c.champ === 'conseil_etape' ? e.conseils : e.avanceNote;
}

// ── Propositions rendues par l'IA ───────────────────────────

/**
 * Une proposition. Pour la préparation à l'avance, `possible` dit si l'étape
 * s'y prête ; `texte` est alors la note (vide si impossible).
 */
export type PropositionRedaction = CibleRedaction & { texte: string; possible?: boolean };

/**
 * Ne garde de la réponse de l'IA que les cibles DEMANDÉES, une fois chacune,
 * bornées en longueur. Une proposition vide est écartée, sauf « préparation à
 * l'avance impossible », qui est une réponse (à afficher, rien à ajouter).
 */
export function normaliserPropositions(raw: unknown, cibles: CibleRedaction[]): PropositionRedaction[] {
  const liste = Array.isArray((raw as { propositions?: unknown })?.propositions)
    ? ((raw as { propositions: unknown[] }).propositions)
    : [];
  const attendues = new Map(cibles.map((c) => [cleCible(c), c]));
  const vues = new Set<string>();
  const sortie: PropositionRedaction[] = [];
  for (const p of liste) {
    const cible = lireCible(p);
    if (!cible) continue;
    const cle = cleCible(cible);
    if (!attendues.has(cle) || vues.has(cle)) continue;
    const o = p as Record<string, unknown>;
    let texte = typeof o.texte === 'string' ? o.texte.trim() : '';
    if (cible.champ === 'avance_etape') {
      texte = texte.replace(/\s+/g, ' ').slice(0, ADVANCE_NOTE_MAX).trim();
      const possible = o.possible !== false;
      if (possible && !texte) continue;
      vues.add(cle);
      sortie.push({ ...cible, possible, texte: possible ? texte : '' });
      continue;
    }
    texte = texte.slice(0, LONGUEUR_MAX[cible.champ]).trim();
    if (!texte) continue;
    vues.add(cle);
    sortie.push({ ...cible, texte });
  }
  // Ordre de l'éditeur, quel que soit celui de la réponse.
  const rang = new Map(cibles.map((c, i) => [cleCible(c), i]));
  return sortie.sort((a, b) => (rang.get(cleCible(a)) ?? 0) - (rang.get(cleCible(b)) ?? 0));
}

// ── Écriture dans le champ ──────────────────────────────────

/**
 * « Ajouter » : le texte proposé rejoint le champ. Champ vide → la proposition
 * seule ; sinon l'existant, une ligne vide, puis la proposition (arbitrage du
 * 19/11/2026 : pas de trait, il s'afficherait tel quel sur la fiche publique).
 */
export function ajouterTexte(existant: string | null | undefined, ajout: string): string {
  const a = (existant ?? '').replace(/\s+$/, '');
  const b = ajout.trim();
  if (!b) return a;
  return a.trim() ? `${a}\n\n${b}` : b;
}

/**
 * Note de préparation à l'avance : une seule ligne, 200 caractères. Ajoutée à
 * une note existante tant que ça tient, remplacée sinon (le membre l'a vue
 * dans la proposition).
 */
export function ajouterNoteAvance(existant: string | null | undefined, ajout: string): string {
  const a = (existant ?? '').replace(/\s+/g, ' ').trim();
  const b = ajout.replace(/\s+/g, ' ').trim();
  if (!a) return b.slice(0, ADVANCE_NOTE_MAX);
  const ensemble = `${a} ${b}`;
  return ensemble.length <= ADVANCE_NOTE_MAX ? ensemble : b.slice(0, ADVANCE_NOTE_MAX);
}

// ── Mise en texte pour l'invite ─────────────────────────────

/** La recette en texte lisible, étapes numérotées à partir de 1. */
export function texteRecette(r: RecetteRedaction): string {
  const l: string[] = [];
  l.push(`TITRE : ${r.titre || '(sans titre)'}`);
  if (r.rendement) l.push(`RENDEMENT : ${r.rendement}`);
  if (r.description) l.push(`DESCRIPTION ACTUELLE :\n${r.description}`);
  r.etapes.forEach((e, i) => {
    l.push('');
    l.push(`ÉTAPE ${i + 1}${e.titre ? ` — ${e.titre}` : ''}`);
    if (e.temps) l.push(`Temps : ${e.temps}`);
    if (e.ingredients.length) l.push(`Ingrédients :\n${e.ingredients.map((x) => `- ${x}`).join('\n')}`);
    if (e.texte) l.push(`Déroulé :\n${e.texte}`);
    if (e.conseils) l.push(`Conseils actuels : ${e.conseils}`);
    if (e.avance) l.push(`Préparable à l'avance : oui${e.avanceNote ? ` (${e.avanceNote})` : ''}`);
  });
  if (r.conseils) l.push(`\nCONSEILS ACTUELS DE LA RECETTE :\n${r.conseils}`);
  if (r.degustation) l.push(`\nDÉGUSTATION ET CONSERVATION ACTUELLES :\n${r.degustation}`);
  return l.join('\n');
}

/** Libellé humain d'une cible (« Conseils de l'étape 3 »). */
export function libelleCible(c: CibleRedaction, titreEtape?: string): string {
  if (c.etape == null) return LIBELLE_CHAMP[c.champ];
  const n = `Étape ${c.etape + 1}${titreEtape ? ` — ${titreEtape}` : ''}`;
  return `${n} · ${c.champ === 'conseil_etape' ? 'conseils' : 'préparation à l’avance'}`;
}

/** Durée affichée dans le contexte : « 20 min », « 1h30 ». */
export function texteDuree(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min <= 0) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h} h`;
}

/** « Préparation 20 min · Cuisson 25 min à 180 °C · Repos 1 h ». */
export function texteTemps(t: { prep?: number | null; cook?: number | null; wait?: number | null; temp?: number | null }): string {
  const p: string[] = [];
  if (texteDuree(t.prep)) p.push(`Préparation ${texteDuree(t.prep)}`);
  if (texteDuree(t.cook)) p.push(`Cuisson ${texteDuree(t.cook)}${t.temp ? ` à ${t.temp} °C` : ''}`);
  if (texteDuree(t.wait)) p.push(`Repos ${texteDuree(t.wait)}`);
  return p.join(' · ');
}

/** « 200 g Farine — tamisée ». */
export function ligneIngredient(i: { name?: string | null; qty?: string | null; unit?: string | null; comment?: string | null }): string {
  // `String(...)` : une quantité importée peut arriver sous forme de nombre.
  const nom = String(i.name ?? '').trim();
  if (!nom) return '';
  const q = [String(i.qty ?? '').trim(), String(i.unit ?? '').trim()].filter(Boolean).join(' ');
  const c = String(i.comment ?? '').trim();
  return `${q ? `${q} ` : ''}${nom}${c ? ` — ${c}` : ''}`;
}

/** Nombre entier d'un champ texte (« 20 » → 20), `null` sinon. */
export function minutes(v: string | number | null | undefined): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
