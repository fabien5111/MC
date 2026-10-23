// Réseaux sociaux de Je pâtisse ! (JEP-15) — logique PURE (aucun import
// Supabase / next/headers) : utilisée par l'en-tête (serveur), l'écran
// d'administration (client) et les tests. La lecture en base, mise en cache,
// est dans `lib/data/reference.ts` (`getSocialLinks`).

/** Ordre d'affichage, fixe partout : en-tête, bande mobile, administration. */
export const RESEAUX = ['instagram', 'tiktok', 'youtube', 'pinterest', 'facebook'] as const;
export type ReseauSocial = (typeof RESEAUX)[number];

export const NOM_RESEAU: Record<ReseauSocial, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  facebook: 'Facebook',
};

export const EXEMPLE_URL: Record<ReseauSocial, string> = {
  instagram: 'https://www.instagram.com/jepatisse',
  tiktok: 'https://www.tiktok.com/@jepatisse',
  youtube: 'https://www.youtube.com/@jepatisse',
  pinterest: 'https://www.pinterest.com/jepatisse',
  facebook: 'https://www.facebook.com/jepatisse',
};

export type LienSocial = { network: ReseauSocial; url: string | null; is_visible: boolean };

// Domaines attendus. Un nom d'hôte convient s'il EST le domaine ou s'il en est
// un sous-domaine (`www.`, `m.`…) — jamais une simple sous-chaîne, sinon
// `instagram.com.evil.fr` passerait. Pinterest existe sous de nombreux
// domaines nationaux (`pinterest.fr`, `pinterest.co.uk`…), d'où le motif.
const DOMAINES: Record<ReseauSocial, RegExp> = {
  instagram: /^(?:[a-z0-9-]+\.)*instagram\.com$/,
  tiktok: /^(?:[a-z0-9-]+\.)*tiktok\.com$/,
  youtube: /^(?:(?:[a-z0-9-]+\.)*youtube\.com|youtu\.be)$/,
  pinterest: /^(?:[a-z0-9-]+\.)*pinterest\.[a-z]{2,3}(?:\.[a-z]{2})?$/,
  facebook: /^(?:(?:[a-z0-9-]+\.)*facebook\.com|fb\.com|(?:[a-z0-9-]+\.)*fb\.com)$/,
};

/**
 * Contrôle l'adresse saisie pour un réseau. Renvoie `null` si elle est
 * acceptable (vide comprise : le réseau n'est alors simplement pas affiché),
 * sinon le message à montrer sous le champ. Les espaces de bord sont retirés
 * avant le contrôle — l'appelant enregistre `nettoyerUrl(valeur)`.
 */
export function erreurUrlReseau(reseau: ReseauSocial, valeur: string): string | null {
  const v = nettoyerUrl(valeur);
  if (!v) return null;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return 'Adresse invalide.';
  }
  if (url.protocol !== 'https:') return 'L’adresse doit commencer par https://.';
  if (!DOMAINES[reseau].test(url.hostname.toLowerCase())) {
    return `L’adresse doit appartenir à ${NOM_RESEAU[reseau]}.`;
  }
  return null;
}

export function nettoyerUrl(valeur: string | null | undefined): string {
  return (valeur ?? '').trim();
}

/**
 * Liens à afficher, dans l'ordre fixe : adresse non vide ET réseau visible.
 * Un réseau écarté ne laisse pas de trou — les suivants se resserrent. Une
 * ligne inconnue (réseau retiré du code) est ignorée. Liste vide = ni groupe,
 * ni filet, ni bande mobile.
 */
export function liensAffichables(lignes: readonly LienSocial[]): { network: ReseauSocial; url: string }[] {
  const parReseau = new Map(lignes.map((l) => [l.network, l]));
  const res: { network: ReseauSocial; url: string }[] = [];
  for (const r of RESEAUX) {
    const l = parReseau.get(r);
    const url = nettoyerUrl(l?.url);
    if (l && l.is_visible && url) res.push({ network: r, url });
  }
  return res;
}
