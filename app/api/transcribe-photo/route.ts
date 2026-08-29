// Route Handler — Passe 1 de l'import par photo : transcription d'UNE page.
//
// Une photo par requête, et non un lot. Le corps d'une requête serverless est
// borné (~4,5 Mo) : regrouper huit photos les obligeait à tenir ensemble sous
// cette limite, donc à être réduites à une définition où le corps du texte
// d'une page de livre ne faisait plus que quelques pixels de haut — c'est là
// que « 150 °C » se lisait « 160 °C ». Une photo par requête rend à chacune la
// limite entière, et le navigateur les lance en parallèle.
//
// Cette route ne crée aucun brouillon : elle rend du texte, que le navigateur
// assemble puis envoie à /api/import-url comme n'importe quelle recette
// linéarisée.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isReadOnlySession } from '@/lib/impersonation';
import { verifierAcces } from '@/lib/quota-route';
import { TRANSCRIBE_MODEL } from '@/lib/ai/claude';
import { transcrireUne } from '@/lib/ai/transcribe';
import { collecteurAppelsIa, enregistrerAppelsIa } from '@/lib/ai/usage-log';

export const maxDuration = 60;

// Une seule photo dispose désormais de tout le corps de requête ; ce plafond ne
// sert plus qu'à écarter un envoi manifestement anormal.
const MAX_OCTETS_PHOTO = 4_000_000;
const TYPES_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// Sous le `maxDuration`, pour laisser le temps de renvoyer une erreur lisible.
const BUDGET_MS = 45_000;

const QUOTA = parseInt(process.env.IMPORT_DAILY_QUOTA || '20', 10);

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

  // Première passe d'un import, facturée : interdite pendant une impersonation
  // en lecture seule, comme /api/import-url qu'elle alimente.
  if (await isReadOnlySession()) {
    return NextResponse.json(
      { erreur: 'Session de consultation (lecture seule) : import impossible.' },
      { status: 403 },
    );
  }

  // Droit d'import vérifié, mais AUCUN crédit consommé : un import vaut un
  // crédit, pas une page. C'est /api/import-url qui décompte, une fois, quand
  // les transcriptions lui reviennent assemblées.
  const refus = await verifierAcces(user.id, 'import_ia_mensuel');
  if (refus) return refus;

  const body = await req.json().catch(() => ({}));
  const brut = typeof body?.image === 'string' ? body.image : '';
  const numero = Number.isInteger(body?.page) && body.page > 0 ? body.page : 1;

  const separation = brut.indexOf(',');
  const correspondance = /^data:([a-z/+-]+);base64$/i.exec(separation > 0 ? brut.slice(0, separation) : '');
  if (!correspondance) return NextResponse.json({ erreur: 'Photo au format inattendu.' }, { status: 400 });
  const mediaType = correspondance[1].toLowerCase();
  if (!TYPES_IMAGE.includes(mediaType)) {
    return NextResponse.json({ erreur: `Format ${mediaType} non pris en charge.` }, { status: 400 });
  }
  const data = brut.slice(separation + 1);
  if (!data || data.length > MAX_OCTETS_PHOTO) {
    return NextResponse.json({ erreur: 'Photo vide ou trop lourde.' }, { status: 400 });
  }

  // La transcription ne crée pas de ligne `imports`, donc ne consomme pas le
  // quota — mais elle appelle l'API. On refuse dès que le quota du jour est
  // épuisé : sans ce contrôle, la route offrirait des appels IA illimités à
  // qui ne peut de toute façon plus importer.
  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('imports')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', debutJour.toISOString());
  if ((count ?? 0) >= QUOTA) {
    return NextResponse.json(
      { erreur: `Quota d'imports atteint (${QUOTA} par jour). Réessayez demain.` },
      { status: 429 },
    );
  }

  // C'est ICI, et non dans /api/import-url, que l'appel de transcription a
  // réellement lieu : c'est donc ici qu'il faut le journaliser (vrai
  // request_id, vraie latence), pas depuis la valeur que le navigateur
  // redéclare ensuite à /api/import-url pour l'affichage du coût de l'import.
  const { sink, appels } = collecteurAppelsIa();
  try {
    const { texte, usage } = await transcrireUne(apiKey, { mediaType, data }, numero, BUDGET_MS, sink);
    return NextResponse.json({
      texte,
      // Renvoyé au navigateur, qui le rendra à /api/import-url : la
      // transcription est facturée et doit apparaître dans le coût de l'import.
      usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      modele: TRANSCRIBE_MODEL,
    });
  } catch (e) {
    console.error(`[transcribe-photo] page ${numero} :`, e);
    const timeout = (e as { code?: string }).code === 'TIMEOUT';
    return NextResponse.json(
      {
        erreur: timeout
          ? `Photo ${numero} : la lecture a dépassé le temps imparti. Réessayez.`
          : `Photo ${numero} : lecture impossible. Vérifiez qu'elle est nette et bien cadrée.`,
      },
      { status: timeout ? 504 : 502 },
    );
  } finally {
    // `await`, jamais `void` : une écriture non attendue peut être coupée net
    // par le gel de la fonction serverless dès la réponse envoyée. Sans
    // risque pour la doctrine best-effort : la fonction avale déjà ses
    // propres erreurs.
    await enregistrerAppelsIa('import_transcription', user.id, appels);
  }
}
