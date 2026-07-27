'use client';

// Extraction d'une recette depuis un PDF, côté navigateur (pdf.js).
//
// Pourquoi côté navigateur et pas dans la route serverless :
//  - le fichier ne transite pas (un PDF illustré pèse vite plusieurs Mo, au-delà
//    de ce qu'accepte confortablement une fonction serverless) ;
//  - la décompression des images demande un `canvas`, disponible ici sans
//    dépendance native supplémentaire ;
//  - la route `/api/import-url` reste inchangée : elle reçoit du texte, comme
//    pour le copier-coller.
//
// Le texte produit porte des marqueurs « --- page N --- » : c'est le seul
// rattachement fiable entre une photo et une étape (une image d'un PDF est un
// objet posé à des coordonnées de page, elle n'est rattachée à rien d'autre).
// L'IA reporte ce numéro dans chaque étape, et `affecterPhotos` s'en sert.

import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type PhotoPdf = {
  /** data-URL JPEG compressée (prête à être stockée en base, cf. lib/images.ts). */
  url: string;
  /** Page du PDF d'où provient l'image (1-indexé). */
  page: number;
  /** Surface d'origine en pixels : sert à désigner la photo principale. */
  surface: number;
};

export type ExtractionPdf = {
  texte: string;
  nbPages: number;
  photos: PhotoPdf[];
  /** Vrai si des images ont été détectées mais qu'aucune n'a pu être décodée. */
  imagesIllisibles: boolean;
};

// Garde-fous. Une recette tient en quelques pages : au-delà, on a affaire à un
// livre entier, que l'extraction complète ferait déborder du contexte de l'IA.
const MAX_PAGES = 40;
const MAX_PHOTOS = 12;
// Côté minimal d'une image retenue : en deçà, c'est un logo, un picto ou un
// filet de mise en page, pas une photo de recette.
const MIN_COTE_PX = 200;
// Rapport largeur/hauteur au-delà duquel l'image est un bandeau décoratif.
const RATIO_MAX = 4;
const MAX_LARGEUR = 800;
const QUALITE_JPEG = 0.75;
// Budget total des photos : elles sont stockées en data-URL dans le JSON du
// brouillon (`imports.recette`), comme partout ailleurs dans l'application.
const BUDGET_PHOTOS_OCTETS = 1_500_000;

// Variante « legacy » et non la version standard : celle-ci s'appuie sur des
// primitives que seuls les navigateurs de moins d'un an fournissent
// (`Math.sumPrecise`, `Map.prototype.getOrInsertComputed`), et échoue ailleurs
// avec une erreur illisible. La variante legacy embarque les polyfills
// correspondants. Le worker recopié dans `public/` doit venir du même dossier
// (cf. scripts/copy-pdf-worker.mjs).
type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromise: Promise<Pdfjs> | null = null;

// Chargement paresseux : pdf.js ne doit pas entrer dans le bundle initial, il
// n'est utile qu'à l'ouverture de l'onglet « PDF » de l'import.
function chargerPdfjs(): Promise<Pdfjs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
    // Le worker est recopié dans `public/` par scripts/copy-pdf-worker.mjs.
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return pdfjs;
  });
  return pdfjsPromise;
}

// ── Texte ────────────────────────────────────────────────────

type Morceau = { x: number; y: number; texte: string; largeur: number; hauteur: number };

