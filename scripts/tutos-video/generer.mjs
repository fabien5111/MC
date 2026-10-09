// Génère la description Jira de chaque tuto vidéo (`tutos.mjs`), au format
// accepté par `scripts/jira.mjs creer|modifier` (markdown restreint : ##,
// ###, listes). Gabarit validé sur JEP-303 : compte, objectif, prérequis,
// pas-à-pas minuté, script de voix off en segments, montage, critères.
//
//   node scripts/tutos-video/generer.mjs <dossier>          écrit tuto-NN.md
//   node scripts/tutos-video/generer.mjs <dossier> --jira   … puis met à jour
//                                                           chaque ticket (`cle`)
//
// `--jira` ne crée rien : il remplace la description des tickets existants
// par `jira.mjs modifier`, seul chemin d'écriture vers Atlassian.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEASERS } from './teasers.mjs';
import { TUTOS } from './tutos.mjs';

/** Débit de la voix off : ~135 mots/min, une marge sous les 150 annoncés à la synthèse. */
export const MOTS_PAR_SECONDE = 2.25;

const COMPTE_DEMO =
  "Compte de démonstration dont les identifiants sont dans les paramètres de l'environnement : variables DEMO_EMAIL (adresse) et DEMO_PASSWORD (mot de passe). Ne jamais recopier ces valeurs dans le ticket, la vidéo ou sa description.";

const COMPTES = {
  demo: COMPTE_DEMO,
  payant: `${COMPTE_DEMO}\nCe tuto montre une fonction des formules payantes : le compte de démonstration doit avoir une formule payante active (ou un essai en cours) au moment du tournage, sinon la fonction apparaît verrouillée.`,
  jetable:
    "Ce tuto ne doit PAS utiliser le compte de démonstration (DEMO_EMAIL / DEMO_PASSWORD, paramètres de l'environnement) : il montre la création d'un compte, ou une action qui modifierait ses identifiants. Utiliser un compte de test jetable (adresse e-mail de test dédiée), jamais une adresse personnelle.",
  google:
    "Ce tuto ne doit PAS utiliser le compte de démonstration (DEMO_EMAIL / DEMO_PASSWORD, paramètres de l'environnement) : il montre la première connexion par Google. Utiliser un compte Google de test dédié, qui ne s'est encore jamais connecté au site.",
  visiteur:
    "Aucun compte nécessaire : la fonction est visible des visiteurs. Si un compte est utilisé, prendre le compte de démonstration dont les identifiants sont dans les paramètres de l'environnement (variables DEMO_EMAIL et DEMO_PASSWORD) ; ne jamais recopier ces valeurs dans le ticket, la vidéo ou sa description.",
};

