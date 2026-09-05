// Lot B3 — reprise des images déjà en base (data-URL) vers le stockage
// objet. SERVER-ONLY : clé service_role (contourne la RLS — cohérent avec
// une opération d'administration qui écrit sur des lignes appartenant à
// n'importe quel membre, pas seulement celles de l'admin qui déclenche) et
// signature TempURL (`node:crypto`, via lib/storage-data.ts). Les cibles
// (pure, sans clé) vivent dans `lib/backfill.ts` — même séparation que
// `ideas.ts` / `ideas-data.ts`, sans quoi l'écran client tirerait la clé
// service_role dans son bundle.
//
// Différence structurelle avec le B2 : ici le serveur a DÉJÀ la data-URL,
// lue en base — il peut donc la déposer directement sur Swift (`PUT` signé,
// sans aller-retour navigateur), sans passer par
// `/api/stockage/televersement` ni par `lib/storage-client.ts`
// `televerserImage()`, qui sont pensés pour un appelant côté navigateur.
//
// Jamais de suppression de la data-URL d'origine ici — c'est le B4, une fois
// la reprise vérifiée (§ 7.5).
import { createAdminClient } from '@/lib/supabase/admin';
import {
  CONTENEUR_PUBLIC,
  estDataUrlImage,
  estMimeAccepte,
  estUrlStockage,
  nouvelleCleObjet,
  USAGES,
  type MimeAccepte,
  type Usage,
} from '@/lib/storage';
import { urlAffichablePrivee, urlCanonique, urlDeTeleversement } from '@/lib/storage-data';
import type { CibleScalaire } from '@/lib/backfill';

function mimeDeDataUrl(dataUrl: string): MimeAccepte | null {
  const mime = /^data:([^;]+);base64,/.exec(dataUrl)?.[1];
  return mime && estMimeAccepte(mime) ? mime : null;
}

/**
 * Dépose une data-URL directement sur le stockage objet — pendant SERVEUR de
 * `televerserImage()` (lib/storage-client.ts), sans aller-retour navigateur.
 * Lève si le format n'est pas reconnu ou si le dépôt est refusé : l'appelant
 * décide alors du sort de LA LIGNE, jamais de tout le lot — une photo ratée
 * ne doit jamais faire perdre les autres (même doctrine que `validerPhotos`).
 */
export async function deposerDataUrlServeur(usage: Usage, dataUrl: string): Promise<string> {
  const mime = mimeDeDataUrl(dataUrl);
  if (!mime) throw new Error('Format de data-URL non reconnu.');
  const decl = USAGES[usage];
  const cle = nouvelleCleObjet(decl.prefixe, mime);
  const octets = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const reponse = await fetch(urlDeTeleversement(decl.conteneur, cle), {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: octets,
  });
  if (!reponse.ok) throw new Error(`Dépôt refusé par le stockage (${reponse.status}).`);
  return urlCanonique(decl.conteneur, cle);
}

export type EchecLot = { cle: string; colonne: string; motif: string };
export type ResultatLot = { traites: number; echecs: number; restant: boolean; details: EchecLot[] };

const TAILLE_LOT = 20;

/**
 * Traite un lot d'une cible « scalaire » (une ou plusieurs colonnes texte
 * simples, cf. `lib/backfill.ts` `CIBLES_BACKFILL`) : sélectionne les lignes
 * où AU MOINS une des colonnes est encore une data-URL, dépose chacune
 * indépendamment, écrit ce qui a réussi. Une ligne partiellement migrée
 * reste sélectionnée au lot suivant — la colonne déjà migrée est ignorée
 * (`estDataUrlImage` la reconnaît comme stable), seule celle en échec est
 * retentée. Auto-cicatrisant, sans état à suivre entre deux lots.
 */
