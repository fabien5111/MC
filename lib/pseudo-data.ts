// Pseudo — accès base et vérification complète, côté SERVEUR uniquement
// (pendant de `lib/pseudo.ts`, qui reste pur et importable par le bundle
// client ; même séparation que `ideas.ts` / `ideas-data.ts`). Importer ce
// module depuis un composant client casserait le build : il tire
// `lib/supabase/server`, donc `next/headers`.
import { getProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { withImpersonationSchema, type ImpersonationClient } from '@/lib/impersonation-types';
import { callClaude, parseStrictJson, PSEUDO_MODERATION_MODEL } from '@/lib/ai/claude';
import { collecteurAppelsIa, enregistrerAppelsIa } from '@/lib/ai/usage-log';
import {
  buildPseudoModerationContent,
  parsePseudoModeration,
  PSEUDO_MODERATION_PROMPT_VERSION,
  PSEUDO_MODERATION_SYSTEM_PROMPT,
} from '@/lib/ai/pseudo-moderation';
import { PSEUDO_REFUS, validerPseudo, variantePseudo, type ValidationPseudo } from '@/lib/pseudo';

// Client de LECTURE des pseudos déjà pris. Il faut contourner la RLS : la
// vérification a lieu à l'inscription, donc pour un visiteur qui n'a pas
// encore de session et qui, selon les policies de `profiles`, ne verrait
// rien. Rien ne fuit pour autant — les routes appelantes ne renvoient qu'un
// booléen, jamais la ligne trouvée.
//
// Sans clé service_role (environnement de développement mal configuré), on
// retombe sur le client de session : la vérification perd en fiabilité mais
// l'index unique en base reste, lui, incontournable.
async function clientLecture(): Promise<ImpersonationClient> {
  try {
    return createAdminClient();
  } catch (e) {
    if (!(e instanceof MissingServiceKeyError)) throw e;
    console.warn('[pseudo] SUPABASE_SERVICE_ROLE_KEY absente : unicité vérifiée avec la session courante.');
    // Même schéma des deux côtés : sans ça, l'union des deux types de client
    // rendrait `.from()` inappelable.
    return withImpersonationSchema(await createClient());
  }
}

// `true` si le pseudo est libre. Deux contrôles, parce que les deux colonnes
// portent le pseudo : le slug (adresse du profil public, ce qui porte
// réellement l'unicité) et le texte affiché, comparé sans tenir compte de la
// casse (`ilike`). La saisie ne peut contenir ni `%` ni `_`
// (CARACTERES_INTERDITS), le motif `ilike` est donc littéral.
export async function pseudoDisponible(pseudo: string, slug: string, exclureId?: string): Promise<boolean> {
  const supabase = await clientLecture();
  const requete = (colonne: 'username' | 'full_name') => {
    let q =
      colonne === 'username'
        ? supabase.from('profiles').select('id').eq('username', slug)
        : supabase.from('profiles').select('id').ilike('full_name', pseudo);
    if (exclureId) q = q.neq('id', exclureId);
    return q.limit(1);
  };

  const [parSlug, parNom] = await Promise.all([requete('username'), requete('full_name')]);
  if (parSlug.error) console.error('pseudoDisponible (slug):', parSlug.error.message);
  if (parNom.error) console.error('pseudoDisponible (nom):', parNom.error.message);
  return !(parSlug.data?.length || parNom.data?.length);
}

// Premier pseudo libre à partir d'une base (« Fabien » → « Fabien 2 » → …).
// Sert à pré-remplir `/choix-pseudo` pour une arrivée par Google : proposer
// un pseudo déjà pris ferait échouer le premier envoi sans que le membre
// comprenne pourquoi. Renvoie la base telle quelle après quelques essais —
// c'est une suggestion, pas une garantie ; la vérification à l'envoi tranche.
export async function suggestionPseudoLibre(base: string): Promise<string> {
  for (let rang = 1; rang <= 12; rang++) {
    const candidat = rang === 1 ? base : variantePseudo(base, rang);
    const validation = validerPseudo(candidat);
    if (!validation.ok) return base;
    if (await pseudoDisponible(validation.pseudo, validation.slug)) return validation.pseudo;
  }
  return base;
}

// Contrôle IA. Best-effort assumé : clé absente, panne ou réponse illisible →
// on autorise. Bloquer une inscription sur une panne de l'API Anthropic
// reviendrait à fermer le site ; le filet local de `lib/pseudo.ts` et la
// modération humaine couvrent le résidu.
// `userId` : connu pour une modification (`/choix-pseudo`, `/reglages`),
// absent pour une inscription par e-mail — au moment de ce contrôle, le
// compte n'existe pas encore, donc pas de session. Le journal accepte un
// `user_id` nul (charge de GESTION, jamais imputée à un membre).
export async function pseudoModereParIA(pseudo: string, userId?: string): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return true;
  const { sink, appels } = collecteurAppelsIa();
  try {
    const { text } = await callClaude(
      apiKey,
      buildPseudoModerationContent(pseudo),
      200,
      12_000,
      PSEUDO_MODERATION_MODEL,
      'disabled',
      PSEUDO_MODERATION_SYSTEM_PROMPT,
      sink,
    );
    const verdict = parsePseudoModeration(parseStrictJson(text));
    if (!verdict.autorise) {
      // Le visiteur ne verra que « Pseudo non autorisé » : le motif reste ici,
      // avec la version du prompt qui l'a produit.
      console.warn(
        `[pseudo] refus IA (${PSEUDO_MODERATION_PROMPT_VERSION}) « ${pseudo} » — ` +
          `${verdict.motif ?? 'motif non précisé'} : ${verdict.explication}`,
      );
    }
    return verdict.autorise;
  } catch (e) {
    console.error('[pseudo] contrôle IA indisponible, pseudo autorisé par défaut :', (e as Error).message);
    return true;
  } finally {
    void enregistrerAppelsIa('moderation_pseudo', userId ?? null, appels);
  }
}

