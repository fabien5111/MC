// Import en lot de recettes préparées dans des tickets Jira — entrées/sorties.
//
// Lancé par `.github/workflows/import-jira-recettes.yml` (via `tsx`, pour
// l'alias `@/`). Pour chaque ticket demandé :
//   1. relit `imports-jira/<CLÉ>.json` (recette déjà structurée) ;
//   2. vise le membre donné au lancement (`DESTINATAIRE`, e-mail ou pseudo —
//      jamais écrit dans le dépôt), retrouvé une fois pour tout le lot ;
//   3. saute le ticket s'il a déjà été importé (marque `Jira <CLÉ>` dans
//      `imports.fichier_original`) — relancer le workflow est donc sans risque ;
//   4. construit le brouillon avec les MÊMES fonctions que `/api/import-url`
//      (`lib/import-jira.ts`), contre le vrai référentiel `units` ;
//   5. télécharge la photo jointe au ticket, la ramène au format d'une photo
//      principale déposée depuis le site (1400 px de large, JPEG 85 %) et la
//      dépose sur `jp-photos/recettes/` ;
//   6. insère le brouillon dans `imports` (`statut = 'brouillon'`) : le membre
//      le retrouve dans ses imports et le relit dans `/relecture/[id]` ;
//   7. commente le ticket Jira et le passe à « Revue en cours » (best-effort :
//      le brouillon existe déjà, un échec Jira est signalé sans l'annuler).
//
// Une clé LOCALE (`local-<nom>`, cf. `natureCle`) désigne une recette sans
// ticket : les étapes 5 et 7 sont sautées — aucun appel à Jira, brouillon sans
// photo (à ajouter en relecture).
//
// En mode `simulation`, les étapes 1 à 5 sont jouées jusqu'au téléchargement
// et à la conversion de la photo compris, sans RIEN écrire (ni stockage, ni
// base, ni Jira).
//
// Écrit avec la clé service_role : `imports` est sous RLS « propriétaire », et
// l'auteur du brouillon n'est pas l'appelant. Rien d'autre que des brouillons
// privés n'est écrit — aucune recette n'est créée ni publiée ici, c'est le
// geste de relecture du membre qui le fera.

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  choisirPhotoJira,
  critereDestinataire,
  lireFichierImportJira,
  marqueImportJira,
  natureCle,
  preparerBrouillonJira,
  type NatureCle,
  type PieceJointeJira,
} from '@/lib/import-jira';
import { TAILLE_MAX_OCTETS } from '@/lib/storage';
import { appelJira, lireConfig, lireConfigStatuts } from './jira-api.mjs';
import { resoudreTransition, texteVersAdf } from './jira.mjs';

const MODELE = 'claude-code (import Jira)';

function env(nom: string): string {
  const v = process.env[nom];
  if (!v) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return v;
}

const MODE = (process.env.MODE || 'simulation').trim();
const SIMULATION = MODE !== 'importer';

// ── PostgREST (clé service_role) ─────────────────────────────

