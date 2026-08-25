// Prévient le serveur qu'un référentiel vient d'être modifié, pour qu'il
// invalide le cache de `lib/data/reference.ts` (cf.
// `app/api/admin/reference/revalidate`).
//
// À appeler après **toute** écriture sur une table de référence depuis un
// Client Component — Admin → Listes, mais aussi la création d'un tag ou d'un
// ingrédient à la volée depuis l'éditeur de recette.
//
// Volontairement silencieuse et non bloquante : l'écriture, elle, a déjà
// abouti. Si l'invalidation échoue, la valeur se rafraîchira au délai de
// validité de la table — c'est une dégradation, pas une erreur à remonter à
// l'utilisateur, qui n'y peut rien.
export async function revalidateReference(table?: string): Promise<void> {
  try {
    await fetch('/api/admin/reference/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ table }),
    });
  } catch {
    // Sans effet visible : cf. ci-dessus.
  }
}
