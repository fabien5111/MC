// Génère les assets du splash natif PWA (icônes Android + images de
// lancement iOS) depuis le glyphe source `brand/maryse-icon.svg`.
//
// Rendu via Chromium headless (playwright-core) plutôt que pwa-asset-generator :
// le gabarit iOS (disque + nom manuscrit + indicateur) est une composition
// propre à chaque taille d'écran, pas un simple logo recadré sur un fond —
// on calcule donc les proportions en CSS/SVG pour chaque format cible au lieu
// de recadrer une image source unique.
//
// La police manuscrite (Parisienne) est mesurée à l'exécution
// (`getComputedTextLength`) pour que le nom occupe exactement la largeur
// prévue, quelle que soit la métrie réelle de la police. Le fichier
// `brand/Parisienne-Regular.woff2` (copie locale de la même police Google
// Fonts que charge le site) est embarqué en data-URI plutôt que chargé par
// URL : Chromium headless n'a ainsi aucune requête réseau à faire pour
// produire ces images.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const primary = '#300a12';
const surface = '#fff8f7';
const outlineVariant = '#d6c2c3';

const glyphSvg = readFileSync(join(racine, 'brand', 'maryse-icon.svg'), 'utf8');
const glyphInner = glyphSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const fontBase64 = readFileSync(join(racine, 'brand', 'Parisienne-Regular.woff2')).toString('base64');
const fontFace = `@font-face{font-family:'Parisienne';src:url(data:font/woff2;base64,${fontBase64}) format('woff2');}`;

function iconHtml(size, glyphPercent, bg) {
  const glyphSize = size * glyphPercent;
  return `<!doctype html><html><head><style>
    *{margin:0;padding:0}
    html,body{width:${size}px;height:${size}px;overflow:hidden}
  </style></head><body>
  <div style="width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center">
    <svg width="${glyphSize}" height="${glyphSize}" viewBox="0 0 100 100">${glyphInner}</svg>
  </div>
  </body></html>`;
}

// Gabarit décrit dans le handoff : fond plein écran, disque `primary` de
// 25 % de la largeur centré à 44 % de la hauteur, glyphe à 54 % du disque,
// nom manuscrit à 46 % de la largeur (baseline à 84 % de la hauteur),
// indicateur de chargement figé à 7 % de la largeur sous le nom.
function splashSvg({ width, height }) {
  const discDiameter = width * 0.25;
  const discRadius = discDiameter / 2;
  const discCy = height * 0.44;
  const glyphSize = discDiameter * 0.54;
  const nameBaselineY = height * 0.84;
  const indicatorDiameter = width * 0.07;
  const indicatorRadius = indicatorDiameter / 2;
  const indicatorStroke = indicatorDiameter * 0.14;
  // Écart nom → indicateur non chiffré dans le handoff (seulement « sous le
  // nom ») : repris proportionnellement à la maquette de référence.
  const indicatorCy = nameBaselineY + height * 0.045 + indicatorRadius;
  const arcTop = [width / 2, indicatorCy - indicatorRadius];
  const arcRight = [width / 2 + indicatorRadius, indicatorCy];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${surface}"/>
    <circle cx="${width / 2}" cy="${discCy}" r="${discRadius}" fill="${primary}"/>
    <g transform="translate(${width / 2 - glyphSize / 2}, ${discCy - glyphSize / 2})">
      <svg width="${glyphSize}" height="${glyphSize}" viewBox="0 0 100 100">${glyphInner}</svg>
    </g>
    <text id="name" x="${width / 2}" y="${nameBaselineY}" text-anchor="middle"
          font-family="Parisienne, cursive" font-size="100" fill="${primary}">Je pâtisse !</text>
    <circle cx="${width / 2}" cy="${indicatorCy}" r="${indicatorRadius}" fill="none"
            stroke="${outlineVariant}" stroke-width="${indicatorStroke}" opacity="0.55"/>
    <path d="M ${arcTop[0]} ${arcTop[1]} A ${indicatorRadius} ${indicatorRadius} 0 0 1 ${arcRight[0]} ${arcRight[1]}"
          fill="none" stroke="${primary}" stroke-width="${indicatorStroke}" stroke-linecap="round" opacity="0.55"/>
  </svg>`;
}

function splashHtml(width, height) {
  return `<!doctype html><html><head>
  <style>${fontFace}*{margin:0;padding:0}html,body{width:${width}px;height:${height}px;overflow:hidden}</style>
  </head><body>${splashSvg({ width, height })}</body></html>`;
}

// Formats iOS courants (pt device-width x device-height @ ratio de pixels).
// Doit rester synchronisé avec `lib/apple-splash-screens.ts` (balises
// <link apple-touch-startup-image> de app/layout.tsx) — même liste, tenue
// séparément pour ne pas faire dépendre ce script Node du compilateur TS.
const iosFormats = [
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
].map(({ pt, ratio }) => ({ width: pt[0] * ratio, height: pt[1] * ratio }));

async function main() {
  const iconsDir = join(racine, 'public', 'icons');
  const splashDir = join(racine, 'public', 'splash');
  mkdirSync(iconsDir, { recursive: true });
  mkdirSync(splashDir, { recursive: true });

  const executablePath = join(
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(racine, '.pw-browsers'),
    'chromium-1194',
    'chrome-linux',
    'chrome',
  );
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage();

  // Icônes Android + apple-touch-icon.
  const icons = [
    { file: 'icon-192.png', size: 192, glyphPercent: 0.54 },
    { file: 'icon-512.png', size: 512, glyphPercent: 0.54 },
    { file: 'mask-512.png', size: 512, glyphPercent: 0.43 },
    { file: 'apple-180.png', size: 180, glyphPercent: 0.54 },
  ];
  for (const { file, size, glyphPercent } of icons) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(iconHtml(size, glyphPercent, primary));
    await page.screenshot({ path: join(iconsDir, file) });
    console.log('[pwa] icône →', `public/icons/${file}`);
  }

  // Images de lancement iOS.
  for (const { width, height } of iosFormats) {
    await page.setViewportSize({ width, height });
    await page.setContent(splashHtml(width, height));
    // `document.fonts.ready` peut se résoudre avant même que la police soit
    // déclenchée si rien n'a encore forcé sa mise en page : on la charge
    // explicitement à la taille utilisée par le texte.
    await page.evaluate(() => document.fonts.load('100px Parisienne').then(() => document.fonts.ready));
    // Corrige le font-size pour que le nom occupe exactement 46 % de la
    // largeur, quelle que soit la métrie réelle de Parisienne.
    const targetWidth = width * 0.46;
    const measured = await page.evaluate(() => document.getElementById('name').getComputedTextLength());
    const correctedFontSize = (100 * targetWidth) / measured;
    await page.evaluate((fs) => {
      document.getElementById('name').setAttribute('font-size', String(fs));
    }, correctedFontSize);
    const file = `${width}x${height}.png`;
    await page.screenshot({ path: join(splashDir, file) });
    console.log('[pwa] splash iOS →', `public/splash/${file}`);
  }

  await browser.close();
}

main();