/** Mots prononcés d'un segment : indications de pause exclues, élisions comptées à part. */
export function compterMots(texte) {
  return texte
    .replace(/\[pause[^\]]*\]/g, '')
    .split(/[\s’'-]+/)
    .filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
}

/**
 * Arrondi au pair le plus proche (22,5 → 22, 67,5 → 68) : c'est l'arrondi
 * avec lequel les tickets ont été créés — `Math.round` décalerait d'un mot le
 * plafond affiché de tous les segments de 10, 30, 50 s… à la prochaine
 * régénération, sans rien corriger.
 */
export function motsMax(duree) {
  const x = duree * MOTS_PAR_SECONDE;
  const bas = Math.floor(x);
  if (x - bas !== 0.5) return Math.round(x);
  return bas % 2 === 0 ? bas : bas + 1;
}

const horodatage = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function dureeLisible(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} s`;
  return `${m} min${r ? ` ${String(r).padStart(2, '0')}` : ''}`;
}

export const dureeTotale = (tuto) => tuto.sequences.reduce((t, s) => t + s.duree, 0);

export const titreTicket = (tuto) => `Tuto vidéo ${tuto.num} — ${tuto.titre}`;

/** Consignes de synthèse vocale communes à toutes les vidéos (tutos et teasers). */
function consignesVoix(prefixeFichier) {
  return [
    '### Consignes communes',
    "- Voix : français de France, accent neutre, ton chaleureux et encourageant. Vouvoiement, comme l'interface du site.",
    "- Débit : environ 150 mots par minute ; ne jamais dépasser le nombre de mots maximum d'un segment.",
    "- Pauses : notées [pause 1 s] ; à convertir dans la syntaxe de l'outil retenu (balise SSML <break time=\"1s\"/>, points de suspension, etc.) — ou à supprimer et laisser au montage si l'outil n'en gère pas.",
    "- Prononciation : le texte est écrit comme il se dit (« J moins un », « cent soixante-dix degrés »). Le nom du site se lit « Je pâtisse », sans marquer le point d'exclamation. Aucune abréviation, aucun symbole.",
    "- Les guillemets « » signalent un exemple cité : léger changement d'intonation, pas de pause.",
    `- Livrables : un fichier audio par segment, WAV 48 kHz, nommé ${prefixeFichier}-seg1.wav, ${prefixeFichier}-seg2.wav… pour caler chaque segment au montage.`,
    '- Garder la même voix et les mêmes réglages (vitesse, stabilité, style) pour toute la série : reprendre ceux notés en commentaire du premier tuto produit.',
  ];
}

export function description(tuto) {
  const total = dureeTotale(tuto);
  const nn = String(tuto.num).padStart(2, '0');
  const L = [];

  L.push('## Compte à utiliser', COMPTES[tuto.compte]);
  L.push("Tournage sur https://dev.jepatisse.com (www affiche encore la page d'attente).", '');

  const plan = tuto.plan === 'payant' ? 'Plan payant (fonction réservée aux formules payantes).' : 'Plan gratuit.';
  L.push('## Objectif de la vidéo', `${tuto.objectif} Message clé : « ${tuto.message} ».`);
  L.push(`Durée cible : ${dureeLisible(total)}. Tuto n° ${tuto.num} de la série (bloc « ${tuto.bloc} »). ${plan}`, '');

  L.push('## Prérequis avant tournage', ...tuto.prerequis.map((p) => `- ${p}`));
  L.push(
    tuto.mobile
      ? "- Capture sur téléphone (enregistrement d'écran natif), mode portrait, notifications du téléphone coupées."
      : '- Fenêtre navigateur en 1280 px de large minimum, zoom 100 %, notifications du poste coupées.',
    '',
  );

  L.push('## Pas-à-pas détaillé');
  let debut = 0;
  tuto.sequences.forEach((s, i) => {
    L.push(`### ${i + 1}. ${s.titre} (${horodatage(debut)} – ${horodatage(debut + s.duree)})`);
    L.push(...s.gestes.map((g, j) => `${j + 1}. ${g}`));
    L.push(`- Voix off : segment ${i + 1}`, '');
    debut += s.duree;
  });

  L.push(
    '## Voix off — texte pour la synthèse vocale',
    ...consignesVoix(`tuto-${nn}`),
    '',
    '### Script intégral (à coller segment par segment)',
  );
  tuto.sequences.forEach((s, i) => {
    L.push(`Segment ${i + 1} — ${s.duree} s — ${motsMax(s.duree)} mots max`, s.voix, '');
  });

  L.push(
    '## Consignes de montage',
    '- Saisies au clavier accélérées ou coupées au montage (champ vide → champ rempli) : jamais filmées en temps réel.',
    '- Aucun temps mort : chargements et défilements raccourcis.',
    '- Barème : clic de navigation 3 à 5 s ; champ rempli 5 s ; fonction montrée avec une phrase 10 s ; notion à faire comprendre 15 s maximum.',
    "- La voix off porte l'explication ; l'image ne s'attarde pas pendant qu'elle parle.",
    '',
  );

  L.push("## Points d'attention au tournage");
  if (!tuto.adresseVisible) L.push("- Ne pas filmer la barre d'adresse si elle affiche des paramètres ou des identifiants.");
  L.push(...(tuto.attention ?? []).map((a) => `- ${a}`), '');

  L.push(
    "## Critères d'acceptation",
    `- Vidéo de ${dureeLisible(total)} ± ${total <= 60 ? '10 s' : '15 s'}, sous-titrée en français (sous-titres = texte des segments, sans les indications de pause).`,
    '- Un fichier audio par segment, voix identique à celle des autres tutos de la série.',
    "- Toutes les étapes ci-dessus visibles, libellés à l'écran identiques à ceux cités.",
    "- Aucun identifiant du compte de démonstration visible à l'écran.",
  );
  return `${L.join('\n')}\n`;
}

