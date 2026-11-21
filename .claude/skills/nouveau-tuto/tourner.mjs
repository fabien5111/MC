#!/usr/bin/env node
// Tourne une vidéo tuto à partir d'un scénario (compétence `nouveau-tuto`).
//
//   node .claude/skills/nouveau-tuto/tourner.mjs <scenario.mjs> <dossier-de-sortie> [--rythme 0.4] [--base https://dev.jepatisse.com]
//
// Produit dans le dossier de sortie (hors dépôt — scratchpad de la session) :
//   brut.webm       enregistrement complet (marqueur noir compris)
//   reperes.json    repères horodatés depuis la fin du marqueur (phrases de voix off…)
//   tuto.mp4        vidéo coupée au marqueur, sans son, 1920×1080
//   planche.png     planche d'une image par seconde, horodatée — contrôle visuel
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  chargerPlaywright, cheminChromium, LARGEUR, HAUTEUR,
  scriptCurseur, scriptBandeaux, connecter, outilsPreparation, outilsCamera,
  finDuMarqueur, duree,
} from './outils.mjs';

const args = process.argv.slice(2);
const opt = (nom, def) => { const i = args.indexOf(nom); return i >= 0 ? args.splice(i, 2)[1] : def; };
const RYTHME = Number(opt('--rythme', process.env.RYTHME || '0.4')); // 1 = lent et appuyé, 0.4 = validé en session
const BASE = opt('--base', process.env.BASE_URL || 'https://dev.jepatisse.com'); // dev : exempté de la page d'attente
const [fichierScenario, sortie] = args;
if (!fichierScenario || !sortie) {
  console.error('Usage : tourner.mjs <scenario.mjs> <dossier-de-sortie> [--rythme 0.4] [--base URL]');
  process.exit(2);
}

const scenario = await import(pathToFileURL(path.resolve(fichierScenario)).href);
const t0 = Date.now();
const chrono = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`);

mkdirSync(sortie, { recursive: true });
const dossierVideo = path.join(sortie, '.enregistrement');
rmSync(dossierVideo, { recursive: true, force: true });

const { chromium } = await chargerPlaywright();
const browser = await chromium.launch({ executablePath: cheminChromium() });
let donnees;
let reperes;
try {
  // --- Hors caméra : connexion, puis préparation du compte démo par le scénario
  const prep = await browser.newContext({ viewport: { width: LARGEUR, height: HAUTEUR }, locale: 'fr-FR' });
  const pp = await prep.newPage();
  await connecter(pp, BASE);
  chrono('connecté (hors caméra)');
  donnees = scenario.preparer ? await scenario.preparer(outilsPreparation(pp, BASE, chrono)) : {};
  const session = await prep.storageState();
  await prep.close();

  // --- Tournage, déjà connecté
  const ctx = await browser.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR },
    deviceScaleFactor: 1,
    locale: 'fr-FR',
    storageState: session,
    recordVideo: { dir: dossierVideo, size: { width: LARGEUR, height: HAUTEUR } },
  });
  await ctx.addInitScript(scriptCurseur);
  await ctx.addInitScript(scriptBandeaux);
  const page = await ctx.newPage();
  const cam = outilsCamera(page, BASE, chrono, RYTHME);
  await cam.aller(scenario.depart || '/');
  await cam.marqueurDebut();
  chrono('début de la vidéo');
  await scenario.tourner(cam, donnees);
  await cam.pause(1500); // image finale tenue un instant
  reperes = cam.reperes;
  await ctx.close();

  // --- Hors caméra : remise du compte démo dans son état d'origine
  if (scenario.remettre) {
    const apres = await browser.newContext({ viewport: { width: LARGEUR, height: HAUTEUR }, locale: 'fr-FR', storageState: session });
    await scenario.remettre(outilsPreparation(await apres.newPage(), BASE, chrono), donnees);
    await apres.close();
    chrono('compte démo remis dans son état d\'origine');
  }
} finally {
  await browser.close();
}

// --- Fichiers de sortie
const webm = readdirSync(dossierVideo).find((f) => f.endsWith('.webm'));
renameSync(path.join(dossierVideo, webm), path.join(sortie, 'brut.webm'));
rmSync(dossierVideo, { recursive: true, force: true });
writeFileSync(path.join(sortie, 'reperes.json'), JSON.stringify({ base: BASE, rythme: RYTHME, reperes }, null, 2));

const brut = path.join(sortie, 'brut.webm');
const debut = finDuMarqueur(brut);
chrono(`marqueur noir terminé à ${debut.toFixed(2)} s dans l'enregistrement`);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(debut), '-i', brut,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
  path.join(sortie, 'tuto.mp4')]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(sortie, 'tuto.mp4'),
  '-vf', "fps=1,scale=480:-1,drawtext=text='%{pts\\:hms}':fontcolor=red:fontsize=28:x=10:y=10,tile=4x10",
  '-frames:v', '1', path.join(sortie, 'planche.png')]);
console.log(`Durée : ${duree(path.join(sortie, 'tuto.mp4')).toFixed(1)} s`);
console.log(`Sortie : ${path.resolve(sortie)}/{tuto.mp4,planche.png,reperes.json}`);
