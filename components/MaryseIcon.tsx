// Picto en forme de maryse (spatule de pâtisserie) utilisé pour représenter le
// niveau de difficulté d'une recette.
//
// On garde le même principe que les anciens pictos (les pastilles
// `.maryse-pill`) : on affiche une rangée de 5 icônes et on joue uniquement sur
// la couleur — `text-primary` pour un niveau atteint, `text-outline-variant`
// pour un niveau restant. La forme est une silhouette pleine (colorée via
// `currentColor`) avec la boucle de la maryse évidée (`fillRule="evenodd"`),
// pour rester lisible à petite taille.
export function MaryseIcon({
  className = '',
  size = 20,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g transform="rotate(45 50 50)">
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M44 5 H56 A12 12 0 0 1 68 17 V33 A12 12 0 0 1 56 45 H54 V93 A4 4 0 0 1 46 93 V45 H44 A12 12 0 0 1 32 33 V17 A12 12 0 0 1 44 5 Z M42 40 V23 A8 8 0 0 1 58 23 V40 H54 V25 A4 4 0 0 1 46 25 V40 H42 Z"
        />
      </g>
    </svg>
  );
}