export async function traiterLotScalaire(cible: CibleScalaire, tailleLot = TAILLE_LOT): Promise<ResultatLot> {
  const client = createAdminClient();
  const filtre = cible.colonnes.map((c) => `${c}.like.data:%`).join(',');
  // Cast nécessaire : une même fonction sert dix tables de formes
  // différentes, table et colonnes construites à l'exécution — le
  // générateur de types ne peut pas suivre une liste dynamique.
  const { data, error } = await (client.from(cible.table) as any)
    .select([cible.cle, ...cible.colonnes].join(','))
    .or(filtre)
    .limit(tailleLot);
  if (error || !data) {
    if (error) console.error(`backfill ${cible.table} : lecture échouée —`, error.message);
    return { traites: 0, echecs: 0, restant: false, details: [] };
  }

  let traites = 0;
  let echecs = 0;
  const details: EchecLot[] = [];
  for (const ligne of data as Record<string, string | null>[]) {
    const maj: Record<string, string> = {};
    let ok = true;
    for (const colonne of cible.colonnes) {
      const valeur = ligne[colonne];
      if (!estDataUrlImage(valeur)) continue;
      try {
        maj[colonne] = await deposerDataUrlServeur(cible.usage, valeur);
      } catch (e) {
        ok = false;
        const motif = (e as Error).message || 'erreur inconnue';
        console.error(`backfill ${cible.table}.${colonne} (${ligne[cible.cle]}) —`, motif);
        details.push({ cle: String(ligne[cible.cle]), colonne, motif });
      }
    }
    if (Object.keys(maj).length > 0) {
      const { error: updErr } = await (client.from(cible.table) as any).update(maj).eq(cible.cle, ligne[cible.cle]);
      if (updErr) {
        ok = false;
        console.error(`backfill ${cible.table} (${ligne[cible.cle]}) : écriture échouée —`, updErr.message);
        details.push({ cle: String(ligne[cible.cle]), colonne: cible.colonnes.join('+'), motif: updErr.message });
      }
    }
    if (ok) traites++;
    else echecs++;
  }
  return { traites, echecs, restant: data.length === tailleLot, details };
}

// ─────────────────────────────────────────────────────────────────────────
// Vérification a posteriori (§ 7.5/§ 8, lot B4)
//
// Le B3 écrase la data-URL dès que le dépôt répond `ok`, sans relecture —
// il n'y a donc plus de repli une fois une ligne migrée. Cette vérification
// ne protège plus une décision d'effacement (déjà faite), elle sert
// seulement à détecter après coup un objet déposé mais devenu illisible
// (échec silencieux du dépôt, objet supprimé depuis côté stockage…). Un
// échec ici n'a pas de remède automatique : il désigne la ligne à corriger
// à la main (redéposer la photo depuis son écran d'origine).
// ─────────────────────────────────────────────────────────────────────────

export type EchecVerification = { table: string; cle: string; colonne: string; url: string };
export type ResultatVerification = { verifiees: number; ok: number; echecs: EchecVerification[] };

// Très au-dessus des ≈360 objets mesurés au B0 (§ 7.5) : une vérification est
// un geste ponctuel après coup, pas un outil qui tourne en continu — un seul
// appel par cible suffit tant que le volume réel reste de cet ordre.
const PLAFOND_VERIFICATION = 1000;

async function urlLisible(usage: Usage, url: string): Promise<string> {
  const decl = USAGES[usage];
  return CONTENEUR_PUBLIC[decl.conteneur] ? url : urlAffichablePrivee(decl.conteneur, url);
}

/** Exportée pour être testable indépendamment de la lecture Supabase (`verifierCible`). */
export async function urlRepond(usage: Usage, url: string): Promise<boolean> {
  try {
    const reponse = await fetch(await urlLisible(usage, url), { method: 'HEAD' });
    return reponse.ok;
  } catch {
    return false;
  }
}

/**
 * Relit chaque URL de stockage déjà écrite pour cette cible (jamais les
 * data-URL restantes, hors périmètre de la vérification) et confirme
 * qu'elle répond. Lecture seule — aucune écriture, quel que soit le
 * résultat.
 */
export async function verifierCible(cible: CibleScalaire): Promise<ResultatVerification> {
  const client = createAdminClient();
  const filtre = cible.colonnes.map((c) => `${c}.like.https://%`).join(',');
  const { data, error } = await (client.from(cible.table) as any)
    .select([cible.cle, ...cible.colonnes].join(','))
    .or(filtre)
    .limit(PLAFOND_VERIFICATION);
  if (error || !data) return { verifiees: 0, ok: 0, echecs: [] };

  const echecs: EchecVerification[] = [];
  let ok = 0;
  await Promise.all(
    (data as Record<string, string | null>[]).flatMap((ligne) =>
      cible.colonnes.map(async (colonne) => {
        const valeur = ligne[colonne];
        if (!valeur || !estUrlStockage(valeur)) return;
        if (await urlRepond(cible.usage, valeur)) ok++;
        else echecs.push({ table: cible.table, cle: String(ligne[cible.cle]), colonne, url: valeur });
      }),
    ),
  );
  return { verifiees: ok + echecs.length, ok, echecs };
}

