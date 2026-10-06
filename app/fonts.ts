import localFont from 'next/font/local';

// Polices auto-hébergées, fichiers versionnés dans le dépôt (`app/fonts/`),
// servis depuis `/_next/static` avec un cache `immutable` ; Next injecte
// lui-même le `<link rel="preload">` adéquat — aucun aller-retour vers
// `fonts.googleapis.com`/`fonts.gstatic.com`, ni au chargement de la page
// (audit PageSpeed du 28/09/2026 : c'était la première requête de blocage
// du rendu) ni AU BUILD.
//
// Pourquoi plus `next/font/google` (JEP-299) : il téléchargeait les polices
// chez Google à chaque construction, et Google renvoie parfois des adresses
// de fichiers sans extension (`/l/font?kit=…`) que Next 15.5 ne sait pas
// lire — « Cannot read properties of null (reading '1') », build en échec.
// Arrivé deux fois en 36 h (nœud applicatif le 04/10, runner GitHub le
// 06/10) ; sur le nœud, l'échec laissait le site sans build complet.
//
// Fichiers : sous-ensemble `latin` des polices variables de Google Fonts
// (couvre le français, œ compris). Les trois sont des polices VARIABLES : un
// seul fichier par famille porte toutes les graisses, déclarées par une plage
// (`weight: '400 800'`) — mêmes graisses que l'ancienne configuration. Pour
// en ajouter une hors plage, élargir la plage ; une graisse non couverte
// retomberait sur la police de secours plutôt que d'échouer.

export const playfairDisplay = localFont({
  src: './fonts/playfair-display-latin.woff2',
  weight: '400 800',
  style: 'normal',
  variable: '--font-playfair-display',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

export const workSans = localFont({
  src: './fonts/work-sans-latin.woff2',
  weight: '400 700',
  style: 'normal',
  variable: '--font-work-sans',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

// Logo « Je pâtisse ! » (`.maryse-logo-font`, app/globals.css) — une seule
// graisse, la police n'a pas de variante.
export const parisienne = localFont({
  src: './fonts/parisienne-latin.woff2',
  weight: '400',
  style: 'normal',
  variable: '--font-parisienne',
  display: 'swap',
});
