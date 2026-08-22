// Note moyenne sous forme d'étoiles (note chiffrée + rangée d'étoiles à
// remplissage proportionnel + nombre d'avis optionnel). Couleurs du site
// (primary / outline-variant) plutôt que le doré habituel de ce type de
// composant — deux rangées d'icônes Material superposées (vide en dessous,
// pleine recouverte à `value/5 * 100%` au-dessus) pour un remplissage
// partiel fidèle, plutôt qu'un arrondi à l'étoile pleine la plus proche.
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
}: {
  value: number;
  // Nombre d'avis affiché entre parenthèses — omis si absent (cartes, où la
  // place manque) ou nul.
  count?: number | null;
  size?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value / 5)) * 100;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="font-bold text-primary">{value.toFixed(1).replace('.', ',')}</span>
      <span className="relative inline-flex">
        <StarRow filled={false} size={size} />
        <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
          <StarRow filled={true} size={size} />
        </span>
      </span>
      {count != null && count > 0 && <span className="text-on-surface-variant opacity-70">({count})</span>}
    </span>
  );
}
