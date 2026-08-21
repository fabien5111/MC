// Compression d'image côté client → data-URL, portée depuis db.js
// (resizeImage / compressImageUrl). L'app stocke les images en data-URL
// directement dans la base (avatar_url, hero_image_url…), pas dans un bucket.
'use client';

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

// Formats que les appareils photo produisent mais qu'aucun navigateur de bureau
// ne sait décoder dans un canvas : ils méritent un message précis plutôt qu'un
// « image illisible » qui laisse l'utilisateur sans issue.
const NON_DECODABLES = ['image/heic', 'image/heif'];

export function isAcceptedImage(file: File): boolean {
  return ACCEPT.includes(file.type);
}

export function isHeic(file: File): boolean {
  return NON_DECODABLES.includes(file.type) || /\.hei[cf]$/i.test(file.name);
}

// Charge un fichier image en élément décodé, en libérant l'URL temporaire quoi
// qu'il arrive.
function chargerImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(isHeic(file) ? 'Format HEIC non lisible par le navigateur' : 'Image illisible'));
    };
    img.src = url;
  });
}

function dessiner(
  img: HTMLImageElement,
  largeur: number,
  hauteur: number,
  mime: 'image/jpeg' | 'image/webp',
  quality: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(largeur));
  canvas.height = Math.max(1, Math.round(hauteur));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mime, quality);
}

// Redimensionne un fichier image et renvoie une data-URL compressée.
export async function resizeImageToDataUrl(
  file: File,
  maxWidth = 1400,
  mime: 'image/jpeg' | 'image/webp' = 'image/jpeg',
  quality = 0.85,
): Promise<string> {
  const img = await chargerImage(file);
  const scale = Math.min(1, maxWidth / img.width);
  return dessiner(img, img.width * scale, img.height * scale, mime, quality);
}

/**
 * Réduction bornée par le **grand côté**, pour les photos envoyées à l'IA.
 *
 * `resizeImageToDataUrl` ne borne que la largeur : une photo en portrait
 * ramenée à 1400 px de large reste bien plus haute, coûte des tokens pour rien
 * et se fait de toute façon réduire côté API.
 *
 * 1568 px est la limite au-delà de laquelle l'API réduit elle-même l'image :
 * envoyer plus est du poids perdu, envoyer moins abîme la lecture. Sur une page
 * de livre photographiée en entier, le corps du texte n'y fait déjà que
 * quelques pixels de haut — c'est la définition qui décide si « 150 °C » se lit
 * correctement. Chaque photo partant dans sa propre requête, plus rien
 * n'oblige à descendre en dessous.
 */
export async function resizePhotoForAi(file: File, maxLongEdge = 1568, quality = 0.82): Promise<string> {
  const img = await chargerImage(file);
  const scale = Math.min(1, maxLongEdge / Math.max(img.width, img.height));
  return dessiner(img, img.width * scale, img.height * scale, 'image/jpeg', quality);
}

export type Rotation90 = 0 | 90 | 180 | 270;

// Charge une image déjà en data-URL (contrairement à `chargerImage`, qui part
// d'un `File` déposé par l'utilisateur). Utilisé par l'édition d'une photo
// déjà présente dans le formulaire (zoom/rotation/position).
function chargerImageDepuisSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = src;
  });
}

// Miniature (bornée en largeur) depuis une image déjà en data-URL — pour les
// listes qui n'affichent qu'une vignette de quelques dizaines de pixels
// (fournées d'« En cuisine ») sans transporter l'image pleine définition
// (`hero_image_url`, jusqu'à 1400 px). Utilisée à la fois à l'enregistrement
// d'une recette (CreerForm) et par le rétro-remplissage admin des recettes
// déjà en base (RecipeThumbnailBackfill) : une seule implémentation, un seul
// format, pour que les deux chemins produisent des miniatures identiques.
export async function resizeDataUrlToThumb(
  src: string,
  maxWidth = 96,
  mime: 'image/jpeg' | 'image/webp' = 'image/jpeg',
  quality = 0.75,
): Promise<string> {
  const img = await chargerImageDepuisSrc(src);
  const scale = Math.min(1, maxWidth / img.width);
  return dessiner(img, img.width * scale, img.height * scale, mime, quality);
}

/**
 * Facteur d'échelle pour qu'un contenu `contentW × contentH` tienne en
 * entier dans un cadre `frameW × frameH` (l'inverse d'un « cover » qui
 * remplirait le cadre en rognant l'excédent).
 */
export function containScale(contentW: number, contentH: number, frameW: number, frameH: number): number {
  return Math.min(frameW / contentW, frameH / contentH);
}

/**
 * Plus grand rectangle de rapport `ratio` (largeur/hauteur) tenant dans une
 * boîte `boxW × boxH`. Sert à dimensionner la « scène » de l'éditeur de photo
 * (au ratio de la photo elle-même, pour l'afficher entière sans la
 * pré-rogner) puis, à l'intérieur, le cadre de recadrage bleu (au ratio
 * cible 16:9 ou carré).
 */
export function fitRect(ratio: number, boxW: number, boxH: number): { w: number; h: number } {
  const w = Math.min(boxW, boxH * ratio);
  return { w, h: w / ratio };
}

/** Dimensions effectives d'une image après rotation par pas de 90° (largeur/hauteur échangées à 90°/270°). */
export function rotatedDims(w: number, h: number, rotation: Rotation90): { w: number; h: number } {
  return rotation % 180 === 90 ? { w: h, h: w } : { w, h };
}

/**
 * Rejoue sur un canvas la transformation (zoom, rotation, position) réglée
 * dans l'éditeur de photo — dans le même repère que l'aperçu CSS de
 * `PhotoEditorModal` : la photo entière est affichée dans une « scène »
 * (`stageWidth`/`stageHeight`, au ratio de la photo) et seul le cadre de
 * recadrage bleu (`cropWidth`/`cropHeight`, au ratio cible, centré dans la
 * scène) définit la zone conservée — et produit la data-URL finale au
 * gabarit `outWidth × outWidth/aspectRatio`.
 */
export async function cropRotateImageToDataUrl(
  src: string,
  transform: {
    rotation: Rotation90;
    zoom: number;
    offsetX: number;
    offsetY: number;
    stageWidth: number;
    stageHeight: number;
    cropWidth: number;
    cropHeight: number;
  },
  outWidth: number,
  aspectRatio: number,
  mime: 'image/jpeg' | 'image/webp' = 'image/jpeg',
  quality = 0.85,
): Promise<string> {
  const img = await chargerImageDepuisSrc(src);
  const outHeight = Math.max(1, Math.round(outWidth / aspectRatio));
  const k = outWidth / transform.cropWidth;
  const eff = rotatedDims(img.width, img.height, transform.rotation);
  const baseScale = containScale(eff.w, eff.h, transform.stageWidth, transform.stageHeight);
  const renderedScale = baseScale * transform.zoom * k;

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  // Le zoom est borné pour que le cadre de recadrage reste toujours
  // entièrement couvert par la photo (cf. le clamp d'offset de
  // PhotoEditorModal) ; ce fond blanc n'est qu'un filet de sécurité contre un
  // écart d'arrondi, jamais la situation normale.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, outWidth, outHeight);
  ctx.translate(outWidth / 2 + transform.offsetX * k, outHeight / 2 + transform.offsetY * k);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(renderedScale, renderedScale);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas.toDataURL(mime, quality);
}
