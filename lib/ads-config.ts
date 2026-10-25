// Emplacements publicitaires du site — référentiel volontairement tenu en
// code, pas en base : un emplacement est une position dans une page (accueil,
// fiche recette…). Le porter en table laisserait croire qu'on peut en ajouter
// un depuis l'admin sans toucher au code, ce qui serait faux.
//
// Nommage : tout ce qui atteint le navigateur porte un nom neutre — composant
// `PartnerSlot`, classe CSS `encart-partenaire`, route admin
// `/admin/partenaires`. Les bloqueurs de publicité filtrent sur des sélecteurs
// et des chemins contenant « ad » ou « pub » : une régie maison ainsi nommée
// serait masquée chez une partie des visiteurs. Le nom métier reste en base
// (table `ads`) et dans les modules serveur.

export type AdSlotKey = 'home_top' | 'home_mid' | 'search_list' | 'recipe_inline' | 'sidebar';

export type AdSlotConfig = {
  key: AdSlotKey;
  label: string;
  /** Où l'encart apparaît — texte d'aide de l'écran d'administration. */
  where: string;
  format: 'bandeau_fin' | 'bandeau_large' | 'pave';
  /** Fond dégradé (accueil, recherche) ou sobre (fiche recette) : conserver les
   *  deux évite de retoucher le dessin des pages existantes. */
  tone: 'gradient' | 'plain';
  /** Largeur maximale de compression du visuel (data-URL, cf. lib/images.ts). */
  maxWidth: number;
  /** Dimensions conseillées, affichées à la saisie. */
  hint: string;
  /** Proportions de l'aperçu dans l'administration. */
  previewAspect: string;
  /** Rendu plusieurs fois sur une même page → rotation par index du bandeau. */
  repeated?: boolean;
  /** Visuels facultatifs propres à la tablette et au téléphone (JEP-367) :
   *  les champs ci-dessus décrivent le visuel « ordinateur », qui reste
   *  obligatoire et sert de repli. */
  variantes: Record<AdVariante, AdFormatVisuel>;
};

// Appareils (JEP-367). Seuils alignés sur ceux de Tailwind (`rail` = 701 px,
// `lg` = 1024 px), qui découpent déjà les pages du site : un iPad mini en
// portrait (744 px) reçoit le visuel tablette.
export type AdAppareil = 'desktop' | 'tablet' | 'mobile';
export type AdVariante = Exclude<AdAppareil, 'desktop'>;

export type AdFormatVisuel = { maxWidth: number; hint: string; previewAspect: string };

export const AD_APPAREILS: { key: AdAppareil; label: string; icon: string; plage: string }[] = [
  { key: 'desktop', label: 'Ordinateur', icon: 'computer', plage: 'à partir de 1024 px' },
  { key: 'tablet', label: 'Tablette', icon: 'tablet', plage: 'de 701 à 1023 px' },
  { key: 'mobile', label: 'Téléphone', icon: 'smartphone', plage: 'moins de 701 px' },
];

// Colonne de chaque visuel. Les deux variantes ont été ajoutées à la main
// (DDL par `psql`) : elles peuvent manquer à la lecture, d'où le `?` de `Ad`.
export const AD_COLONNE_IMAGE = {
  desktop: 'image_url',
  tablet: 'image_url_tablet',
  mobile: 'image_url_mobile',
} as const satisfies Record<AdAppareil, string>;

const BANDEAU_VARIANTES: Record<AdVariante, AdFormatVisuel> = {
  tablet: { maxWidth: 1024, hint: '1024 × 300 px', previewAspect: 'aspect-[1024/300]' },
  mobile: { maxWidth: 750, hint: '750 × 400 px', previewAspect: 'aspect-[750/400]' },
};

export const AD_SLOTS: AdSlotConfig[] = [
  {
    key: 'home_top',
    label: 'Accueil — bandeau haut',
    where: "Page d'accueil, juste sous la bannière.",
    format: 'bandeau_large',
    tone: 'gradient',
    maxWidth: 1600,
    hint: '1600 × 320 px',
    previewAspect: 'aspect-[5/1]',
    variantes: BANDEAU_VARIANTES,
  },
  {
    key: 'home_mid',
    label: 'Accueil — bandeau central',
    where: "Page d'accueil, entre les catégories et les dernières créations.",
    format: 'bandeau_large',
    tone: 'gradient',
    maxWidth: 1600,
    hint: '1600 × 320 px',
    previewAspect: 'aspect-[5/1]',
    variantes: BANDEAU_VARIANTES,
  },
  {
    key: 'search_list',
    label: 'Recherche — entre les résultats',
    where: 'Page de résultats, après chaque bloc de deux lignes de recettes.',
    format: 'bandeau_large',
    tone: 'gradient',
    maxWidth: 1600,
    hint: '1600 × 320 px',
    previewAspect: 'aspect-[5/1]',
    repeated: true,
    variantes: BANDEAU_VARIANTES,
  },
  {
    key: 'recipe_inline',
    label: 'Fiche recette — avant les étapes',
    where: 'Fiche recette, entre les ingrédients et le déroulé des étapes.',
    format: 'bandeau_large',
    tone: 'plain',
    maxWidth: 1400,
    hint: '1400 × 280 px',
    previewAspect: 'aspect-[5/1]',
    variantes: BANDEAU_VARIANTES,
  },
  {
    key: 'sidebar',
    label: 'Fiche recette — colonne latérale',
    where: 'Colonne de droite de la fiche recette, sous les recettes suggérées.',
    format: 'pave',
    tone: 'gradient',
    maxWidth: 800,
    hint: '800 × 1000 px (format portrait)',
    previewAspect: 'aspect-[4/5]',
    // Sous 1024 px, la colonne latérale passe sous la fiche, en pleine
    // largeur : un pavé portrait y occuperait tout l'écran.
    variantes: {
      tablet: { maxWidth: 1024, hint: '1024 × 560 px', previewAspect: 'aspect-[1024/560]' },
      mobile: { maxWidth: 750, hint: '750 × 900 px', previewAspect: 'aspect-[750/900]' },
    },
  },
];

