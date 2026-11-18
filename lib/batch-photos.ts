// Photos de réalisation d'une fournée (JEP-382) — logique PURE (constantes,
// validation, regroupements), importable côté serveur comme côté client.
// Lecture : `lib/batch-photos-data.ts` ; écriture : `lib/batch-photos-client.ts`.
//
// Un journal photo PRIVÉ par fournée : visible du seul propriétaire (RLS
// `owns_plan`), jamais sur la fiche publique ni le profil public. Les objets
// sont sur `jp-photos` (conteneur public, arbitrage du 07/11/2026) sous le
// préfixe `realisations/` : l'URL est un UUID non devinable, pas un secret —
// la page Confidentialité le dit. Une photo ne devient publique, au sens de
// « affichée à d'autres », que si le membre la choisit pour son avis.

export const BATCH_PHOTOS_MAX = 8;
export const LEGENDE_MAX = 200;

/** Largeur de la photo pleine et de sa vignette (calculées dans le navigateur au dépôt). */
export const PHOTO_LARGEUR = 1600;
export const VIGNETTE_LARGEUR = 480;

export type BatchPhoto = {
  id: number;
  batch_id: number;
  batch_step_id: number | null;
  url: string;
  thumb_url: string | null;
  legende: string | null;
  order_index: number;
  created_at: string;
};

/** Photos d'une fournée lues par la page ; `disponible` faux = table absente (migration pas jouée). */
export type PhotosFourneeInitiales = { disponible: boolean; photos: BatchPhoto[] };

/** Table absente (migration pas jouée) : silencieux, la fonctionnalité est masquée. */
export function estTableAbsente(e: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!e) return false;
  return /42P01|PGRST205/.test(e.code ?? '') || /does not exist|Could not find the table/i.test(e.message ?? '');
}

/** Légende nettoyée : espaces de bord retirés, vide → `null`, tronquée à `LEGENDE_MAX`. */
export function normaliserLegende(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t ? t.slice(0, LEGENDE_MAX) : null;
}

export function placesRestantes(photos: readonly unknown[]): number {
  return Math.max(0, BATCH_PHOTOS_MAX - photos.length);
}

/** `order_index` d'une photo ajoutée : après la dernière. */
export function prochainOrdre(photos: readonly Pick<BatchPhoto, 'order_index'>[]): number {
  return photos.reduce((m, p) => Math.max(m, p.order_index), -1) + 1;
}

/** Ordre d'affichage : `order_index`, puis date de dépôt. */
export function trierPhotos<T extends Pick<BatchPhoto, 'order_index' | 'created_at'>>(photos: readonly T[]): T[] {
  return [...photos].sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at));
}

/** Photos rattachées à une étape donnée. */
export function photosDeEtape<T extends Pick<BatchPhoto, 'batch_step_id' | 'order_index' | 'created_at'>>(
  photos: readonly T[],
  stepId: number,
): T[] {
  return trierPhotos(photos.filter((p) => p.batch_step_id === stepId));
}

/**
 * Nouveaux `order_index` après l'échange de deux photos d'une même étape
 * (glisser-déposer ou flèches). Seules les photos dont l'ordre change sont
 * rendues. Les ordres existants sont réutilisés dans leur ordre croissant ; s'ils
 * ne sont pas tous distincts (dépôts simultanés), on renumérote à partir du plus
 * petit pour que l'échange soit visible. Rien si l'une des photos manque ou si
 * elles ne sont pas de la même étape.
 */
export function ordresApresEchange(
  photos: readonly Pick<BatchPhoto, 'id' | 'batch_step_id' | 'order_index' | 'created_at'>[],
  idA: number,
  idB: number,
): { id: number; ordre: number }[] {
  const a = photos.find((p) => p.id === idA);
  const b = photos.find((p) => p.id === idB);
  if (!a || !b || idA === idB || a.batch_step_id !== b.batch_step_id) return [];
  const liste = trierPhotos(photos.filter((p) => p.batch_step_id === a.batch_step_id));
  const i = liste.findIndex((p) => p.id === idA);
  const j = liste.findIndex((p) => p.id === idB);
  const apres = [...liste];
  [apres[i], apres[j]] = [apres[j], apres[i]];
  const valeurs = liste.map((p) => p.order_index);
  const distinctes = new Set(valeurs).size === valeurs.length;
  const ordres = distinctes ? valeurs : valeurs.map((_, n) => valeurs[0] + n);
  return apres
    .map((p, n) => ({ id: p.id, ordre: ordres[n], avant: p.order_index }))
    .filter((x) => x.ordre !== x.avant)
    .map(({ id, ordre }) => ({ id, ordre }));
}

/** Une photo de galerie (« Mes réalisations »), avec la fournée qui la porte. */
export type Realisation = BatchPhoto & {
  fournee: { id: number; recipe_id: string | null; titre: string; date: string | null };
};

export type GroupeRealisations = {
  fourneeId: number;
  titre: string;
  date: string | null;
  photos: Realisation[];
};

/**
 * Regroupe les photos par fournée, la fournée la plus récente d'abord (date de
 * dégustation prévue, sinon date de la dernière photo) ; dans une fournée,
 * l'ordre de la fournée.
 */
export function grouperParFournee(photos: readonly Realisation[]): GroupeRealisations[] {
  const groupes = new Map<number, GroupeRealisations & { recente: string }>();
  for (const p of photos) {
    const g = groupes.get(p.fournee.id);
    if (g) {
      g.photos.push(p);
      if (p.created_at > g.recente) g.recente = p.created_at;
    } else {
      groupes.set(p.fournee.id, {
        fourneeId: p.fournee.id,
        titre: p.fournee.titre,
        date: p.fournee.date,
        photos: [p],
        recente: p.created_at,
      });
    }
  }
  return [...groupes.values()]
    .sort((a, b) => (b.date ?? b.recente.slice(0, 10)).localeCompare(a.date ?? a.recente.slice(0, 10)) || b.recente.localeCompare(a.recente))
    .map((g) => ({ fourneeId: g.fourneeId, titre: g.titre, date: g.date, photos: trierPhotos(g.photos) }));
}
