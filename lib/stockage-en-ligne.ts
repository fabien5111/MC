// Stockages en ligne (JEP-408) — logique pure.
//
// Choisir une photo ou une source d'import directement dans Google Drive,
// Google Photos, Dropbox, OneDrive, OneNote ou Notion. Module SANS accès
// réseau ni `next/headers` : il est lu par les composants client (bouton
// « Depuis… ») comme par les routes serveur (passerelle Google Photos,
// Notion). Les adaptateurs qui parlent aux fournisseurs vivent dans
// `components/stockage/sources/`.
//
// Doctrine, rappelée ici parce qu'elle conditionne tout le reste :
//  - le fichier choisi est récupéré DANS LE NAVIGATEUR puis suit le chemin
//    d'un fichier local (compression `lib/images.ts`, dépôt signé Swift) ;
//  - aucun jeton d'accès n'est stocké, ni en base, ni dans le navigateur : il
//    vit le temps du choix, en mémoire ;
//  - le serveur ne télécharge jamais une adresse fournie par le navigateur
//    sans liste blanche stricte (`hotePhotosAutorise`) — sinon SSRF.

/** Droit d'abonnement (grille `features`), plans PLUS et PRO. */
export const DROIT_STOCKAGE_EN_LIGNE = 'stockage_en_ligne';

/** Ce que l'appelant attend : une photo, un PDF à importer, ou un texte à importer. */
export type UsageStockage = 'image' | 'pdf' | 'texte';

export type IdSource = 'google_drive' | 'google_photos' | 'dropbox' | 'onedrive' | 'onenote' | 'notion';

/**
 * Configuration publique d'une source, lue côté serveur (`configStockage`) et
 * transmise par le rendu — jamais inlinée au build : une clé posée sur le nœud
 * prend effet au redémarrage, sans reconstruction. Une source absente n'est
 * pas configurée, donc pas affichée.
 */
export type ConfigStockage = {
  google?: { clientId: string; apiKey: string; appId: string };
  /** Google Photos ne demande que l'identifiant OAuth (pas de clé API). */
  googlePhotos?: { clientId: string };
  dropbox?: { appKey: string };
  microsoft?: { clientId: string };
  notion?: { clientId: string };
};

export type DefinitionSource = {
  id: IdSource;
  nom: string;
  /** Picto Material Symbols (champ `icon:` : relevé par scripts/material-symbols.mjs). */
  icon: string;
  usages: UsageStockage[];
};

/** Ordre d'affichage dans la fenêtre « Depuis… ». */
export const SOURCES: DefinitionSource[] = [
  { id: 'google_drive', nom: 'Google Drive', icon: 'add_to_drive', usages: ['image', 'pdf', 'texte'] },
  { id: 'google_photos', nom: 'Google Photos', icon: 'photo_library', usages: ['image'] },
  { id: 'dropbox', nom: 'Dropbox', icon: 'inventory_2', usages: ['image', 'pdf'] },
  { id: 'onedrive', nom: 'OneDrive', icon: 'cloud', usages: ['image', 'pdf'] },
  { id: 'onenote', nom: 'OneNote', icon: 'note_stack', usages: ['texte'] },
  { id: 'notion', nom: 'Notion', icon: 'article', usages: ['texte'] },
];

export function sourceConfiguree(id: IdSource, config: ConfigStockage): boolean {
  switch (id) {
    case 'google_drive':
      return !!config.google;
    case 'google_photos':
      return !!config.googlePhotos;
    case 'dropbox':
      return !!config.dropbox;
    case 'onedrive':
    case 'onenote':
      return !!config.microsoft;
    case 'notion':
      return !!config.notion;
  }
}

/** Sources proposées pour un usage : configurées ET capables de le servir. */
export function sourcesPour(usage: UsageStockage, config: ConfigStockage): DefinitionSource[] {
  return SOURCES.filter((s) => s.usages.includes(usage) && sourceConfiguree(s.id, config));
}

// ── Types de fichiers ────────────────────────────────────────

/** Mêmes formats que `isAcceptedImage` (lib/images.ts) — le HEIC n'est pas lu. */
export const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];
export const EXTENSIONS_IMAGE = ['.png', '.jpg', '.jpeg', '.webp', '.avif'];
/** Word : seulement OneDrive, converti en PDF par Microsoft Graph. */
export const EXTENSIONS_WORD = ['.docx', '.doc'];