// ─────────────────────────────────────────────────────────────────────────
// Teasers (15 s, 9:16, lecture sans le son)
// ─────────────────────────────────────────────────────────────────────────

/** Découpage fixe d'un teaser : accroche, démonstration, carton final (en secondes). */
export const TEMPS_TEASER = { accroche: 2, demo: 10, carton: 3 };

/** Voix du carton final, commune à tous les teasers : la promesse de l'accueil visiteur (`GuestIntro`). */
export const VOIX_CARTON = "Je pâtisse : vos recettes s'adaptent enfin.";

export const titreTeaser = (t) => `Teaser ${t.num} — ${t.titre}`;

/** Segments de voix off d'un teaser, dans l'ordre : (durée, texte). */
export const segmentsTeaser = (t) => [
  { duree: TEMPS_TEASER.accroche, voix: t.accroche.voix },
  { duree: TEMPS_TEASER.demo, voix: t.demo.voix },
  { duree: TEMPS_TEASER.carton, voix: VOIX_CARTON },
];

export function descriptionTeaser(t) {
  const { accroche: a, demo: d, carton: c } = TEMPS_TEASER;
  const total = a + d + c;
  const L = [];

  L.push('## Compte à utiliser', COMPTES[t.compte]);
  L.push("Tournage sur https://dev.jepatisse.com (www affiche encore la page d'attente).", '');

  const plan = t.plan === 'payant' ? 'Fonction des formules payantes : le carton final le précise.' : 'Fonction du plan gratuit.';
  L.push(
    '## Objectif de la vidéo',
    `Vidéo courte pour des prospects : donner envie de venir tester Je pâtisse ! en montrant UNE fonctionnalité différenciante. ${plan}`,
    `Argument : ${t.argument}`,
    `Durée : ${total} s maximum. Format vertical 9:16. Teaser n° ${t.num} sur 7.`,
    '',
  );

  L.push('## Prérequis avant tournage', ...t.prerequis.map((p) => `- ${p}`));
  L.push(
    t.mobile
      ? "- Capture sur téléphone (enregistrement d'écran natif), mode portrait, notifications coupées."
      : "- Capture d'écran du site en vue téléphone (largeur 390 px, ou téléphone réel), pour un rendu vertical lisible ; notifications coupées.",
    '',
  );

  L.push(
    '## Découpage',
    `### 1. Accroche (0:00 – 0:0${a})`,
    `1. Texte plein écran, gros caractères : « ${t.accroche.ecran} »`,
    '2. En fond, un plan appétissant de la pâtisserie concernée (ou l\'écran flouté).',
    '- Voix off : segment 1',
    '',
    `### 2. Démonstration (0:0${a} – 0:${a + d})`,
    ...t.demo.gestes.map((g, j) => `${j + 1}. ${g}`),
    `- Textes à l'écran, dans l'ordre : ${t.demo.ecran.map((e) => `« ${e} »`).join(' · ')}`,
    '- Voix off : segment 2',
    '',
    `### 3. Carton final (0:${a + d} – 0:${total})`,
    '1. Logo Je pâtisse ! et la promesse « Vos recettes s\'adaptent enfin à votre cuisine ».',
    '2. Adresse : jepatisse.com, et l\'appel à l\'action (voir ci-dessous).',
    ...(t.plan === 'payant' ? ['3. Mention « Formule payante ».'] : []),
    '- Voix off : segment 3',
    '',
  );

  L.push(
    "## Appel à l'action",
    '- « Testez gratuitement — jepatisse.com » : UNIQUEMENT si www.jepatisse.com est ouvert au public au moment de la diffusion.',
    "- Sinon : « Bientôt disponible — jepatisse.com ». Ne jamais diffuser « Testez gratuitement » tant que www affiche la page d'attente : le prospect ne pourrait pas s'inscrire.",
    '- Prévoir les deux versions du carton final au montage ; le choix se fait à la diffusion.',
    '',
  );

  L.push('## Voix off — facultative (texte pour la synthèse vocale)', ...consignesVoix(`teaser-${t.num}`));
  L.push('- Le teaser doit se comprendre SANS le son : la voix off double les textes à l\'écran, elle ne les remplace jamais.', '');
  L.push('### Script intégral (à coller segment par segment)');
  segmentsTeaser(t).forEach((s, i) => {
    L.push(`Segment ${i + 1} — ${s.duree} s — ${motsMax(s.duree)} mots max`, s.voix, '');
  });

  L.push(
    '## Consignes de montage',
    '- Format 1080 × 1920 (9:16), 30 images/s.',
    "- Recadrer et zoomer sur la zone de l'action : un écran entier est illisible sur un téléphone.",
    "- Textes à l'écran en gros caractères, polices du site (Playfair Display pour les titres, Work Sans pour le texte) : l'accroche reste à l'écran ses 2 secondes, chaque texte de la démonstration au moins 3 secondes.",
    '- Aucune saisie au clavier visible, aucun temps de chargement : coupes franches, accélérés.',
    '- Musique libre de droits, rythmée, mixée sous la voix off.',
    '- Sous-titres incrustés si la voix off est utilisée.',
    '',
  );

  L.push(
    "## Points d'attention",
    "- Ne pas filmer la barre d'adresse ni aucune donnée personnelle (pseudo réel, e-mail).",
    "- Ne pas affirmer que la fonctionnalité est « unique » ou absente de la concurrence sans l'avoir vérifié.",
    ...(t.attention ?? []).map((x) => `- ${x}`),
    '',
  );

  L.push(
    "## Critères d'acceptation",
    `- Vidéo de ${total} s maximum, 9:16, compréhensible sans le son.`,
    "- Accroche lisible dans les 2 premières secondes ; une seule fonctionnalité montrée.",
    '- Carton final livré en deux versions (« Testez gratuitement » / « Bientôt disponible »).',
    "- Aucun identifiant du compte de démonstration visible à l'écran.",
  );
  return `${L.join('\n')}\n`;
}

