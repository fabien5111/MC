// Picto de planification : calendrier + cadran d'horloge en un seul glyphe.
// Remplace `calendar_today` / `event_available` / `calendar_month` partout où
// il s'agit de planification — la planification de ce produit porte toujours
// une durée (jours de repos, temps de pousse), un calendrier seul le tait.
//
// `discFill` n'est pas cosmétique : le disque de l'horloge doit être **opaque**
// et de la couleur du fond qui l'accueille, sinon la grille du calendrier
// transparaît à travers le cadran. D'où l'obligation de le passer quand le
// picto n'est pas posé sur `surface` — les valeurs usuelles sont réunies dans
// `DISC` pour éviter d'écrire des hexadécimaux à la main dans les composants.
export const DISC = {
  surface: '#fff8f7',
  surfaceContainerLow: '#fff0f0',
  white: '#ffffff',
} as const;

export function PlanningIcon({
  size = 20,
  discFill = DISC.surface,
  strokeWidth = 1.6,
  className,
}: {
  size?: number;
  discFill?: string;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2.5" x2="8" y2="5.5" />
      <line x1="16" y1="2.5" x2="16" y2="5.5" />
      <circle cx="16" cy="16" r="5" fill={discFill} strokeWidth="2.1" />
      <path d="M16 13.3v2.7l1.8 1.1" />
    </svg>
  );
}
