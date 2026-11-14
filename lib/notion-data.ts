// Notion (JEP-408, lot 3) — accès serveur à l'API Notion.
//
// Pourquoi par le serveur, alors que les autres sources passent par le
// navigateur : l'API Notion ne répond pas aux appels d'un navigateur (pas de
// CORS), et l'échange du code de connexion exige le secret de l'intégration.
// Le jeton du membre fait donc l'aller-retour à chaque requête, dans l'en-tête
// `Authorization` — il n'est ni journalisé, ni conservé : le navigateur le
// garde en mémoire le temps du choix, puis l'oublie.
//
// Le choix des pages est celui de Notion : à la connexion, le membre coche
// les pages qu'il partage avec Je pâtisse !. La recherche ne voit que celles-là.
import 'server-only';
import { identifiantsNotion } from '@/lib/stockage-en-ligne-data';
import { notionBlocsEnTexte, titrePageNotion, type BlocNotion } from '@/lib/stockage-en-ligne';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const DELAI_MS = 15_000;
/** Garde-fous de lecture d'une page : au-delà, le texte d'une recette est de toute façon complet. */
const BLOCS_MAX = 1500;
const PROFONDEUR_MAX = 3;

export class ErreurNotion extends Error {
  constructor(
    message: string,
    readonly statut: number,
  ) {
    super(message);
  }
}

async function appel<T>(chemin: string, jeton: string, init: RequestInit = {}): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`${API}${chemin}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jeton}`,
        'Notion-Version': VERSION,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch {
    throw new ErreurNotion('Notion ne répond pas.', 502);
  }
  if (reponse.status === 401) throw new ErreurNotion('Connexion à Notion expirée : reconnectez-vous.', 401);
  if (reponse.status === 404) throw new ErreurNotion("Cette page n'est pas partagée avec Je pâtisse !.", 404);
  if (!reponse.ok) throw new ErreurNotion(`Notion a refusé la demande (${reponse.status}).`, 502);
  return (await reponse.json()) as T;
}

/** Échange le code de connexion contre un jeton d'accès. */
export async function echangerCodeNotion(code: string, redirectUri: string): Promise<string> {
  const ids = identifiantsNotion();
  if (!ids) throw new ErreurNotion("Notion n'est pas configuré.", 503);
  let reponse: Response;
  try {
    reponse = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${ids.clientId}:${ids.secret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'Notion-Version': VERSION,
      },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch {
    throw new ErreurNotion('Notion ne répond pas.', 502);
  }
  if (!reponse.ok) throw new ErreurNotion('La connexion à Notion a échoué.', 502);
  const corps = (await reponse.json()) as { access_token?: unknown };
  if (typeof corps.access_token !== 'string' || !corps.access_token) {
    throw new ErreurNotion('La connexion à Notion a échoué.', 502);
  }
  return corps.access_token;
}

export type PageNotion = { id: string; titre: string; modifie: string | null };

type PageBrute = {
  id: string;
  object: string;
  last_edited_time?: string;
  properties?: Record<string, { type?: string; title?: unknown }>;
};

/** Pages partagées avec l'intégration, les plus récentes d'abord. */
export async function chercherPagesNotion(jeton: string, recherche: string): Promise<PageNotion[]> {
  const corps = await appel<{ results?: PageBrute[] }>('/search', jeton, {
    method: 'POST',
    body: JSON.stringify({
      query: recherche.slice(0, 100),
      filter: { property: 'object', value: 'page' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 50,
    }),
  });
  return (corps.results ?? [])
    .filter((p) => p.object === 'page')
    .map((p) => ({ id: p.id, titre: titrePageNotion(p), modifie: p.last_edited_time ?? null }));
}

type ReponseBlocs = { results?: BlocNotion[]; has_more?: boolean; next_cursor?: string | null };

/** Enfants d'un bloc, paginés, lus récursivement dans la limite des garde-fous. */
async function lireEnfants(jeton: string, id: string, profondeur: number, compte: { n: number }): Promise<BlocNotion[]> {
  const blocs: BlocNotion[] = [];
  let curseur: string | null = null;
  do {
    const qs: string = `page_size=100${curseur ? `&start_cursor=${encodeURIComponent(curseur)}` : ''}`;
    const page: ReponseBlocs = await appel<ReponseBlocs>(`/blocks/${encodeURIComponent(id)}/children?${qs}`, jeton);
    for (const bloc of page.results ?? []) {
      if (compte.n >= BLOCS_MAX) return blocs;
      compte.n += 1;
      // Une sous-page ou une base de données est un autre document : on ne la
      // déroule pas (elle serait importée avec la recette).
      if (bloc.has_children && profondeur < PROFONDEUR_MAX && bloc.type !== 'child_page' && bloc.type !== 'child_database') {
        bloc.enfants = await lireEnfants(jeton, bloc.id, profondeur + 1, compte);
      }
      blocs.push(bloc);
    }
    curseur = page.has_more ? (page.next_cursor ?? null) : null;
  } while (curseur && compte.n < BLOCS_MAX);
  return blocs;
}

/** Titre et texte d'une page, prêts pour l'import par texte. */
export async function lirePageNotion(jeton: string, id: string): Promise<{ titre: string; texte: string }> {
  const page = await appel<PageBrute>(`/pages/${encodeURIComponent(id)}`, jeton);
  const titre = titrePageNotion(page);
  const blocs = await lireEnfants(jeton, id, 0, { n: 0 });
  const corps = notionBlocsEnTexte(blocs);
  return { titre, texte: titre === 'Sans titre' ? corps : `${titre}\n\n${corps}`.trim() };
}
