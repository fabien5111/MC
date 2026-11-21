// Briques communes du tournage d'une vidéo tuto (compétence `nouveau-tuto`).
//
// Un scénario (`scenarios/*.mjs`) n'importe rien d'autre que ce qu'on lui
// passe : `preparer(prep)` hors caméra, `tourner(cam)` devant elle. C'est
// `tourner.mjs` qui orchestre — navigateur, connexion, enregistrement, repères.
import { createRequire } from 'node:module';
import { execSync, spawnSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Playwright n'est pas une dépendance du site : on le prend là où l'environnement
// l'a installé (global en session cloud), sans l'ajouter à package.json.
export async function chargerPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const racine = execSync('npm root -g').toString().trim();
    const req = createRequire(path.join(racine, 'noop.js'));
    return req('playwright');
  }
}

// Chromium préinstallé de la session cloud ; ailleurs, celui de Playwright.
export function cheminChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of ['chromium-1194', 'chromium']) {
    const p = path.join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

export const LARGEUR = 1920;
export const HAUTEUR = 1080;

// Curseur visible : l'enregistrement de Playwright ne capte pas le pointeur.
export function scriptCurseur() {
  const install = () => {
    if (document.getElementById('__curseur')) return;
    const c = document.createElement('div');
    c.id = '__curseur';
    c.style.cssText =
      'position:fixed;z-index:2147483647;width:22px;height:22px;border-radius:50%;background:rgba(220,60,90,.35);border:2px solid rgba(160,30,60,.9);pointer-events:none;transform:translate(-50%,-50%);transition:width .15s,height .15s;left:-50px;top:-50px';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { c.style.width = c.style.height = '34px'; }, true);
    addEventListener('mouseup', () => { c.style.width = c.style.height = '22px'; }, true);
  };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', install) : install();
}

// Bandeau cookies (choix « refuser » déjà fait) et bannière d'installation PWA
// (déjà fermée) : hors sujet dans un tuto. Clés : `lib/consent.ts`,
// `lib/use-install-prompt.ts` — à suivre si elles changent.
export function scriptBandeaux() {
  try {
    localStorage.setItem('jp-consentement-audience', JSON.stringify({ choix: 'refuse', le: Date.now() }));
    localStorage.setItem('maryse.pwa.install-dismissed-at', String(Date.now()));
  } catch {}
}

// Connexion hors caméra : l'adresse du compte démo ne doit jamais être filmée.
export async function connecter(page, base) {
  const { DEMO_EMAIL, DEMO_PASSWORD } = process.env;
  if (!DEMO_EMAIL || !DEMO_PASSWORD) throw new Error('Variables DEMO_EMAIL / DEMO_PASSWORD absentes de l\'environnement');
  await page.goto(`${base}/connexion`, { waitUntil: 'networkidle' });
  await page.locator('input[type=email]').first().fill(DEMO_EMAIL);
  await page.locator('input[type=password]').first().fill(DEMO_PASSWORD);
  await page.locator('button[type=submit]').first().click();
  await page
    .waitForURL((u) => !u.pathname.startsWith('/connexion'), { timeout: 30000 })
    .catch(() => {
      throw new Error('Connexion impossible : vérifier les identifiants, et que auth.jepatisse.com est autorisé par le réseau de la session');
    });
}

// Les écritures du site sont souvent OPTIMISTES (le cœur se remplit avant la
// réponse) : un geste n'est réussi que si la requête PostgREST répond < 400.
// Exemple vécu : quota de 20 favoris dépassé, cœur rempli à l'écran, 400 en base.
export async function verifierEcriture(page, fragmentUrl, geste) {
  const attente = page.waitForResponse((r) => r.url().includes(fragmentUrl) && r.request().method() !== 'GET', { timeout: 20000 }).catch(() => null);
  await geste();
  const rep = await attente;
  if (!rep) throw new Error(`Aucune écriture vers ${fragmentUrl} après le geste`);
  if (rep.status() >= 400) throw new Error(`Écriture refusée (${rep.status()}) : ${await rep.text()}`);
  return rep.status();
}

