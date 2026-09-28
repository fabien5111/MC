import { Playfair_Display, Work_Sans, Parisienne } from 'next/font/google';

// Polices auto-hébergées par Next (`next/font/google`) : les fichiers sont
// téléchargés une fois au build, servis depuis `/_next/static` avec un cache
// `immutable`, et Next injecte lui-même le `<link rel="preload">` adéquat —
// plus aucun aller-retour vers `fonts.googleapis.com`/`fonts.gstatic.com` au
// chargement de la page. C'était la première requête de blocage du rendu
// listée par l'audit PageSpeed du 28/09/2026 (mobile : 8,6 s de First
// Contentful Paint). Seules les graisses réellement utilisées sont
// chargées (cf. `tailwind.config.ts` → `fontFamily`, et les classes
// `font-*` du site) ; en ajouter une non chargée ici la ferait retomber sur
// la police de secours plutôt que d'échouer silencieusement.
export const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-playfair-display',
  display: 'swap',
});

export const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-work-sans',
  display: 'swap',
});

// Logo « Je pâtisse ! » (`.maryse-logo-font`, app/globals.css) — une seule
// graisse, la police n'a pas de variante.
export const parisienne = Parisienne({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-parisienne',
  display: 'swap',
});