/** Plafond de téléchargement d'un fichier, toutes sources (le PDF local est limité à 30 Mo). */
export const MAX_OCTETS_SOURCE = 30 * 1024 * 1024;

/** Extension en minuscules, point compris (`.jpg`), ou chaîne vide. */
export function extension(nom: string): string {
  const m = /\.[a-z0-9]+$/i.exec(nom.trim());
  return m ? m[0].toLowerCase() : '';
}

/** Un nom de fichier convient-il à l'usage demandé ? (repli quand le type MIME manque) */
export function fichierConvient(nom: string, mime: string | null | undefined, usage: UsageStockage): boolean {
  const ext = extension(nom);
  const type = (mime ?? '').toLowerCase();
  if (usage === 'image') return TYPES_IMAGE.includes(type) || EXTENSIONS_IMAGE.includes(ext);
  if (usage === 'pdf') return type === 'application/pdf' || ext === '.pdf';
  return false;
}

/** Fichier Word, à convertir en PDF avant l'import (OneDrive). */
export function estWord(nom: string): boolean {
  return EXTENSIONS_WORD.includes(extension(nom));
}

/** Type MIME déduit de l'extension, quand le fournisseur n'en donne pas (lien direct Dropbox). */
export function mimeDepuisNom(nom: string): string {
  switch (extension(nom)) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

/** Nom d'un PDF issu d'un document Word converti : `Recette.docx` → `Recette.pdf`. */
export function nomPdfDepuisWord(nom: string): string {
  return nom.replace(/\.(docx?)$/i, '') + '.pdf';
}

// ── Passerelle Google Photos : liste blanche ─────────────────

/**
 * Le serveur télécharge une photo choisie dans Google Photos quand le
 * navigateur ne le peut pas (CORS). L'adresse vient du navigateur : sans ce
 * contrôle, c'est une SSRF vers le réseau interne. Seuls les hôtes qui
 * servent les médias de Google Photos (`lh3.googleusercontent.com`, et ses
 * jumeaux numérotés) sont admis, en https, sans port ni identifiants.
 * Comparaison sur le NOM D'HÔTE exact, jamais par sous-chaîne
 * (`lh3.googleusercontent.com.evil.fr` est refusé).
 */
export function hotePhotosAutorise(adresse: string): boolean {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.port !== '' || url.username !== '' || url.password !== '') return false;
  return /^lh\d+\.googleusercontent\.com$/.test(url.hostname);
}

/**
 * Adresse de téléchargement d'un média Google Photos : la `baseUrl` seule ne
 * rend qu'une vignette. `=w…-h…` demande une version JPEG bornée — jamais
 * `=d` (original), qui rendrait le HEIC d'un iPhone, illisible ici.
 */
export function urlMediaPhotos(baseUrl: string, cote = 2048): string {
  return `${baseUrl}=w${cote}-h${cote}`;
}

/** Durée Google (`"5s"`, `"1.5s"`, `"1800s"`) en millisecondes, bornée. */
export function dureeGoogleMs(valeur: string | null | undefined, defaut: number, min = 1000, max = 60 * 60 * 1000): number {
  const m = /^(\d+(?:\.\d+)?)s$/.exec((valeur ?? '').trim());
  const ms = m ? Math.round(Number(m[1]) * 1000) : defaut;
  return Math.min(max, Math.max(min, ms));
}

// ── Notion : blocs → texte ───────────────────────────────────

/** Sous-ensemble d'un bloc Notion, tel que le rend `GET /v1/blocks/{id}/children`. */
export type BlocNotion = {
  id: string;
  type: string;
  has_children?: boolean;
  /** Enfants déjà lus (récursion faite par l'appelant). */
  enfants?: BlocNotion[];
  [cle: string]: unknown;
};

type TexteRiche = { plain_text?: string };

function texteRiche(valeur: unknown): string {
  if (!Array.isArray(valeur)) return '';
  return (valeur as TexteRiche[]).map((t) => t?.plain_text ?? '').join('');
}

