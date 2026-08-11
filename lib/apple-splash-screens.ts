// Formats d'images de lancement iOS (une par taille d'appareil, cf.
// handoff « Splash natif PWA »). iOS n'utilise pas le manifeste pour cet
// écran : chaque image est déclarée par une balise <link
// apple-touch-startup-image> avec sa propre requête média.
//
// Doit rester synchronisé avec la liste `iosFormats` de
// `scripts/generate-pwa-assets.mjs` (qui génère les PNG correspondants dans
// `public/splash/`) — tenue séparément pour que ce script Node n'ait pas à
// dépendre du compilateur TypeScript.
const IOS_DEVICE_FORMATS: Array<{ pt: [number, number]; ratio: number }> = [
  { pt: [375, 667], ratio: 2 }, // iPhone SE (2e/3e gen), 6/6s/7/8
  { pt: [414, 736], ratio: 3 }, // iPhone 6/7/8 Plus
  { pt: [414, 896], ratio: 2 }, // iPhone XR / 11
  { pt: [414, 896], ratio: 3 }, // iPhone XS Max / 11 Pro Max
  { pt: [375, 812], ratio: 3 }, // iPhone X/XS/11 Pro, 12/13 mini
  { pt: [390, 844], ratio: 3 }, // iPhone 12/13/14, 12/13 Pro
  { pt: [428, 926], ratio: 3 }, // iPhone 12/13 Pro Max, 14 Plus
  { pt: [393, 852], ratio: 3 }, // iPhone 14 Pro, 15/15 Pro, 16/16 Pro
  { pt: [430, 932], ratio: 3 }, // iPhone 14/15/16 Pro Max, 16 Plus
  { pt: [810, 1080], ratio: 2 }, // iPad 10.2"
  { pt: [834, 1194], ratio: 2 }, // iPad Air 11" / iPad Pro 11"
  { pt: [1024, 1366], ratio: 2 }, // iPad Pro 12.9"
];

export const APPLE_SPLASH_SCREENS = IOS_DEVICE_FORMATS.map(({ pt: [ptWidth, ptHeight], ratio }) => {
  const width = ptWidth * ratio;
  const height = ptHeight * ratio;
  return {
    media: `(device-width: ${ptWidth}px) and (device-height: ${ptHeight}px) and (-webkit-device-pixel-ratio: ${ratio})`,
    href: `/splash/${width}x${height}.png`,
  };
});