// ─────────────────────────────────────────────────────────────────────────
// Ligne de commande
// ─────────────────────────────────────────────────────────────────────────

/** Toutes les vidéos de la série, sous une forme commune à l'écriture et à Jira. */
export function videos() {
  return [
    ...TUTOS.map((t) => ({
      fichier: `tuto-${String(t.num).padStart(2, '0')}.md`,
      cle: t.cle,
      titre: titreTicket(t),
      duree: dureeTotale(t),
      texte: description(t),
    })),
    ...TEASERS.map((t) => ({
      fichier: `teaser-${t.num}.md`,
      cle: t.cle,
      titre: titreTeaser(t),
      duree: TEMPS_TEASER.accroche + TEMPS_TEASER.demo + TEMPS_TEASER.carton,
      texte: descriptionTeaser(t),
    })),
  ];
}

function main(argv) {
  const args = argv.slice(2);
  const jira = args.includes('--jira');
  const dossier = args.find((a) => !a.startsWith('--'));
  if (!dossier) {
    console.error('Usage : node scripts/tutos-video/generer.mjs <dossier> [--jira]');
    process.exit(1);
  }
  fs.mkdirSync(dossier, { recursive: true });
  const script = fileURLToPath(new URL('../jira.mjs', import.meta.url));

  const liste = videos();
  for (const v of liste) {
    const fichier = path.join(dossier, v.fichier);
    fs.writeFileSync(fichier, v.texte);
    console.log(`${(v.cle ?? '(à créer)').padEnd(10)} ${dureeLisible(v.duree).padStart(9)}  ${v.titre}`);
    // Une vidéo sans clé n'a pas encore de ticket : `--jira` ne crée jamais rien.
    if (jira && v.cle) execFileSync('node', [script, 'modifier', v.cle, fichier, '--titre', v.titre], { stdio: 'inherit' });
  }
  console.log(`\n${liste.length} description(s) écrite(s) dans ${dossier}${jira ? ', tickets existants mis à jour' : ''}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv);
