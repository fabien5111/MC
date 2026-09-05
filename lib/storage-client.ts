'use client';

// Téléversement client → stockage objet, via l'URL de dépôt signée mintée par
// /api/stockage/televersement. Ce que `lib/images.ts` produit ne change pas
// (une data-URL, pour l'aperçu immédiat sans aller-retour réseau) : seule sa
// destination finale change, au moment où l'écran enregistre.
//
// Idempotent par construction : appelé sur une valeur qui n'est pas une
// data-URL (déjà migrée par le B3, ou vide), elle est rendue telle quelle,
// sans requête. Un écran peut donc appeler cette fonction inconditionnellement
// avant chaque écriture, que l'image ait changé ou non.
//
// Cf. docs/migration-infomaniak.md § 7.5 (lot B, sous-lot B2).
import { estDataUrlImage, type Usage } from '@/lib/storage';

function dataUrlVersBlob(dataUrl: string): Blob {
  const virgule = dataUrl.indexOf(',');
  const entete = dataUrl.slice(0, virgule);
  const mime = /^data:(.*?);base64$/.exec(entete)?.[1] ?? 'application/octet-stream';
  const octets = atob(dataUrl.slice(virgule + 1));
  const tampon = new Uint8Array(octets.length);
  for (let i = 0; i < octets.length; i++) tampon[i] = octets.charCodeAt(i);
  return new Blob([tampon], { type: mime });
}

type ReponsePresignature = { url: string; conteneur: 'photos' | 'contact'; cle: string; urlFinale: string | null };

/**
 * Dépose une data-URL sur le stockage objet et rend l'URL finale à
 * persister en base — ou `valeur` inchangée si ce n'est pas une data-URL.
 *
 * Le dépôt est un `PUT` direct navigateur → bucket, l'application ne voit
 * jamais les octets (§ 3).
 */
export async function televerserImage(usage: Usage, valeur: string | null): Promise<string | null> {
  if (!estDataUrlImage(valeur)) return valeur;

  const blob = dataUrlVersBlob(valeur);

  const reponse = await fetch('/api/stockage/televersement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usage, mime: blob.type }),
  });
  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { error?: string } | null;
    throw new Error(corps?.error ?? `Préparation du dépôt refusée (${reponse.status}).`);
  }
  const { url, urlFinale } = (await reponse.json()) as ReponsePresignature;
  if (!urlFinale) throw new Error('Le stockage n’a pas rendu d’URL finale pour cet usage.');

  const depot = await fetch(url, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
  if (!depot.ok) throw new Error(`Dépôt refusé par le stockage (${depot.status}).`);

  return urlFinale;
}
