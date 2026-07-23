import type { CSSProperties } from 'react';

// Spinner « Le Fouet » — indicateur de chargement maison, sans dépendance.
//
// Un fouet de pâtisserie qui pivote autour de son axe vertical : la cage de
// fils (disposés en méridiens) orbite en 3D et balaie de droite à gauche puis
// repasse derrière, pour évoquer le geste de foisonnement. Toute l'animation
// vit dans `app/globals.css` (section « Le Fouet ») et respecte
// `prefers-reduced-motion` ; ce composant ne fait qu'en produire le balisage.
//
// - `size`        : diamètre du fouet en pixels (défaut 64).
// - `label`       : texte lu par les lecteurs d'écran / affiché en plein écran.
// - `fullscreen`  : centre le fouet dans un bloc pleine hauteur avec le logo,
//                   pour les fichiers `loading.tsx` (chargement de page).

// Angles des fils autour de l'axe (méridiens de la cage).
const WIRES = [0, 45, 90, 135, 180, 225, 270, 315];

export function Spinner({
  size = 64,
  label,
  fullscreen = false,
  className = '',
}: {
  size?: number;
  label?: string;
  fullscreen?: boolean;
  className?: string;
}) {
  const whisk = (
    <span
      className="whisk-scene"
      style={{ '--s': `${size}px` } as CSSProperties}
      role="status"
      aria-label={label ?? 'Chargement en cours'}
    >
      <span className="whisk-cage" aria-hidden="true">
        {WIRES.map((a, i) => (
          <span
            key={a}
            className={`whisk-wire${i % 2 ? ' whisk-wire--alt' : ''}`}
            style={{ '--a': `${a}deg` } as CSSProperties}
          >
            <svg viewBox="0 0 100 100">
              <path d="M50 34 C90 47 90 83 50 97" />
            </svg>
          </span>
        ))}
      </span>
      <span className="whisk-handle" aria-hidden="true" />
      <span className="whisk-knob" aria-hidden="true" />
    </span>
  );

  if (!fullscreen) {
    return <span className={className}>{whisk}</span>;
  }

  return (
    <div
      className={`flex min-h-[60vh] w-full flex-col items-center justify-center gap-5 ${className}`}
    >
      <span className="maryse-logo-font text-4xl text-primary">Maryse Club</span>
      {whisk}
      <p className="text-body-md text-secondary">
        {label ?? 'On prépare la recette…'}
      </p>
    </div>
  );
}
