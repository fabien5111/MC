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
          d="M39 6 H61 A15 15 0 0 1 76 21 V43 A15 15 0 0 1 61 58 H54 V93.5 A4 4 0 0 1 46 93.5 V58 H39 A15 15 0 0 1 24 43 V21 A15 15 0 0 1 39 6 Z M40 50 V26 A10 10 0 0 1 60 26 V50 H55 V27 A5 5 0 0 1 45 27 V50 H40 Z"
        />
      </g>
    </svg>
  );
}