// Reconstitution des lignes à partir des morceaux de texte positionnés.
// pdf.js expose un drapeau `hasEOL`, mais il dépend des opérateurs de fin de
// ligne réellement présents dans le flux : un PDF qui positionne chaque mot
// séparément n'en produit aucun. Le regroupement par ordonnée est indépendant
// de la façon dont le générateur a écrit le fichier.
function assemblerLignes(morceaux: Morceau[]): string {
  if (!morceaux.length) return '';
  const hauteurMediane = medianeHauteur(morceaux);
  const tolerance = Math.max(2, hauteurMediane * 0.5);

  const lignes: Morceau[][] = [];
  // Ordonnées décroissantes : dans un PDF, l'origine est en bas de page.
  [...morceaux]
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .forEach((m) => {
      const derniere = lignes[lignes.length - 1];
      if (derniere && Math.abs(derniere[0].y - m.y) <= tolerance) derniere.push(m);
      else lignes.push([m]);
    });

  return lignes
    .map((ligne) =>
      [...ligne]
        .sort((a, b) => a.x - b.x)
        .reduce((acc, m, i, tous) => {
          if (i === 0) return m.texte;
          const precedent = tous[i - 1];
          const ecart = m.x - (precedent.x + precedent.largeur);
          // Espace inséré uniquement si l'écart le justifie : concaténer
          // systématiquement collerait les mots, séparer systématiquement
          // couperait ceux que le PDF a découpés en plusieurs morceaux
          // (crénage, polices en sous-ensemble).
          const separateur = ecart > Math.max(1, m.hauteur * 0.2) ? ' ' : '';
          return acc + separateur + m.texte;
        }, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

function medianeHauteur(morceaux: Morceau[]): number {
  const hauteurs = morceaux.map((m) => m.hauteur).filter((h) => h > 0).sort((a, b) => a - b);
  return hauteurs.length ? hauteurs[Math.floor(hauteurs.length / 2)] : 10;
}

async function extraireTexte(page: PDFPageProxy): Promise<string> {
  const contenu = await page.getTextContent();
  const morceaux: Morceau[] = [];
  for (const item of contenu.items) {
    if (!('str' in item) || !item.str) continue;
    const t = item.transform as number[];
    morceaux.push({
      x: t[4],
      y: t[5],
      texte: item.str,
      largeur: item.width ?? 0,
      hauteur: item.height || Math.abs(t[3]) || 10,
    });
  }
  return assemblerLignes(morceaux);
}

// ── Images ───────────────────────────────────────────────────

type ImagePdf = { bitmap?: CanvasImageSource; data?: Uint8ClampedArray; width: number; height: number; kind?: number };

// Les objets image sont résolus de façon asynchrone par le worker pendant la
// construction de la liste d'opérateurs. `objs.get(id)` lève tant que l'objet
// n'est pas prêt : on passe par la forme à rappel, bornée dans le temps pour ne
// pas bloquer l'import sur une image qui n'arrivera jamais.
function resoudreObjet(page: PDFPageProxy, objId: string): Promise<ImagePdf | null> {
  const registre = objId.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    let repondu = false;
    const fini = (v: ImagePdf | null) => {
      if (!repondu) {
        repondu = true;
        resolve(v);
      }
    };
    const minuteur = setTimeout(() => fini(null), 5000);
    try {
      registre.get(objId, (data: unknown) => {
        clearTimeout(minuteur);
        fini((data as ImagePdf) ?? null);
      });
    } catch {
      clearTimeout(minuteur);
      fini(null);
    }
  });
}

// Une image de pdf.js arrive soit déjà décodée (`bitmap`), soit en pixels bruts
// dans l'un des trois formats de `ImageKind`. On la ramène dans un canvas, seul
// point de passage vers une data-URL.
function versCanvas(img: ImagePdf, ImageKind: { GRAYSCALE_1BPP: number; RGB_24BPP: number; RGBA_32BPP: number }): HTMLCanvasElement | null {
  const { width, height } = img;
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
    return canvas;
  }
  if (!img.data) return null;

  const cible = ctx.createImageData(width, height);
  const dest = cible.data;
  const src = img.data;
  if (img.kind === ImageKind.RGBA_32BPP) {
    dest.set(src.subarray(0, dest.length));
  } else if (img.kind === ImageKind.RGB_24BPP) {
    for (let i = 0, j = 0; j < dest.length; i += 3, j += 4) {
      dest[j] = src[i];
      dest[j + 1] = src[i + 1];
      dest[j + 2] = src[i + 2];
      dest[j + 3] = 255;
    }
  } else if (img.kind === ImageKind.GRAYSCALE_1BPP) {
    // 1 bit par pixel, lignes alignées sur l'octet ; 0 = noir.
    const octetsParLigne = (width + 7) >> 3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = (src[y * octetsParLigne + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const j = (y * width + x) * 4;
        dest[j] = dest[j + 1] = dest[j + 2] = v;
        dest[j + 3] = 255;
      }
    }
  } else {
    return null;
  }
  ctx.putImageData(cible, 0, 0);
  return canvas;
}

