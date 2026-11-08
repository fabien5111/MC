// Arrondi des quantités CALCULÉES d'ingrédients (JEP-389).
//
// Chaque unité du référentiel (`units.round_from`) dit à partir de quelle
// valeur une quantité s'arrondit à l'unité : 12,4 g → 12 g, mais 8,4 g reste
// 8,4 g. Vide = pas d'arrondi à l'unité (deux décimales, comme avant).
//
// Ne s'applique qu'à ce que l'application calcule (ajustement par coefficient,
// moule, IA, fournée, mode projet) — jamais à une quantité saisie par l'auteur.
// Module pur, sans dépendance : importable côté serveur comme côté client.

export type UniteAvecSeuil = {
  name: string;
  abbreviation?: string | null;
  // Colonne ajoutée à la main (DDL par psql) : absente des types générés et
  // de la base tant que la migration n'est pas jouée.
  round_from?: number | string | null;
};

export type SeuilsArrondi = ReadonlyMap<string, number>;

const cle = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Table « nom ou abréviation normalisé → seuil », construite une fois.
// Une unité sans seuil valide (vide, nul, négatif, illisible) n'y figure pas.
export function seuilsArrondi(units: readonly UniteAvecSeuil[] | null | undefined): SeuilsArrondi {
  const m = new Map<string, number>();
  for (const u of units ?? []) {
    const brut = u.round_from;
    if (brut == null || brut === '') continue;
    const s = typeof brut === 'number' ? brut : parseFloat(String(brut).replace(',', '.'));
    if (!isFinite(s) || s <= 0) continue;
    for (const nom of [u.name, u.abbreviation]) {
      const k = nom ? cle(nom) : '';
      if (k && !m.has(k)) m.set(k, s);
    }
  }
  return m;
}

export function seuilDeUnite(unite: string | null | undefined, seuils: SeuilsArrondi | null | undefined): number | null {
  if (!seuils || !unite) return null;
  const k = cle(unite);
  return k ? (seuils.get(k) ?? null) : null;
}

// Arrondit une quantité calculée : à l'unité dès que sa valeur absolue atteint
// le seuil de son unité, sinon à deux décimales. Sans seuil connu (unité libre,
// non rattachée au référentiel, colonne pas encore migrée) : deux décimales.
export function arrondirQuantite(q: number, unite: string | null | undefined, seuils?: SeuilsArrondi | null): number {
  if (!isFinite(q)) return q;
  const seuil = seuilDeUnite(unite, seuils);
  if (seuil != null && Math.abs(q) >= seuil) return Math.round(q);
  return Math.round(q * 100) / 100;
}
