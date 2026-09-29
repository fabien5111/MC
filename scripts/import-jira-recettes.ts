// Import en lot de recettes préparées dans des tickets Jira — entrées/sorties.
//
// Lancé par `.github/workflows/import-jira-recettes.yml` (via `tsx`, pour
// l'alias `@/`). Pour chaque ticket demandé :
//   1. relit `imports-jira/<CLÉ>.json` (recette déjà structurée + pseudo) ;
//   2. retrouve le membre par `profiles.username` ;
//   3. saute le ticket s'il a déjà été importé (marque `Jira <CLÉ>` dans
//      `imports.fichier_original`) — relancer le workflow est donc sans risque ;
//   4. construit le brouillon avec les MÊMES fonctions que `/api/import-url`
//      (`lib/import-jira.ts`), contre le vrai référentiel `units` ;
//   5. télécharge la photo jointe au ticket, la ramène au format d'une photo
//      principale déposée depuis le site (1400 px de large, JPEG 85 %) et la
//      dépose sur `jp-photos/recettes/` ;
//   6. insère le brouillon dans `imports` (`statut = 'brouillon'`) : le membre
//      le retrouve dans ses imports et le relit dans `/relecture/[id]` ;
//   7. commente le ticket Jira (best-effort).
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
  lireFichierImportJira,
  marqueImportJira,
  preparerBrouillonJira,
  type PieceJointeJira,
} from '@/lib/import-jira';
import { TAILLE_MAX_OCTETS } from '@/lib/storage';
import { appelJira, lireConfig } from './jira-api.mjs';
import { texteVersAdf } from './jira.mjs';

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

async function importerTicket(cle: string, units: { name: string; abbreviation: string | null }[]): Promise<Issue> {
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

  // 2. Membre destinataire.
  const pseudo = fichier.pseudo.toLowerCase();
  const membres = await rest(`profiles?username=eq.${encodeURIComponent(pseudo)}&select=id,full_name`);
  if (!Array.isArray(membres) || membres.length !== 1) {
    return { statut: 'echec', detail: `Aucun membre avec le pseudo « ${fichier.pseudo} » (profiles.username).` };
  }
  const membre = membres[0] as { id: string; full_name: string | null };

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

  // 5. Photo.
  const issue = await appelJira(lireConfig(), `/rest/api/3/issue/${encodeURIComponent(cle)}?fields=attachment`);
  const { piece, alerte: alertePhoto } = choisirPhotoJira(issue?.fields?.attachment ?? []);
  let photoLocale: string | null = null;
  if (piece) {
    const dossier = mkdtempSync(path.join(tmpdir(), `import-${cle}-`));
    photoLocale = convertirPhoto(await telechargerPiece(piece, dossier), dossier);
  }

  const resume =
    `« ${fichier.recette.titre} » → ${fichier.pseudo} (${membre.full_name ?? membre.id}), ` +
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

  // 7. Trace sur le ticket — best-effort : le brouillon existe, un
  // commentaire manqué ne doit pas faire passer l'import pour un échec.
  try {
    await appelJira(lireConfig(), `/rest/api/3/issue/${encodeURIComponent(cle)}/comment`, 'POST', {
      body: texteVersAdf(
        `Recette importée en brouillon n° ${id} pour le membre « ${fichier.pseudo} » — ` +
          `à relire sur /relecture/${id}.${photoUrl ? '' : ' Aucune photo jointe : à ajouter en relecture.'}`,
      ),
    });
  } catch (e) {
    console.warn(`  (commentaire Jira non publié : ${(e as Error).message})`);
  }

  return { statut: 'importe', detail: `brouillon n° ${id} — ${resume}` };
}

// ── Lot ──────────────────────────────────────────────────────

async function main() {
  const tickets = [...new Set((process.env.TICKETS || '').split(/[\s,;]+/).map((t) => t.trim().toUpperCase()).filter(Boolean))];
  if (!tickets.length) throw new Error('Aucun ticket demandé (TICKETS vide).');

  console.log(`Mode : ${SIMULATION ? 'SIMULATION (aucune écriture)' : 'IMPORT'} — ${tickets.length} ticket(s).`);

  const units = await rest('units?select=name,abbreviation');
  // Référentiel vide = symptôme (clé erronée, RLS), jamais un résultat : sans
  // lui, toutes les unités sortiraient « non reconnues ».
  if (!Array.isArray(units) || units.length === 0) throw new Error('Référentiel `units` vide : clé service_role à vérifier.');

  const bilan: Record<Issue['statut'], number> = { importe: 0, simule: 0, deja: 0, echec: 0 };
  for (const cle of tickets) {
    let r: Issue;
    try {
      r = await importerTicket(cle, units);
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