// Réduction + encodage JPEG, mêmes réglages d'esprit que lib/images.ts
// (les photos finissent au même endroit : une data-URL en base).
function compresser(canvas: HTMLCanvasElement): string | null {
  const echelle = Math.min(1, MAX_LARGEUR / canvas.width);
  if (echelle === 1) return canvas.toDataURL('image/jpeg', QUALITE_JPEG);
  const reduit = document.createElement('canvas');
  reduit.width = Math.max(1, Math.round(canvas.width * echelle));
  reduit.height = Math.max(1, Math.round(canvas.height * echelle));
  const ctx = reduit.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, reduit.width, reduit.height);
  return reduit.toDataURL('image/jpeg', QUALITE_JPEG);
}

function retenir(largeur: number, hauteur: number): boolean {
  if (largeur < MIN_COTE_PX || hauteur < MIN_COTE_PX) return false;
  const ratio = largeur / hauteur;
  return ratio <= RATIO_MAX && ratio >= 1 / RATIO_MAX;
}

// Rendu d'une page entière : filet de sécurité quand la page contient
// visiblement des images mais qu'aucune n'a pu être décodée (formats exotiques,
// images en masque, tuiles). Mieux vaut proposer la page à découper que rien.
async function rendrePage(page: PDFPageProxy): Promise<string | null> {
  const viewport = page.getViewport({ scale: 1 });
  const echelle = Math.min(2, MAX_LARGEUR / viewport.width);
  const rendu = page.getViewport({ scale: echelle });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rendu.width);
  canvas.height = Math.round(rendu.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport: rendu }).promise;
  return canvas.toDataURL('image/jpeg', QUALITE_JPEG);
}

// ── Extraction complète ──────────────────────────────────────