/** Texte d'un bloc, sans ses enfants. */
function texteDuBloc(bloc: BlocNotion): string {
  const contenu = bloc[bloc.type] as { rich_text?: unknown; cells?: unknown[]; checked?: boolean } | undefined;
  if (!contenu) return '';
  if (bloc.type === 'table_row' && Array.isArray(contenu.cells)) {
    return contenu.cells.map((c) => texteRiche(c)).join(' | ');
  }
  return texteRiche(contenu.rich_text);
}

const PROFONDEUR_MAX = 4;

/**
 * Texte lisible d'une page Notion, pour l'import par texte : titres,
 * paragraphes, listes (« - », « 1. »), cases à cocher, citations, tableaux
 * (« | »). Les blocs sans texte (image, séparateur, base de données) sont
 * ignorés. Les numéros d'une liste numérotée repartent à 1 dès qu'un autre
 * type de bloc l'interrompt, comme dans Notion.
 */
export function notionBlocsEnTexte(blocs: BlocNotion[], profondeur = 0): string {
  const lignes: string[] = [];
  const retrait = '  '.repeat(profondeur);
  let numero = 0;
  for (const bloc of blocs) {
    numero = bloc.type === 'numbered_list_item' ? numero + 1 : 0;
    const texte = texteDuBloc(bloc).trim();
    let ligne: string | null = null;
    switch (bloc.type) {
      case 'heading_1':
      case 'heading_2':
      case 'heading_3':
        if (texte) ligne = `\n${texte}`;
        break;
      case 'bulleted_list_item':
        if (texte) ligne = `${retrait}- ${texte}`;
        break;
      case 'numbered_list_item':
        if (texte) ligne = `${retrait}${numero}. ${texte}`;
        break;
      case 'to_do': {
        const coche = (bloc.to_do as { checked?: boolean } | undefined)?.checked;
        if (texte) ligne = `${retrait}- [${coche ? 'x' : ' '}] ${texte}`;
        break;
      }
      case 'quote':
      case 'callout':
        if (texte) ligne = `${retrait}> ${texte}`;
        break;
      default:
        if (texte) ligne = `${retrait}${texte}`;
    }
    if (ligne !== null) lignes.push(ligne);
    if (bloc.enfants?.length && profondeur < PROFONDEUR_MAX) {
      // Les lignes d'un tableau restent au niveau du tableau : un retrait n'y
      // dirait rien.
      const sous = notionBlocsEnTexte(bloc.enfants, bloc.type === 'table' ? profondeur : profondeur + 1);
      if (sous) lignes.push(sous);
    }
  }
  // Retours à la ligne seuls retirés en tête : le retrait d'une liste imbriquée
  // doit survivre à l'assemblage par le niveau parent.
  return lignes
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .trimEnd();
}

/** Titre d'une page Notion (propriété de type `title`), « Sans titre » à défaut. */
export function titrePageNotion(page: { properties?: Record<string, { type?: string; title?: unknown }> }): string {
  for (const prop of Object.values(page.properties ?? {})) {
    if (prop?.type === 'title') {
      const t = texteRiche(prop.title).trim();
      if (t) return t;
    }
  }
  return 'Sans titre';
}

/** Identifiant Notion valide (UUID, avec ou sans tirets) — garde des routes. */
export function idNotionValide(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id);
}

// ── OAuth par fenêtre (Microsoft, Notion) ────────────────────

/** Chemin de retour des connexions par fenêtre : à déclarer chez Microsoft et Notion. */
export const CHEMIN_RETOUR_OAUTH = '/stockage/retour';

/** Nom du canal par lequel la page de retour rend le code à la page d'origine. */
export const CANAL_RETOUR_OAUTH = 'jp-stockage-oauth';

export type RetourOAuth = { state: string; code: string | null; erreur: string | null };

/** Lit le retour d'une connexion (paramètres `code`, `state`, `error`) dans une adresse. */
export function lireRetourOAuth(recherche: string): RetourOAuth | null {
  const p = new URLSearchParams(recherche.startsWith('?') ? recherche.slice(1) : recherche);
  const state = p.get('state');
  if (!state) return null;
  const erreur = p.get('error_description') || p.get('error');
  return { state, code: p.get('code'), erreur: erreur || null };
}
