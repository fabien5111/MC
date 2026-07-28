// Route Handler — Import de recette par texte collé, PDF ou photos
// (schéma pivot v1.0). Normalisation Claude → validation → brouillon.
// Auth & RLS via la session Supabase (cookies), plus besoin de jeton en en-tête.
//
// Trois provenances, deux natures d'entrée :
//  - texte collé et PDF arrivent en texte (le PDF est lu côté navigateur par
//    lib/pdf.ts, son fichier ne transite pas) ;
//  - les photos arrivent en images : elles n'ont aucune couche texte, c'est
//    l'IA qui doit les lire avant de les structurer. C'est la seule provenance
//    dont le contenu traverse la fonction serverless, d'où les plafonds
//    ci-dessous — un corps de requête au-delà de ~4,5 Mo est refusé par
//    l'hébergeur avant même d'atteindre ce code.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { IMPORT_MODEL, type BlocContenu, type ClaudeUsage } from '@/lib/ai/claude';
import { computeCost } from '@/lib/ai/cost';
import { normalizeRecette } from '@/lib/ai/import-pivot';

export const maxDuration = 60;

const QUOTA = parseInt(process.env.IMPORT_DAILY_QUOTA || '20', 10);

const MAX_PHOTOS = 8;
// Marge nette sous la limite de corps de requête de l'hébergeur.
const MAX_OCTETS_PHOTOS = 3_500_000;
const TYPES_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Convertit les data-URL reçues en blocs d'image, en refusant tout ce qui n'est
 * pas une image d'un type accepté par l'API. Renvoie un message d'erreur plutôt
 * que de laisser l'appel partir avec un contenu douteux.
 */
function versBlocsImage(images: unknown): { blocs: BlocContenu[] } | { erreur: string } {
  if (!Array.isArray(images) || images.length === 0) {
    return { erreur: 'Aucune photo reçue.' };
  }
  if (images.length > MAX_PHOTOS) {
    return { erreur: `${MAX_PHOTOS} photos au maximum par import.` };
  }
  const blocs: BlocContenu[] = [];
  let octets = 0;
  for (let i = 0; i < images.length; i++) {
    const brut = images[i];
    if (typeof brut !== 'string') return { erreur: `Photo ${i + 1} illisible.` };
    const separation = brut.indexOf(',');
    const entete = separation > 0 ? brut.slice(0, separation) : '';
    const correspondance = /^data:([a-z/+-]+);base64$/i.exec(entete);
    if (!correspondance) return { erreur: `Photo ${i + 1} : format inattendu.` };
    const mediaType = correspondance[1].toLowerCase();
    if (!TYPES_IMAGE.includes(mediaType)) {
      return { erreur: `Photo ${i + 1} : format ${mediaType} non pris en charge.` };
    }
    const data = brut.slice(separation + 1);
    octets += data.length;
    if (octets > MAX_OCTETS_PHOTOS) {
      return { erreur: 'Les photos sont trop lourdes : réduisez-en le nombre ou la définition.' };
    }
    // Chaque image est annoncée par son numéro : l'IA s'en sert pour renseigner
    // la clé `page` de chaque étape, et l'ordre des photos fait l'ordre de
    // lecture de la recette.
    blocs.push({ type: 'text', text: `Photo ${i + 1} :` });
    blocs.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
  }
  return { blocs };
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

  const body = await req.json().catch(() => ({}));
  const texte = typeof body?.texte === 'string' ? body.texte.trim() : '';
  const estPdf = body?.source === 'pdf';
  const estPhoto = body?.source === 'photo';
  const sourceType = estPhoto ? 'photo' : estPdf ? 'pdf' : 'texte';

  let blocsPhotos: BlocContenu[] = [];
  let nbPhotos = 0;
  if (estPhoto) {
    const resultat = versBlocsImage(body?.images);
    if ('erreur' in resultat) return NextResponse.json({ erreur: resultat.erreur }, { status: 400 });
    blocsPhotos = resultat.blocs;
    nbPhotos = blocsPhotos.length / 2;
  } else if (texte.length < 80) {
    return NextResponse.json(
      {
        erreur: estPdf
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

  const contenu: string | BlocContenu[] = estPhoto
    ? blocsPhotos
    : estPdf
      ? `Texte de recette extrait d'un PDF, page par page :\n${texte.slice(0, 60000)}`
      : `Texte de recette collé par l'utilisateur :\n${texte.slice(0, 60000)}`;

  // Normalisation IA + validation, avec au plus une relance au total (voir le
  // commentaire de normalizeRecette : au-delà, le risque de dépasser le temps
  // limite de la fonction devient trop élevé sur une recette complexe).
  let usageTotal: ClaudeUsage;
  let pivot: Record<string, any>;
  let erreurs: string[];
  let alertes: string[];
  try {
    const normalise = await normalizeRecette(apiKey, contenu);
    pivot = normalise.pivot;
    usageTotal = normalise.usage;
    erreurs = normalise.erreurs;
    alertes = normalise.alertes;
  } catch (e) {
    // Les appels déjà effectués ont été facturés même si l'import échoue : on
    // les trace en logs, faute de ligne `imports` où les rattacher.
    const partiel = (e as { usage?: ClaudeUsage }).usage;
    if (partiel) {
      const c = computeCost(partiel, IMPORT_MODEL);
      console.error(
        `[import-url] normalisation IA échouée après ${partiel.inputTokens + partiel.outputTokens} tokens facturés` +
          (c ? ` (~${c.usd.toFixed(4)} $)` : ''),
      );
    }
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
  const cout = computeCost(usageTotal, IMPORT_MODEL);
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
      model: IMPORT_MODEL,
      input_tokens: usageTotal.inputTokens,
      output_tokens: usageTotal.outputTokens,
      // null si le modèle est absent de la table de tarifs : mieux vaut un coût
      // inconnu qu'un coût faux.
      cost_usd: cout ? cout.usd : null,
    } as never)
    .select()
    .single();
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ import: row, alertes, quota_restant: Math.max(0, QUOTA - compte - 1) });
}