export async function extrairePdf(
  fichier: File,
  onProgres?: (pageCourante: number, total: number) => void,
): Promise<ExtractionPdf> {
  const pdfjs = await chargerPdfjs();
  const { OPS, ImageKind } = pdfjs;
  const donnees = new Uint8Array(await fichier.arrayBuffer());
  const tache = pdfjs.getDocument({ data: donnees });
  const doc = await tache.promise;

  const nbPages = Math.min(doc.numPages, MAX_PAGES);
  const blocs: string[] = [];
  const photos: PhotoPdf[] = [];
  const vues = new Set<string>();
  const pagesAvecImagesNonDecodees: number[] = [];
  let octets = 0;

  try {
    for (let n = 1; n <= nbPages; n++) {
      onProgres?.(n, nbPages);
      const page = await doc.getPage(n);
      try {
        const texte = await extraireTexte(page);
        blocs.push(`--- page ${n} ---\n${texte}`);

        const ops = await page.getOperatorList();
        let imagesVues = 0;
        let imagesDecodees = 0;

        for (let i = 0; i < ops.fnArray.length; i++) {
          const fn = ops.fnArray[i];
          const estReference = fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat;
          const estIncorporee = fn === OPS.paintInlineImageXObject;
          if (!estReference && !estIncorporee) continue;
          imagesVues++;
          if (photos.length >= MAX_PHOTOS || octets >= BUDGET_PHOTOS_OCTETS) continue;

          const arg = ops.argsArray[i][0];
          // Une même image réutilisée sur plusieurs pages porte le même
          // identifiant : on ne la retient qu'une fois (bandeaux, filigranes).
          const cle = estReference ? String(arg) : `inline:${n}:${i}`;
          if (vues.has(cle)) continue;
          vues.add(cle);

          const img = estReference ? await resoudreObjet(page, String(arg)) : (arg as ImagePdf);
          if (!img?.width || !img?.height) continue;
          imagesDecodees++;
          if (!retenir(img.width, img.height)) continue;

          const canvas = versCanvas(img, ImageKind);
          if (!canvas) continue;
          const url = compresser(canvas);
          if (!url) continue;
          octets += url.length;
          photos.push({ url, page: n, surface: img.width * img.height });
        }

        if (imagesVues > 0 && imagesDecodees === 0) pagesAvecImagesNonDecodees.push(n);
      } finally {
        page.cleanup();
      }
    }

    // Repli : aucune image exploitable alors que le document en contient.
    if (!photos.length && pagesAvecImagesNonDecodees.length) {
      for (const n of pagesAvecImagesNonDecodees.slice(0, 4)) {
        const page = await doc.getPage(n);
        try {
          const url = await rendrePage(page);
          if (url) photos.push({ url, page: n, surface: 0 });
        } catch {
          /* page non rendue : on continue, les photos restent facultatives */
        } finally {
          page.cleanup();
        }
      }
    }

    return {
      texte: blocs.join('\n\n').trim(),
      nbPages: doc.numPages,
      photos,
      imagesIllisibles: !photos.length && pagesAvecImagesNonDecodees.length > 0,
    };
  } finally {
    // Libère le worker et les bitmaps conservés par pdf.js pour ce document.
    await tache.destroy();
  }
}

// ── Affectation des photos aux étapes ────────────────────────

type Pivot = Record<string, any>;

/**
 * Place les photos extraites dans le brouillon : la plus grande devient la
 * photo principale, les autres rejoignent l'étape dont l'IA a indiqué la page.
 *
 * L'affectation par page est une aide à la saisie, pas une vérité : elle est
 * signalée en alerte et reste corrigeable à la relecture. Les photos dont la
 * page ne correspond à aucune étape sont conservées dans `photos_pdf`, la
 * banque affichée en tête de l'écran de relecture.
 *
 * Fonction pure (hors mutation de son argument) : testable sans navigateur.
 */
export function affecterPhotos(pivot: Pivot, photos: PhotoPdf[]): { affectees: number; enBanque: number } {
  if (!photos.length) return { affectees: 0, enBanque: 0 };
  const restantes = [...photos];

  // Photo principale : la plus grande image du document. Sur un repli en rendu
  // de page (`surface` à 0), c'est la première page illustrée.
  if (!pivot.photo_principale) {
    const meilleure = restantes.reduce((a, b) => (b.surface > a.surface ? b : a), restantes[0]);
    pivot.photo_principale = meilleure.url;
    restantes.splice(restantes.indexOf(meilleure), 1);
  }

  let affectees = 0;
  const sps: Pivot[] = Array.isArray(pivot.sous_preparations) ? pivot.sous_preparations : [];
  for (const sp of sps) {
    const page = Number(sp.page);
    if (!Number.isFinite(page)) continue;
    const dejaPresentes = Array.isArray(sp.photos) ? sp.photos.filter(Boolean) : [];
    const libres = 4 - dejaPresentes.length;
    if (libres <= 0) continue;
    const pourEtape = restantes.filter((p) => p.page === page).slice(0, libres);
    if (!pourEtape.length) continue;
    sp.photos = [...dejaPresentes, ...pourEtape.map((p) => p.url)];
    affectees += pourEtape.length;
    pourEtape.forEach((p) => restantes.splice(restantes.indexOf(p), 1));
  }

  pivot.photos_pdf = restantes.map((p) => ({ url: p.url, page: p.page }));
  return { affectees, enBanque: restantes.length };
}
