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
 * et se fait de toute façon réduire côté API. Ici les deux dimensions sont
 * tenues, ce qui rend le poids de la requête prévisible.
 */
export async function resizePhotoForAi(file: File, maxLongEdge = 1400, quality = 0.72): Promise<string> {
  const img = await chargerImage(file);
  const scale = Math.min(1, maxLongEdge / Math.max(img.width, img.height));
  return dessiner(img, img.width * scale, img.height * scale, 'image/jpeg', quality);
}
