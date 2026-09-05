// Lot B3 — déclaration des cibles (pure : aucun accès réseau, aucune clé).
// Importable côté client pour afficher l'écran admin sans y tirer la clé
// service_role. L'écriture elle-même (Supabase, signature TempURL) vit dans
// `lib/backfill-data.ts`, server-only — même séparation que `ideas.ts` /
// `ideas-data.ts`.
//
// Cf. docs/migration-infomaniak.md § 7.5 (lot B3).
import type { Usage } from '@/lib/storage';

export type TableCible =
  | 'recipes'
  | 'step_photos'
  | 'profiles'
  | 'tags'
  | 'allergens'
  | 'site_settings'
  | 'ads'
  | 'articles'
  | 'contact_message_photos'
  | 'contact_reply_photos';

export type CibleScalaire = {
  table: TableCible;
  // Colonne d'identité de la ligne. `id` partout, sauf `site_settings`
  // (clé primaire `key`).
  cle: string;
  // Une ou plusieurs colonnes texte de CETTE table, chacune migrée
  // indépendamment : une ligne peut avoir l'une déjà migrée et l'autre non.
  colonnes: string[];
  usage: Usage;
  label: string;
};

// `imports.recette` est explicitement hors périmètre (§ 5.3) ; `profiles.
// cover_url` n'a aucune ligne à reprendre (colonne vide, § 7.5) ; `tags.
// category_picto` et `allergens.picto` n'ont aucun chemin d'écriture
// APPLICATIF (§ 7.5 étape 1) mais sont couvertes ici quand même — le B3 lit
// et écrit directement en base, il n'a pas besoin d'écran pour ça,
// contrairement au B2.
export const CIBLES_BACKFILL = {
  recettes: {
    table: 'recipes',
    cle: 'id',
    colonnes: ['hero_image_url', 'hero_image_original_url', 'hero_thumb_url', 'hero_card_url'],
    usage: 'recette',
    label: 'Recettes — photo principale et dérivés',
  },
  etapes: {
    table: 'step_photos',
    cle: 'id',
    colonnes: ['url', 'original_url'],
    usage: 'recette',
    label: 'Photos d’étape',
  },
  profils: {
    table: 'profiles',
    cle: 'id',
    colonnes: ['avatar_url', 'banner_url'],
    usage: 'profil',
    label: 'Avatars et bannières de profil',
  },
  pictosTags: {
    table: 'tags',
    cle: 'id',
    colonnes: ['category_picto'],
    usage: 'referentiel',
    label: 'Pictogrammes de catégories',
  },
  pictosAllergenes: {
    table: 'allergens',
    cle: 'id',
    colonnes: ['picto'],
    usage: 'referentiel',
    label: 'Pictogrammes d’allergènes',
  },
  bannieresSite: {
    table: 'site_settings',
    cle: 'key',
    colonnes: ['value'],
    usage: 'banniere',
    label: 'Bannières d’accueil',
  },
  publicites: {
    table: 'ads',
    cle: 'id',
    colonnes: ['image_url'],
    usage: 'publicite',
    label: 'Publicités',
  },
  articlesBlog: {
    table: 'articles',
    cle: 'id',
    colonnes: ['cover_image_url'],
    usage: 'article',
    label: 'Couvertures d’articles de blog',
  },
  photosContact: {
    table: 'contact_message_photos',
    cle: 'id',
    colonnes: ['url'],
    usage: 'contact',
    label: 'Photos jointes à une demande de contact',
  },
  photosReponsesContact: {
    table: 'contact_reply_photos',
    cle: 'id',
    colonnes: ['url'],
    usage: 'contact',
    label: 'Photos jointes à une réponse de contact',
  },
} as const satisfies Record<string, CibleScalaire>;

export type CleCible = keyof typeof CIBLES_BACKFILL;

export function estCleCible(v: unknown): v is CleCible {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CIBLES_BACKFILL, v);
}

// `commentaires` n'est pas dans `CIBLES_BACKFILL` : sa forme
// (`comments.photo_urls`, un tableau JSON) ne rentre pas dans
// `CibleScalaire` et se traite à part (`traiterLotCommentairesPhotos`).
// Rassemblée ici uniquement pour que l'écran admin affiche les onze cibles
// du § 7.5 dans un seul ordre, du plus léger au plus lourd — même ordre que
// la table de mesure.
export const CLE_COMMENTAIRES = 'commentaires' as const;

export const CIBLES_ORDRE: { cle: string; label: string }[] = [
  { cle: CLE_COMMENTAIRES, label: 'Avis — photos jointes' },
  ...Object.entries(CIBLES_BACKFILL).map(([cle, c]) => ({ cle, label: c.label })),
];
