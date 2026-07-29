// Route Handler — Import de recette par texte collé, PDF ou photos
// (schéma pivot v1.0). Normalisation Claude → validation → brouillon.
// Auth & RLS via la session Supabase (cookies), plus besoin de jeton en en-tête.
//
// Trois provenances, deux natures d'entrée :
//  - texte collé et PDF arrivent en texte (le PDF est lu côté navigateur par
//    lib/pdf.ts, son fichier ne transite pas) ;
//  - les photos aussi : elles n'ont aucune couche texte, mais leur lecture a
//    déjà eu lieu quand elles arrivent ici. Le navigateur appelle
//    /api/transcribe-photo une fois par page, en parallèle, et n'envoie à
//    cette route que le texte assemblé.
//
// L'import par photo se fait donc en DEUX passes, dans deux requêtes
// distinctes : transcription page par page, puis structuration. Séparer les
// requêtes libère chaque photo de la limite de corps de requête, qui bridait
// leur définition, et rend à la structuration la totalité du `maxDuration`.
// La transcription étant facturée, sa consommation est déclarée par le
// navigateur et rattachée à l'import.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isReadOnlySession } from '@/lib/impersonation';
import { EMPTY_USAGE, IMPORT_MODEL, TRANSCRIBE_MODEL, addUsage, type ClaudeUsage } from '@/lib/ai/claude';
import { computeCost } from '@/lib/ai/cost';
import { normalizeRecette } from '@/lib/ai/import-pivot';

export const maxDuration = 60;

const QUOTA = parseInt(process.env.IMPORT_DAILY_QUOTA || '20', 10);

/**
 * Consommation de la passe de transcription, déclarée par le navigateur.
 *
 * Elle a eu lieu dans d'autres requêtes (/api/transcribe-photo) : cette route
 * ne peut que la recevoir. Valeur purement comptable — elle n'ouvre aucun
 * droit et ne sert qu'à ce que le coût affiché à l'administration reflète les
 * deux passes plutôt que la seule structuration. Bornée pour qu'une valeur
 * fantaisiste ne pollue pas les statistiques.
 */