// Outils de préparation (hors caméra), pour remettre le compte démo dans l'état
// voulu AVANT le tournage. Tout ce qui est défait ici doit être refait à l'écran :
// l'état final du compte reste celui de départ.
export function outilsPreparation(page, base, chrono) {
  return {
    page,
    base,
    chrono,
    // Hrefs des fiches recettes visibles sur l'accueil (sans paramètres).
    async recettesAccueil() {
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      return page
        .locator('a[href^="/recette/"]')
        .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')).filter((h) => h && !h.includes('?')))]);
    },
    // Recettes d'une section de l'accueil, repérée par son titre (« Dernières
    // Créations »…), dans l'ordre d'affichage : [{ href, titre }]. Préférer ceci
    // à des titres codés en dur — le contenu de l'accueil change d'une semaine à l'autre.
    async recettesSection(titreSection) {
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      const liste = await page.evaluate((t) => {
        const h = [...document.querySelectorAll('h1,h2,h3')].find((e) => e.textContent.trim().toLowerCase() === t.toLowerCase());
        if (!h) return null;
        let bloc = h.parentElement;
        while (bloc && !bloc.querySelector('a[href^="/recette/"]')) bloc = bloc.parentElement;
        if (!bloc) return [];
        const vus = new Set();
        return [...bloc.querySelectorAll('a[href^="/recette/"]')]
          .map((a) => a.getAttribute('href'))
          .filter((href) => !href.includes('?') && !vus.has(href) && vus.add(href));
      }, titreSection);
      if (liste === null) throw new Error(`Section « ${titreSection} » absente de l'accueil`);
      const res = [];
      for (const href of liste) {
        await page.goto(base + href, { waitUntil: 'domcontentloaded' });
        await page.locator('h1').first().waitFor();
        res.push({ href, titre: (await page.locator('h1').first().innerText()).trim() });
      }
      return res;
    },
    // Retrouve une recette par son titre exact parmi des hrefs.
    async trouverRecette(hrefs, titre) {
      for (const href of hrefs) {
        await page.goto(base + href, { waitUntil: 'domcontentloaded' });
        await page.locator('h1').first().waitFor();
        if ((await page.locator('h1').first().innerText()).trim().toLowerCase() === titre.toLowerCase()) return href;
      }
      throw new Error(`Recette « ${titre} » introuvable`);
    },
    // La recette est-elle en favori ? (lu sur sa fiche)
    async estFavori(href) {
      await page.goto(base + href, { waitUntil: 'networkidle' });
      return (await page.locator('button[aria-label="Retirer des favoris"]').count()) > 0;
    },
    // Retire le favori d'une recette (page de la fiche) s'il est posé.
    async retirerFavori(href) {
      await page.goto(base + href, { waitUntil: 'networkidle' });
      const b = page.locator('button[aria-label="Retirer des favoris"]').first();
      if (!(await b.count())) return false;
      const st = await verifierEcriture(page, '/rest/v1/favorites', () => b.click());
      chrono(`favori retiré hors caméra (${st}) : ${href}`);
      return true;
    },
  };
}