// Chaîne complète : format et interdits locaux → unicité → IA. Dans cet
// ordre, pour ne dépenser un appel IA que sur un pseudo par ailleurs
// recevable (et pour qu'un robot ne puisse pas s'en servir comme d'un accès
// gratuit à l'API en boucle).
//
// `avecIA` à `false` saute l'appel IA : sert à la vérification LIVE pendant
// la frappe (`LoginForm`), motif `/api/idees/similaires` — un appel IA par
// frappe serait lent et coûteux, donc réservé au moment de valider vraiment
// (`/api/pseudo/choisir`, ou le second appel fait par `LoginForm` juste avant
// `signUp`). Toujours `true` par défaut : c'est le réglage sûr, un appelant
// qui oublie de le préciser ne perd pas la modération.
export async function verifierPseudoComplet(
  saisie: string,
  exclureId?: string,
  options?: { avecIA?: boolean },
): Promise<ValidationPseudo> {
  const validation = validerPseudo(saisie);
  if (!validation.ok) return validation;

  if (!(await pseudoDisponible(validation.pseudo, validation.slug, exclureId))) {
    return { ok: false, message: `Le pseudo « ${validation.pseudo} » est déjà pris.` };
  }
  if ((options?.avecIA ?? true) && !(await pseudoModereParIA(validation.pseudo, exclureId))) {
    return { ok: false, message: PSEUDO_REFUS };
  }
  return validation;
}

// Écriture du pseudo sur le profil, avec la clé service_role : c'est ce qui
// rend le contrôle non contournable sur ce chemin — le navigateur n'écrit
// jamais `full_name` / `username` lui-même, il demande à la route de le faire
// après validation.
//
// `email` et `provider` sont recopiés au passage pour la même raison que dans
// `/reglages` : sans eux, le membre s'affiche sans adresse dans Admin →
// Membres et la connexion « en tant que » n'a plus de destinataire.
export async function enregistrerPseudo(
  userId: string,
  pseudo: string,
  slug: string,
  email: string | null,
  provider: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await clientLecture();
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, full_name: pseudo, username: slug, email, provider });
  if (error) {
    // 23505 : l'index unique a tranché une course entre deux inscriptions
    // simultanées, que la vérification préalable ne peut pas voir.
    if (error.code === '23505') return { ok: false, message: `Le pseudo « ${pseudo} » vient d'être pris.` };
    console.error('enregistrerPseudo:', error.message);
    return { ok: false, message: "Erreur lors de l'enregistrement du pseudo." };
  }
  return { ok: true };
}

// Le membre a-t-il un pseudo validé ? La marque est `profiles.username` : le
// slug n'est écrit que par les chemins ci-dessus, alors que `full_name` peut
// avoir été rempli par le trigger `handle_new_user` avec le nom du compte
// Google, que son porteur n'a jamais choisi d'afficher publiquement.
export async function aChoisiSonPseudo(userId: string): Promise<boolean> {
  // Via l'accesseur unique du profil (mémoïsé par requête) : c'était une
  // troisième lecture de la même ligne sur le chemin `/choix-pseudo`, où
  // `requireUser` charge déjà le profil. Cf. lib/auth.ts.
  const profile = await getProfile(userId);
  return !!profile?.username;
}