function usageDeclare(brut: unknown): ClaudeUsage {
  const o = (brut ?? {}) as Record<string, unknown>;
  const borne = (v: unknown) => {
    const n = typeof v === 'number' && isFinite(v) ? Math.round(v) : 0;
    return Math.min(Math.max(n, 0), 5_000_000);
  };
  return {
    ...EMPTY_USAGE,
    inputTokens: borne(o.inputTokens),
    outputTokens: borne(o.outputTokens),
  };
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { erreur: "Import indisponible : la clé ANTHROPIC_API_KEY n'est pas configurée sur le serveur." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  // L'import écrit un brouillon : interdit pendant une impersonation en
  // lecture seule (le bridage de l'UI ne suffit pas, la route est appelable
  // directement).
  if (await isReadOnlySession()) {
    return NextResponse.json(
      { erreur: 'Session de consultation (lecture seule) : import impossible.' },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const texte = typeof body?.texte === 'string' ? body.texte.trim() : '';
  const estPdf = body?.source === 'pdf';
  const estPhoto = body?.source === 'photo';
  const sourceType = estPhoto ? 'photo' : estPdf ? 'pdf' : 'texte';

  const nbPhotos = Number.isInteger(body?.nb_photos) ? Math.max(0, body.nb_photos) : 0;
  const usageTranscription = estPhoto ? usageDeclare(body?.usage_transcription) : EMPTY_USAGE;
  if (texte.length < 80) {
    return NextResponse.json(
      {
        erreur: estPhoto
          ? "La lecture des photos n'a rien donné d'exploitable. Vérifiez qu'elles sont nettes, bien cadrées et qu'il s'agit bien d'une recette."
          : estPdf
            ? "Ce PDF ne contient pas de texte exploitable : c'est probablement un scan ou une suite d'images. Copiez-collez la recette dans l'onglet « Texte collé »."
            : 'Texte trop court pour être une recette : collez la recette complète (ingrédients et étapes).',
      },
      { status: 400 },
    );
  }

  // Nom des fichiers d'origine, affiché à la relecture pour situer le brouillon.
  const noms = estPhoto
    ? (Array.isArray(body?.fichiers) ? body.fichiers : []).filter((f: unknown) => typeof f === 'string').join(', ')
    : typeof body?.fichier === 'string'
      ? body.fichier
      : '';
  const fichierOriginal = noms.trim().slice(0, 200) || null;

  // Quota journalier (RLS : ne compte que les imports de l'utilisateur).
  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('imports')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', debutJour.toISOString());
  const compte = count ?? 0;
  if (compte >= QUOTA) {
    return NextResponse.json(
      { erreur: `Quota d'imports atteint (${QUOTA} par jour). Réessayez demain.` },
      { status: 429 },
    );
  }

  const contenu = estPhoto
    ? `Texte de recette transcrit depuis ${nbPhotos} photo${nbPhotos > 1 ? 's' : ''}, page par page :\n${texte.slice(0, 60000)}`
    : estPdf
      ? `Texte de recette extrait d'un PDF, page par page :\n${texte.slice(0, 60000)}`
      : `Texte de recette collé par l'utilisateur :\n${texte.slice(0, 60000)}`;

  // ── Passe 2 : structuration ──
  // Normalisation IA + validation, avec au plus une relance au total (voir le
  // commentaire de normalizeRecette : au-delà, le risque de dépasser le temps
  // limite de la fonction devient trop élevé sur une recette complexe). La
  // transcription ayant lieu dans d'autres requêtes, la structuration dispose
  // ici de la totalité du budget.
  let usageStructuration: ClaudeUsage;
  let pivot: Record<string, any>;
  let erreurs: string[];
  let alertes: string[];
  try {
    const normalise = await normalizeRecette(apiKey, contenu);
    pivot = normalise.pivot;
    usageStructuration = normalise.usage;
    erreurs = normalise.erreurs;
    alertes = normalise.alertes;
  } catch (e) {
    // Les appels déjà effectués ont été facturés même si l'import échoue : on
    // les trace en logs, faute de ligne `imports` où les rattacher.
    const partiel = (e as { usage?: ClaudeUsage }).usage ?? EMPTY_USAGE;
    const total = addUsage(usageTranscription, partiel);
    console.error(
      `[import-url] normalisation IA échouée après ${total.inputTokens + total.outputTokens} tokens facturés ` +
        `(transcription comprise)`,
    );
    console.error('[import-url] normalisation IA échouée :', e);
    if ((e as { code?: string }).code === 'TIMEOUT') {
      return NextResponse.json(
        {
          erreur:
            "L'analyse n'a pas abouti dans le temps imparti (l'API Claude n'a pas répondu). Réessayez : la seconde tentative est souvent plus rapide.",
        },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { erreur: "L'import a échoué, réessayez ou saisissez la recette manuellement." },
      { status: 502 },
    );
  }
  if (erreurs.length) {
    return NextResponse.json(
      {
        erreur: estPhoto
          ? "La lecture des photos n'a pas abouti : " + erreurs.join(' ') + ' Vérifiez que les pages sont nettes, bien cadrées et dans le bon ordre.'
          : 'Extraction incomplète : ' + erreurs.join(' '),
        erreurs,
      },
      { status: 422 },
    );
  }

  // Déchiffrer une photo est faillible là où structurer un texte ne l'est pas :
  // l'utilisateur doit relire les quantités, pas seulement la mise en forme.
  if (estPhoto) {
    alertes = [
      `Recette lue depuis ${nbPhotos} photo${nbPhotos > 1 ? 's' : ''} : vérifiez les quantités et les températures, un chiffre mal imprimé ou flou peut avoir été mal lu.`,
      ...alertes,
    ];
  }

  // Nettoyage, normalisation des unités, J−n et mise au format interne sont
  // assurés par `normalizeRecette` / `toPivotInterne`.
  pivot.schema_version = '1.0';
  pivot.statut = 'brouillon';
  pivot.visibilite = 'privee';
  // Champs de provenance : on conserve ce que l'IA a extrait (auteur, vidéo).
  const iaSource = pivot.source && typeof pivot.source === 'object' ? pivot.source : {};
  pivot.source = {
    type: sourceType,
    url: iaSource.url_origine || iaSource.url || null,
    url_origine: iaSource.url_origine || null,
    video_url: iaSource.video_url || null,
    fichier_original: fichierOriginal,
    auteur_origine: iaSource.auteur_origine || null,
    importee_le: new Date().toISOString(),
  };
  if (typeof pivot.source.auteur_origine === 'object') {
    pivot.source.auteur_origine = pivot.source.auteur_origine?.name || null;
  }
  // Conseils de dégustation/conservation (texte libre), extraits par l'IA.
  pivot.conseils_degustation =
    typeof pivot.conseils_degustation === 'string' && pivot.conseils_degustation.trim()
      ? pivot.conseils_degustation.trim()
      : null;

  // Enregistrement en brouillon (RLS via la session), avec le coût réel de
  // l'import (somme de tous les appels IA facturés ci-dessus).
  // Deux modèles peuvent être en jeu : transcrire et structurer ne se facturent
  // pas au même tarif. Le coût est donc la somme de deux calculs séparés, et
  // reste inconnu (null) dès que l'un des modèles manque à la table de tarifs —
  // mieux vaut pas de chiffre qu'un chiffre faux.
  const usageTotal = addUsage(usageTranscription, usageStructuration);
  const coutStructuration = computeCost(usageStructuration, IMPORT_MODEL);
  const coutTranscription = estPhoto ? computeCost(usageTranscription, TRANSCRIBE_MODEL) : null;
  const coutUsd =
    coutStructuration == null || (estPhoto && coutTranscription == null)
      ? null
      : coutStructuration.usd + (coutTranscription?.usd ?? 0);
  // Colonnes de coût hors typage généré tant que `npm run gen:types` n'a pas été
  // rejoué après la migration → client non typé pour cette écriture.
  const table = supabase.from('imports' as never) as ReturnType<typeof supabase.from>;
  const { data: row, error } = await table
    .insert({
      user_id: user.id,
      source_type: sourceType,
      statut: 'brouillon',
      source_url: null,
      fichier_original: fichierOriginal,
      recette: pivot,
      alertes,
      // Les deux modèles apparaissent quand ils diffèrent : la colonne ne sert
      // qu'à l'affichage côté administration.
      model: estPhoto && TRANSCRIBE_MODEL !== IMPORT_MODEL ? `${TRANSCRIBE_MODEL} + ${IMPORT_MODEL}` : IMPORT_MODEL,
      input_tokens: usageTotal.inputTokens,
      output_tokens: usageTotal.outputTokens,
      // null si le modèle est absent de la table de tarifs : mieux vaut un coût
      // inconnu qu'un coût faux.
      cost_usd: coutUsd,
    } as never)
    .select()
    .single();
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ import: row, alertes, quota_restant: Math.max(0, QUOTA - compte - 1) });
}
