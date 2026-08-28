// Note moyenne sous forme d'étoiles. Couleurs du site (primary /
// outline-variant) plutôt que le doré habituel de ce type de composant.
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
  compact = false,
}: {
  value: number | null | undefined;
  // Nombre d'avis affiché entre parenthèses, après les étoiles — omis si
  // absent ou nul. Ignoré en mode `compact`.
  count?: number | null;
  size?: number;
  className?: string;
  // Note d'auteur (entier + une seule étoile, ex. « 5★ ») plutôt que la
  // note chiffrée précise + 5 étoiles de la recette elle-même — l'appelant
  // ajoute les parenthèses (cf. RecipeCardLayout, AuthorCard, recette de la
  // semaine).
  compact?: boolean;
}) {
  const avg = Number(value) || 0;
  if (avg <= 0) return null;
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-0.5 ${className}`}>
        <span className="font-bold text-primary">{Math.round(avg)}</span>
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontSize: size, fontVariationSettings: "'FILL' 1" }}
        >
          star
        </span>
      </span>
    );
  }
  const pct = Math.max(0, Math.min(1, avg / 5)) * 100;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="font-bold text-primary">{avg.toFixed(1).replace('.', ',')}</span>
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