export function adSlotConfig(key: string): AdSlotConfig | undefined {
  return AD_SLOTS.find((s) => s.key === key);
}

// Ligne telle que lue par l'administration : sans le visuel, une data-URL de
// plusieurs centaines de kilo-octets n'ayant rien à faire dans une liste (il
// est rechargé à l'ouverture du formulaire).
export type AdRow = {
  id: number;
  slot: AdSlotKey;
  name: string;
  link_url: string | null;
  title: string | null;
  subtitle: string | null;
  cta_label: string | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
  priority: number;
};

// Campagne effectivement diffusée : les visuels en plus, `active` implicite
// (filtré à la lecture). Variantes absentes tant que la migration JEP-367
// n'est pas passée.
export type Ad = Omit<AdRow, 'active'> & {
  image_url: string | null;
  image_url_tablet?: string | null;
  image_url_mobile?: string | null;
};

export type AdSources = { desktop: string; tablet: string; mobile: string };

/**
 * Visuel servi à chaque appareil, avec repli : le téléphone prend le sien,
 * sinon celui de la tablette, sinon celui de l'ordinateur ; la tablette le
 * sien, sinon celui de l'ordinateur. `null` sans visuel « ordinateur » : il
 * est le seul obligatoire, une variante seule ne fait pas un encart illustré
 * (l'ordinateur afficherait le repli texte, le téléphone une image).
 */
export function adSources(ad: Pick<Ad, 'image_url' | 'image_url_tablet' | 'image_url_mobile'>): AdSources | null {
  if (!ad.image_url) return null;
  const tablet = ad.image_url_tablet || ad.image_url;
  return { desktop: ad.image_url, tablet, mobile: ad.image_url_mobile || tablet };
}

export type AdsBySlot = Partial<Record<AdSlotKey, Ad[]>>;

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export type AdStatus = { label: string; cls: string };

// Statistiques (table `ad_events`) — cf. lib/ads.ts pour la lecture agrégée.
export type AdEventType = 'impression' | 'click';

export type AdStats = {
  impressions: number;
  clicks: number;
  // Séparés dès la lecture : le taux de clic par segment (clics ÷ affichages
  // du même segment) est le repère qui a du sens, une répartition brute des
  // clics serait trompeuse si les deux publics n'ont pas le même volume
  // d'affichages.
  impressionsLoggedIn: number;
  impressionsAnonymous: number;
  clicksLoggedIn: number;
  clicksAnonymous: number;
};

export const EMPTY_AD_STATS: AdStats = {
  impressions: 0,
  clicks: 0,
  impressionsLoggedIn: 0,
  impressionsAnonymous: 0,
  clicksLoggedIn: 0,
  clicksAnonymous: 0,
};

// Taux de clic affiché ; `—` plutôt que 0 % quand il n'y a pas eu d'affichage
// (un taux de 0 % laisserait croire à une mesure, pas à une absence de donnée).
export function ctrLabel(clicks: number, impressions: number): string {
  if (impressions === 0) return '—';
  return `${((clicks / impressions) * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

// Statut affiché dans le tableau d'administration. `active = false` prime sur
// les dates : c'est la coupure immédiate, qui ne doit pas se confondre avec
// une campagne simplement terminée.
export function adStatus(row: { active: boolean; start_date: string; end_date: string | null }): AdStatus {
  const today = todayStr();
  if (!row.active) return { label: 'Inactive', cls: 'bg-surface-container-highest text-on-surface-variant' };
  if (today < row.start_date) return { label: 'À venir', cls: 'bg-secondary-container text-on-secondary-container' };
  if (row.end_date && today > row.end_date) return { label: 'Terminée', cls: 'bg-surface-container-highest text-on-surface-variant' };
  return { label: 'En cours', cls: 'bg-primary text-on-primary' };
}