async function rest(chemin: string, init: RequestInit = {}): Promise<any> {
  const cle = env('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: cle,
      Authorization: `Bearer ${cle}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`PostgREST ${r.status} sur ${chemin.split('?')[0]} — ${texte.slice(0, 300)}`);
  return texte ? JSON.parse(texte) : null;
}

// ── Photo : Jira → conversion → stockage objet ───────────────

async function telechargerPiece(piece: PieceJointeJira, dossier: string): Promise<string> {
  const { email, apiToken } = lireConfig();
  const jeton = Buffer.from(`${email}:${apiToken}`).toString('base64');
  // L'URL de contenu redirige vers le service média d'Atlassian : `fetch` suit
  // la redirection (qui porte sa propre signature) et abandonne l'en-tête
  // d'authentification au changement d'origine, ce qui est le comportement
  // attendu.
  const r = await fetch(piece.content!, { headers: { Authorization: `Basic ${jeton}` } });
  if (!r.ok) throw new Error(`Téléchargement de la pièce jointe ${piece.id} : HTTP ${r.status}`);
  const fichier = path.join(dossier, `source-${piece.id}`);
  writeFileSync(fichier, Buffer.from(await r.arrayBuffer()));
  return fichier;
}

/**
 * Même traitement que `ImageSlot` sur une photo principale choisie dans le
 * site (`resizeImageToDataUrl(file, 1400)`, JPEG 0,85) : bornée en largeur,
 * jamais agrandie. `-auto-orient` avant de retirer les métadonnées, sinon une
 * photo de téléphone prise en portrait sortirait couchée ; fond blanc pour un
 * PNG transparent, que JPEG ne sait pas représenter.
 */
function convertirPhoto(source: string, dossier: string): string {
  const sortie = path.join(dossier, 'photo.jpg');
  execFileSync('convert', [
    `${source}[0]`,
    '-auto-orient',
    '-background', 'white',
    '-flatten',
    '-resize', '1400x>',
    '-strip',
    '-quality', '85',
    sortie,
  ]);
  const taille = statSync(sortie).size;
  if (taille > TAILLE_MAX_OCTETS) throw new Error(`Photo convertie trop lourde (${taille} octets).`);
  return sortie;
}

/**
 * Dépôt sur `jp-photos/recettes/<uuid>.jpg`, même clé d'objet que
 * `nouvelleCleObjet('recettes', 'image/jpeg')`. Authentifié par le jeton de
 * `swift auth` (identifiants OpenStack du workflow) plutôt que par une
 * TempURL : c'est ce jeton que les autres workflows de stockage utilisent
 * déjà. L'URL rendue est l'URL publique canonique, celle que persisterait un
 * dépôt fait depuis le site (`urlCanonique`).
 */
async function deposerPhoto(fichier: string): Promise<string> {
  const url = `${env('OS_STORAGE_URL').replace(/\/$/, '')}/jp-photos/recettes/${randomUUID()}.jpg`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'X-Auth-Token': env('OS_AUTH_TOKEN'), 'Content-Type': 'image/jpeg' },
    body: readFileSync(fichier),
  });
  if (r.status !== 201) throw new Error(`Dépôt sur le stockage objet : HTTP ${r.status}`);
  return url;
}

// ── Un ticket ────────────────────────────────────────────────

type Issue = { statut: 'importe' | 'simule' | 'deja' | 'echec'; detail: string };

type Membre = { id: string; username: string | null; full_name: string | null };

/**
 * Membre destinataire, résolu UNE fois pour tout le lot. Introuvable ou
 * ambigu = arrêt avant le premier ticket : mieux vaut ne rien importer que
 * deviner chez qui écrire.
 */
async function resoudreDestinataire(saisie: string): Promise<Membre> {
  const critere = critereDestinataire(saisie);
  if ('erreur' in critere) throw new Error(critere.erreur);
  const membres = await rest(
    `profiles?${critere.colonne}=eq.${encodeURIComponent(critere.valeur)}&select=id,username,full_name`,
  );
  if (!Array.isArray(membres) || membres.length !== 1) {
    throw new Error(
      `${Array.isArray(membres) && membres.length > 1 ? 'Plusieurs membres' : 'Aucun membre'} pour ce destinataire ` +
        `(profiles.${critere.colonne}).`,
    );
  }
  return membres[0] as Membre;
}

/** Nom affiché dans les journaux et sur Jira : le pseudo, jamais l'e-mail. */
function nomMembre(m: Membre): string {
  return m.username ?? m.full_name ?? m.id;
}

/**
 * « Revue en cours » : même garde-fou que `jira.mjs envoyer-en-test`
 * (`resoudreTransition` refuse toute transition qui mènerait au statut
 * « Déployé », celui qui déclenche l'e-mail irréversible au demandeur).
 */
async function passerEnRevue(cle: string): Promise<string> {
  const config = lireConfig();
  const statuts = lireConfigStatuts();
  const { transitions } = await appelJira(config, `/rest/api/3/issue/${encodeURIComponent(cle)}/transitions`);
  const decision = resoudreTransition(transitions, statuts.enTestId, statuts.enTestNom, statuts.deployeId, statuts.deployeNom);
  if (decision.action === 'introuvable') throw new Error(`aucune transition vers « ${statuts.enTestNom} »`);
  if (decision.action === 'refuse_deploiement') throw new Error('transition refusée : elle mènerait au statut « Déployé »');
  await appelJira(config, `/rest/api/3/issue/${encodeURIComponent(cle)}/transitions`, 'POST', {
    transition: { id: decision.transition.id },
  });
  return decision.transition.to?.name ?? statuts.enTestNom;
}

async function importerTicket(
  { cle, nature }: NatureCle,
  membre: Membre,
  units: { name: string; abbreviation: string | null }[],
): Promise<Issue> {
  // 1. Fichier préparé.
  let brut: unknown;
  try {
    brut = JSON.parse(readFileSync(path.join('imports-jira', `${cle}.json`), 'utf8'));
  } catch (e) {
    return { statut: 'echec', detail: `imports-jira/${cle}.json illisible : ${(e as Error).message}` };
  }
  const lu = lireFichierImportJira(brut, cle);
  if ('erreur' in lu) return { statut: 'echec', detail: lu.erreur };
  const { fichier } = lu;

  // 3. Idempotence — recherchée sur TOUS les membres : un ticket importé par
  // erreur sur le mauvais compte ne doit pas être réimporté en double.
  const marque = marqueImportJira(fichier.ticket);
  const deja = await rest(`imports?fichier_original=eq.${encodeURIComponent(marque)}&select=id,user_id`);
  if (Array.isArray(deja) && deja.length > 0) {
    return { statut: 'deja', detail: `déjà importé (brouillon n° ${deja[0].id}).` };
  }

  // 4. Brouillon, sans photo d'abord : une recette refusée ne doit rien
  // déposer sur le stockage.
  const essai = preparerBrouillonJira(fichier, units, null, new Date());
  if (essai.erreurs.length) return { statut: 'echec', detail: `recette refusée — ${essai.erreurs.join(' ')}` };

  // 5. Photo — seulement sur un ticket Jira : une clé locale n'en a pas.
  let piece: PieceJointeJira | null = null;
  let alertePhoto: string | null = 'Clé locale, sans ticket Jira : photo principale à ajouter en relecture.';
  if (nature === 'jira') {
    const issue = await appelJira(lireConfig(), `/rest/api/3/issue/${encodeURIComponent(cle)}?fields=attachment`);
    ({ piece, alerte: alertePhoto } = choisirPhotoJira(issue?.fields?.attachment ?? []));
  }
  let photoLocale: string | null = null;
  if (piece) {
    const dossier = mkdtempSync(path.join(tmpdir(), `import-${cle}-`));
    photoLocale = convertirPhoto(await telechargerPiece(piece, dossier), dossier);
  }

  const resume =
    `« ${fichier.recette.titre} » → ${nomMembre(membre)}, ` +
    `${essai.pivot.sous_preparations.length} étape(s), ` +
    (photoLocale ? `photo ${Math.round(statSync(photoLocale).size / 1024)} Ko` : 'sans photo') +
    (essai.alertes.length ? `, ${essai.alertes.length} alerte(s) : ${essai.alertes.join(' | ')}` : '');
  if (SIMULATION) return { statut: 'simule', detail: resume };

  const photoUrl = photoLocale ? await deposerPhoto(photoLocale) : null;
  const { pivot, alertes } = preparerBrouillonJira(fichier, units, photoUrl, new Date());
  const lignes = await rest('imports', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: membre.id,
      source_type: 'texte',
      statut: 'brouillon',
      source_url: null,
      fichier_original: marque,
      recette: pivot,
      alertes: alertePhoto ? [alertePhoto, ...alertes] : alertes,
      model: MODELE,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    }),
  }).catch((e: Error) => {
    // La photo déjà déposée reste sans ligne qui la pointe : le workflow de
    // réconciliation du stockage la signalera comme orpheline.
    throw new Error(`${e.message}${photoUrl ? ` (photo orpheline : ${photoUrl})` : ''}`);
  });
  const id = lignes?.[0]?.id;
  const resumeImport = `brouillon n° ${id} — ${resume}`;
  if (nature === 'locale') return { statut: 'importe', detail: resumeImport };

  // 7. Trace sur le ticket, puis « Revue en cours » — best-effort : le
  // brouillon existe, un échec Jira ne doit pas faire passer l'import pour
  // un échec (ni le faire rejouer : il serait sauté comme déjà importé).
  const avertissements: string[] = [];
  try {
    await appelJira(lireConfig(), `/rest/api/3/issue/${encodeURIComponent(cle)}/comment`, 'POST', {
      body: texteVersAdf(
        `Recette importée en brouillon n° ${id} pour le membre « ${nomMembre(membre)} » — ` +
          `à relire sur /relecture/${id}.${photoUrl ? '' : ' Aucune photo jointe : à ajouter en relecture.'}`,
      ),
    });
  } catch (e) {
    avertissements.push(`commentaire Jira non publié (${(e as Error).message})`);
  }
  try {
    const statut = await passerEnRevue(cle);
    avertissements.push(`ticket passé à « ${statut} »`);
  } catch (e) {
    avertissements.push(`⚠️ ticket NON passé en revue (${(e as Error).message}) — à faire à la main`);
  }

  return { statut: 'importe', detail: `${resumeImport} — ${avertissements.join(' ; ')}` };
}

// ── Lot ──────────────────────────────────────────────────────

async function main() {
  const saisies = (process.env.TICKETS || '').split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  if (!saisies.length) throw new Error('Aucune clé demandée (TICKETS vide).');
  // Clés validées AVANT tout accès à la base : une faute de frappe arrête le
  // lot plutôt que d'en importer une partie.
  const cles = new Map<string, NatureCle>();
  for (const saisie of saisies) {
    const n = natureCle(saisie);
    if ('erreur' in n) throw new Error(n.erreur);
    cles.set(n.cle, n);
  }
  const tickets = [...cles.values()];

  console.log(`Mode : ${SIMULATION ? 'SIMULATION (aucune écriture)' : 'IMPORT'} — ${tickets.length} clé(s).`);

  const membre = await resoudreDestinataire(process.env.DESTINATAIRE || '');
  console.log(`Destinataire : ${nomMembre(membre)}.`);

  const units = await rest('units?select=name,abbreviation');
  // Référentiel vide = symptôme (clé erronée, RLS), jamais un résultat : sans
  // lui, toutes les unités sortiraient « non reconnues ».
  if (!Array.isArray(units) || units.length === 0) throw new Error('Référentiel `units` vide : clé service_role à vérifier.');

  const bilan: Record<Issue['statut'], number> = { importe: 0, simule: 0, deja: 0, echec: 0 };
  for (const ticket of tickets) {
    const { cle } = ticket;
    let r: Issue;
    try {
      r = await importerTicket(ticket, membre, units);
    } catch (e) {
      r = { statut: 'echec', detail: (e as Error).message };
    }
    bilan[r.statut] += 1;
    const icone = { importe: '✅', simule: '🔎', deja: '⏭️', echec: '❌' }[r.statut];
    console.log(`${icone} ${cle} — ${r.detail}`);
  }

  console.log(
    `\nBilan : ${bilan.importe} importé(s), ${bilan.simule} simulé(s), ${bilan.deja} déjà présent(s), ${bilan.echec} échec(s).`,
  );
  if (bilan.echec > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`ÉCHEC — ${(e as Error).message}`);
  process.exit(1);
});
