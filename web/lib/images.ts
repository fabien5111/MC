// Compression d'image côté client → data-URL, portée depuis db.js
// (resizeImage / compressImageUrl). L'app stocke les images en data-URL
// directement dans la base (avatar_url, hero_image_url…), pas dans un bucket.
'use client';

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

export function isAcceptedImage(file: File): boolean {
  return ACCEPT.includes(file.type);
}

// Redimensionne un fichier image et renvoie une data-URL compressée.
export function resizeImageToDataUrl(
  file: File,
  maxWidth = 1400,
  mime: 'image/jpeg' | 'image/webp' = 'image/jpeg',
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas indisponible'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(mime, quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible'));
    };
    img.src = url;
  });
}