// Outils de tournage, passés au scénario.
export function outilsCamera(page, base, chrono, rythme) {
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const pause = (ms) => attendre(ms * rythme);
  const reperes = [];
  let t0 = null; // instant du marqueur de début dans la vidéo

  const cam = {
    page,
    base,
    pause,
    chrono,

    // Écran noir d'un instant, détecté par l'assemblage (blackdetect) : il marque
    // le vrai début de la vidéo (page chargée, images comprises) ET l'origine des
    // repères. Le site n'a aucun écran noir, la détection est sans ambiguïté.
    async marqueurDebut() {
      await page.evaluate(() => {
        const n = document.createElement('div');
        n.id = '__marqueur';
        n.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647';
        document.documentElement.appendChild(n);
      });
      await attendre(500);
      await page.evaluate(() => document.getElementById('__marqueur')?.remove());
      t0 = Date.now();
    },

    // Repère horodaté depuis la fin du marqueur. `phrase` : instant où la phrase
    // de voix off correspondante doit commencer (lu par assembler.mjs).
    repere(type, libelle) {
      const t = t0 === null ? 0 : (Date.now() - t0) / 1000;
      reperes.push({ t: Number(t.toFixed(2)), type, libelle });
      chrono(`repère ${type} « ${libelle} » à ${t.toFixed(1)} s`);
    },
    phrase(libelle) { cam.repere('phrase', libelle); },
    reperes,

    // Page chargée, polices et images visibles comprises (sinon on filme des
    // cadres vides ou les noms d'icônes Material Symbols en texte brut).
    async attendrePage() {
      await page.waitForLoadState('networkidle');
      await page.evaluate(async () => {
        await document.fonts.ready;
        const imgs = [...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight);
        await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      });
    },

    async aller(chemin) {
      await page.goto(base + chemin, { waitUntil: 'networkidle' });
      await cam.attendrePage();
    },

    // Défilement visible (jamais un saut) jusqu'à l'élément, laissé à ~260 px du haut.
    async defiler(loc) {
      const y = await loc.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 260);
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'smooth' }), y);
      await attendre(1200);
    },

    async remonter() {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await attendre(800);
    },

    // Déplacement du curseur jusqu'au centre de l'élément.
    async viser(loc) {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      if (!b) throw new Error('Élément invisible : ' + loc);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
      await pause(400);
    },

    async cliquer(loc) {
      await cam.viser(loc);
      await page.mouse.down();
      await attendre(120);
      await page.mouse.up();
    },

    async taper(loc, texte) {
      await cam.cliquer(loc);
      await loc.pressSequentially(texte, { delay: 70 });
    },

    // Lien de l'en-tête (« Mon carnet », « Accueil »…) : un clic filmé, jamais un goto.
    lienEntete(nom) {
      return page.locator('header').getByRole('link', { name: nom, exact: true }).first();
    },

    verifierEcriture: (fragmentUrl, geste) => verifierEcriture(page, fragmentUrl, geste),
  };
  return cam;
}

// --- ffmpeg ---------------------------------------------------------------

// ffmpeg écrit ses analyses (blackdetect, silencedetect) sur stderr.
function analyseFfmpeg(argsFf) {
  const r = spawnSync('ffmpeg', argsFf, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('ffmpeg : ' + r.stderr.slice(-500));
  return r.stderr;
}

export function duree(fichier) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fichier]).toString());
}

// Fin du marqueur noir posé par `cam.marqueurDebut()` : vrai début du tuto.
export function finDuMarqueur(fichier) {
  const log = analyseFfmpeg(['-i', fichier, '-vf', 'blackdetect=d=0.1:pix_th=0.10', '-an', '-f', 'null', '-']);
  const m = log.match(/black_end:([0-9.]+)/);
  if (!m) throw new Error('Marqueur noir introuvable dans ' + fichier);
  return Number(m[1]) + 0.05;
}

// Plages de parole d'un fichier audio, séparées par des silences d'au moins
// `minSilence` secondes. Les silences plus courts (virgules, « : ») restent
// à l'intérieur d'une phrase.
export function plagesDeParole(fichier, minSilence = 0.7, seuil = '-40dB') {
  const total = duree(fichier);
  const log = analyseFfmpeg(['-i', fichier, '-af', `silencedetect=noise=${seuil}:d=${minSilence}`, '-f', 'null', '-']);
  const debuts = [...log.matchAll(/silence_start: ([0-9.]+)/g)].map((m) => Number(m[1]));
  const fins = [...log.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => Number(m[1]));
  const silences = debuts.map((d, i) => [d, fins[i] ?? total]);
  const plages = [];
  let curseur = 0;
  for (const [d, f] of silences) {
    if (d - curseur > 0.15) plages.push([curseur, d]);
    curseur = f;
  }
  if (total - curseur > 0.15) plages.push([curseur, total]);
  return plages;
}