// ─────────────────────────────────────────────────────────────────────────
// `comments.photo_urls` — seule cible en tableau JSON, traitée à part : sa
// forme (`{ url, ai_retouched }[]`) est spécifique aux avis (§ 7.5) et ne
// justifie pas de généraliser `traiterLotScalaire` à des colonnes non
// scalaires pour un unique appelant.
// ─────────────────────────────────────────────────────────────────────────

type PhotoAvis = { url: string; ai_retouched?: boolean };

function normaliserPhotosAvis(valeur: unknown): PhotoAvis[] {
  if (!Array.isArray(valeur)) return [];
  return valeur.filter((p): p is PhotoAvis => !!p && typeof p === 'object' && typeof (p as PhotoAvis).url === 'string');
}

export async function traiterLotCommentairesPhotos(tailleLot = TAILLE_LOT): Promise<ResultatLot> {
  const client = createAdminClient();
  const { data, error } = await client
    .from('comments')
    .select('id, photo_urls')
    .not('photo_urls', 'is', null)
    .neq('photo_urls', '[]')
    .limit(tailleLot);
  if (error || !data) {
    if (error) console.error('backfill comments : lecture échouée —', error.message);
    return { traites: 0, echecs: 0, restant: false, details: [] };
  }

  let traites = 0;
  let echecs = 0;
  const details: EchecLot[] = [];
  for (const ligne of data as { id: number; photo_urls: unknown }[]) {
    const photos = normaliserPhotosAvis(ligne.photo_urls);
    if (!photos.some((p) => estDataUrlImage(p.url))) continue; // déjà migré

    let ok = true;
    const maj = await Promise.all(
      photos.map(async (p) => {
        if (!estDataUrlImage(p.url)) return p;
        try {
          return { ...p, url: await deposerDataUrlServeur('avis', p.url) };
        } catch (e) {
          ok = false;
          const motif = (e as Error).message || 'erreur inconnue';
          console.error(`backfill comments.photo_urls (${ligne.id}) —`, motif);
          details.push({ cle: String(ligne.id), colonne: 'photo_urls', motif });
          return p;
        }
      }),
    );
    const { error: updErr } = await client.from('comments').update({ photo_urls: maj } as never).eq('id', ligne.id);
    if (updErr) {
      ok = false;
      console.error(`backfill comments (${ligne.id}) : écriture échouée —`, updErr.message);
      details.push({ cle: String(ligne.id), colonne: 'photo_urls', motif: updErr.message });
    }
    if (ok) traites++;
    else echecs++;
  }
  return { traites, echecs, restant: data.length === tailleLot, details };
}

/** Pendant lecture seule de `traiterLotCommentairesPhotos`, cf. `verifierCible`. */
export async function verifierCommentairesPhotos(): Promise<ResultatVerification> {
  const client = createAdminClient();
  const { data, error } = await client
    .from('comments')
    .select('id, photo_urls')
    .not('photo_urls', 'is', null)
    .neq('photo_urls', '[]')
    .limit(PLAFOND_VERIFICATION);
  if (error || !data) return { verifiees: 0, ok: 0, echecs: [] };

  const echecs: EchecVerification[] = [];
  let ok = 0;
  await Promise.all(
    (data as { id: number; photo_urls: unknown }[]).flatMap((ligne) =>
      normaliserPhotosAvis(ligne.photo_urls).map(async (p) => {
        if (!estUrlStockage(p.url)) return;
        if (await urlRepond('avis', p.url)) ok++;
        else echecs.push({ table: 'comments', cle: String(ligne.id), colonne: 'photo_urls', url: p.url });
      }),
    ),
  );
  return { verifiees: ok + echecs.length, ok, echecs };
}
