#!/usr/bin/env node
// Pose la voix off ElevenLabs sur la vidéo tournée (compétence `nouveau-tuto`).
//
//   node .claude/skills/nouveau-tuto/assembler.mjs <dossier-de-sortie> <voix.mp3> [--texte voix.txt] [--silence 0.7]
//
// Le MP3 est découpé à ses silences (≥ --silence s) en autant de phrases que le
// scénario a posé de repères `cam.phrase(…)` ; chaque phrase est placée à son
// repère. On ne compte donc JAMAIS sur les balises <break> d'ElevenLabs : les
// modèles récents les ignorent, et même respectées elles ne suivent pas le
// rythme réel des chargements de page.
//
// --texte : fichier d'une phrase par ligne (même ordre) → sous-titres tuto.srt.
// Produit tuto-voix.mp4 (et tuto.srt) dans le dossier de sortie.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { duree, plagesDeParole } from './outils.mjs';

const args = process.argv.slice(2);
const opt = (nom, def) => { const i = args.indexOf(nom); return i >= 0 ? args.splice(i, 2)[1] : def; };
const fichierTexte = opt('--texte', null);
const minSilence = Number(opt('--silence', '0.7'));
const [sortie, voix] = args;
if (!sortie || !voix) {
  console.error('Usage : assembler.mjs <dossier-de-sortie> <voix.mp3> [--texte voix.txt] [--silence 0.7]');
  process.exit(2);
}
const video = path.join(sortie, 'tuto.mp4');
if (!existsSync(video)) throw new Error(`${video} absent : lancer tourner.mjs d'abord`);

const { reperes } = JSON.parse(readFileSync(path.join(sortie, 'reperes.json'), 'utf8'));
const cibles = reperes.filter((r) => r.type === 'phrase');
const plages = plagesDeParole(voix, minSilence);
const dureeVideo = duree(video);

if (plages.length !== cibles.length) {
  console.error(`Le MP3 contient ${plages.length} plage(s) de parole, le scénario attend ${cibles.length} phrase(s).`);
  plages.forEach(([d, f], i) => console.error(`  plage ${i + 1} : ${d.toFixed(2)} → ${f.toFixed(2)} s`));
  console.error('Ajuster --silence (plus grand si une phrase est coupée en deux, plus petit si deux phrases sont collées),');
  console.error('ou régénérer la voix avec un silence net entre les phrases (un retour à la ligne suffit souvent).');
  process.exit(1);
}

// Placement : chaque phrase à son repère, jamais sur la précédente.
const DEPART = 0.3; // première phrase jamais collée à la toute première image
const MARGE = 0.1; // marge de coupe autour de la parole, prise dans le silence
const ECART = 0.25; // écart minimal entre deux phrases placées
const placements = [];
let finPrecedente = null;
plages.forEach(([d, f], i) => {
  const debutCoupe = Math.max(0, d - MARGE);
  const finCoupe = f + MARGE;
  let pose = Math.max(i === 0 ? DEPART : 0, cibles[i].t);
  if (finPrecedente !== null && pose < finPrecedente + ECART) {
    console.warn(`⚠ phrase ${i + 1} (« ${cibles[i].libelle} ») décalée de ${(finPrecedente + ECART - pose).toFixed(1)} s : la précédente n'est pas finie`);
    pose = finPrecedente + ECART;
  }
  placements.push({ i, debutCoupe, finCoupe, pose, libelle: cibles[i].libelle });
  finPrecedente = pose + (finCoupe - debutCoupe);
});
if (finPrecedente > dureeVideo) {
  console.warn(`⚠ la voix finit à ${finPrecedente.toFixed(1)} s, après la vidéo (${dureeVideo.toFixed(1)} s) : retourner avec un --rythme plus lent, ou raccourcir le texte`);
}

const filtres = placements.map((p, k) =>
  `[1:a]atrim=${p.debutCoupe.toFixed(3)}:${p.finCoupe.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(p.pose * 1000)}:all=1[p${k}]`);
const mix = `${placements.map((_, k) => `[p${k}]`).join('')}amix=inputs=${placements.length}:normalize=0,apad[a]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-i', voix,
  '-filter_complex', [...filtres, mix].join(';'),
  '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
  '-t', dureeVideo.toFixed(2), '-movflags', '+faststart', path.join(sortie, 'tuto-voix.mp4')]);

console.log('Calage :');
for (const p of placements) {
  const fin = p.pose + (p.finCoupe - p.debutCoupe);
  console.log(`  ${p.pose.toFixed(1).padStart(5)} → ${fin.toFixed(1).padStart(5)} s  ${p.libelle}`);
}

if (fichierTexte) {
  const lignes = readFileSync(fichierTexte, 'utf8').split('\n').map((l) => l.replace(/<break[^>]*>/g, '').trim()).filter(Boolean);
  if (lignes.length !== placements.length) {
    console.warn(`⚠ ${lignes.length} ligne(s) dans ${fichierTexte} pour ${placements.length} phrase(s) : sous-titres non produits`);
  } else {
    const ts = (s) => {
      const ms = Math.round(s * 1000);
      const p2 = (n, l = 2) => String(n).padStart(l, '0');
      return `${p2(Math.floor(ms / 3600000))}:${p2(Math.floor(ms / 60000) % 60)}:${p2(Math.floor(ms / 1000) % 60)},${p2(ms % 1000, 3)}`;
    };
    const srt = placements.map((p, k) => `${k + 1}\n${ts(p.pose)} --> ${ts(p.pose + (p.finCoupe - p.debutCoupe))}\n${lignes[k]}\n`).join('\n');
    writeFileSync(path.join(sortie, 'tuto.srt'), srt);
    console.log(`Sous-titres : ${path.resolve(sortie, 'tuto.srt')}`);
  }
}
console.log(`Vidéo : ${path.resolve(sortie, 'tuto-voix.mp4')}`);
