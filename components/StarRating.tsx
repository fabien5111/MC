// Note moyenne sous forme d'étoiles (note chiffrée + rangée d'étoiles à
// remplissage proportionnel + nombre d'avis optionnel entre parenthèses).
// Couleurs du site (primary / outline-variant) plutôt que le doré habituel
// de ce type de composant — deux rangées d'icônes Material superposées
// (vide en dessous, pleine recouverte à `value/5 * 100%` au-dessus) pour un
// remplissage partiel fidèle, plutôt qu'un arrondi à l'étoile pleine la plus
// proche.
//
// S'efface tout seul (`null`) sans note : une moyenne à 0 ne correspond
// jamais à un vrai avis (les notes vont de 1 à 5), seulement à l'absence
// d'évaluation — inutile aux appelants de dupliquer ce garde-fou.
function StarRow({ filled, size }: { filled: boolean; size: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`material-symbols-outlined ${filled ? 'text-primary' : 'text-outline-variant'}`}
          style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}` }}
        >
          star
        </span>
      ))}
    </span>
  );
}

export function StarRating({
  value,
  count,
  size = 16,
  className = '',
  starsOnly = false,
}: {
  value: number | null | undefined;
  // Nombre d'avis affiché entre parenthèses, après les étoiles — omis si
  // absent ou nul. Ignoré en mode `starsOnly`.
  count?: number | null;
  size?: number;
  className?: string;
  // Étoiles seules, sans note chiffrée ni compteur — note d'auteur affichée
  // entre parenthèses à côté de son nom (cf. AuthorCard, recette de la
  // semaine).
  starsOnly?: boolean;
}) {
  const avg = Number(value) || 0;
  if (avg <= 0) return null;
  const pct = Math.max(0, Math.min(1, avg / 5)) * 100;
  const stars = (
    <span className="relative inline-flex">
      <StarRow filled={false} size={size} />
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
        <StarRow filled={true} size={size} />
      </span>
    </span>
  );
  if (starsOnly) return <span className={className}>{stars}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="font-bold text-primary">{avg.toFixed(1).replace('.', ',')}</span>
      {stars}
      {count != null && count > 0 && <span className="text-on-surface-variant opacity-70">({count})</span>}
    </span>
  );
}
