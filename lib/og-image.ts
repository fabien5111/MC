// Cartes d'aperçu OpenGraph (JEP-21) — constantes et chargement d'images.
//
// Le moteur de `next/og` (Satori) ne lit ni le WebP ni l'AVIF, et une seule
// image illisible fait échouer toute la carte. Les photos sont donc
// téléchargées ici, filtrées sur leur type réel (JPEG/PNG), bornées en temps
// et en taille, puis passées en data-URL : une photo qui ne passe pas
// disparaît de la carte, la carte, elle, s'affiche toujours.
import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const OG_TAILLE = { width: 1200, height: 630 };

// Couleurs de la marque (cf. `themeColor` du layout, tailwind.config.ts).
export const OG_COULEURS = { primaire: '#300a12', fond: '#fff8f7', texteDoux: '#6b5557', accent: '#f4dcd9' };

const TYPES_LISIBLES = ['image/jpeg', 'image/png'];
const TAILLE_MAX = 2_500_000;

export async function chargerImageOg(url: string, delaiMs = 4000): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(delaiMs), cache: 'no-store' });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPES_LISIBLES.includes(type)) return null;
    const octets = await res.arrayBuffer();
    if (octets.byteLength > TAILLE_MAX) return null;
    return `data:${type};base64,${Buffer.from(octets).toString('base64')}`;
  } catch {
    return null;
  }
}

export async function chargerImagesOg(urls: string[]): Promise<string[]> {
  return (await Promise.all(urls.map((u) => chargerImageOg(u)))).filter((u): u is string => !!u);
}

// Playfair Display (police des titres du site), en TTF STATIQUE gras : le
// moteur de `next/og` ne lit ni le WOFF2 servi par `next/font` ni les polices
// variables. Fichier versionné dans `app/fonts/og/` (instance 700 tirée de
// `playfair-display-latin.woff2`). Lu une fois par processus ; en cas d'échec
// (fichier absent, illisible) on rend `undefined` et la carte s'affiche avec
// la police par défaut du générateur — jamais d'erreur.
let policeTitre: Promise<ArrayBuffer | null> | null = null;

export function chargerPoliceTitre(): Promise<ArrayBuffer | null> {
  policeTitre ??= readFile(path.join(process.cwd(), 'app', 'fonts', 'og', 'playfair-display-700.ttf'))
    .then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
    .catch(() => null);
  return policeTitre;
}

/** Option `fonts` d'`ImageResponse` : vide si la police n'a pas pu être lue. */
export async function optionsPolice() {
  const data = await chargerPoliceTitre();
  return data ? { fonts: [{ name: 'Playfair Display', data, weight: 700 as const, style: 'normal' as const }] } : {};
}

/** Famille CSS des titres : Playfair si chargée, sinon la police par défaut. */
export const FAMILLE_TITRE = 'Playfair Display, serif';
