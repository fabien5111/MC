// OneDrive et OneNote (JEP-408, lots 2 et 3) — Microsoft Graph, côté navigateur.
//
// Connexion : flux « code + PKCE » de la plateforme d'identité Microsoft, par
// une fenêtre qui revient sur `/stockage/retour` (application déclarée en
// « application monopage » : l'échange du code se fait depuis le navigateur,
// sans secret). Comptes personnels et professionnels (`common`). Le jeton
// n'est gardé que le temps du choix.
//
// Pourquoi notre propre explorateur plutôt que le sélecteur OneDrive v8 : ce
// dernier n'a pas la même adresse pour un compte personnel et un compte
// professionnel (`onedrive.live.com` / `<tenant>-my.sharepoint.com`), qu'on
// ne connaît qu'après la connexion, et dialogue par un protocole de messages
// propre. Graph rend la même chose pour les deux, avec un seul jeton — et le
// même explorateur sert OneNote, qui n'a pas de sélecteur du tout.
import {
  CHEMIN_RETOUR_OAUTH,
  estWord,
  fichierConvient,
  mimeDepuisNom,
  nomPdfDepuisWord,
  type UsageStockage,
} from '@/lib/stockage-en-ligne';
import { matchesSearch } from '@/lib/text-search';
import {
  ErreurStockage,
  aleatoire,
  attendreRetour,
  defiPkce,
  fichierDepuisReponse,
  jsonOuErreur,
  telecharger,
  type Element,
  type Explorateur,
} from './commun';

const AUTORITE = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';

export const PORTEE_ONEDRIVE = 'Files.Read';
export const PORTEE_ONENOTE = 'Notes.Read';

/**
 * Connexion dans la fenêtre `fenetre`, ouverte vide par l'appelant dans le
 * geste du membre. Rend le jeton, ou `null` si le membre ferme la fenêtre.
 */
export async function connecterMicrosoft(clientId: string, portee: string, fenetre: Window): Promise<string | null> {
  const state = aleatoire(16);
  const verificateur = aleatoire(48);
  const redirectUri = `${window.location.origin}${CHEMIN_RETOUR_OAUTH}`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    response_mode: 'query',
    redirect_uri: redirectUri,
    scope: portee,
    state,
    code_challenge: await defiPkce(verificateur),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  fenetre.location.href = `${AUTORITE}/authorize?${params}`;
  const code = await attendreRetour(fenetre, state);
  if (!code) return null;

  const reponse = await telecharger(`${AUTORITE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verificateur,
      scope: portee,
    }),
  });
  const corps = await jsonOuErreur<{ access_token?: string; error_description?: string }>(reponse, 'Connexion à Microsoft refusée');
  if (!corps.access_token) throw new ErreurStockage('Connexion à Microsoft refusée.');
  return corps.access_token;
}

async function graph<T>(jeton: string, chemin: string): Promise<T> {
  const r = await telecharger(`${GRAPH}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  if (r.status === 401) throw new ErreurStockage('Connexion à Microsoft expirée : recommencez.');
  return jsonOuErreur<T>(r, 'Microsoft a refusé la demande');
}

// ── OneDrive ─────────────────────────────────────────────────

type ElementDrive = {
  id: string;
  name: string;
  size?: number;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  thumbnails?: { small?: { url?: string } }[];
  '@microsoft.graph.downloadUrl'?: string;
};

function tailleLisible(octets?: number): string {
  if (!octets) return '';
  if (octets >= 1024 * 1024) return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

export function explorateurOneDrive(jeton: string, usage: UsageStockage): Explorateur {
  const retenu = (e: ElementDrive) =>
    !!e.folder || fichierConvient(e.name, e.file?.mimeType, usage) || (usage === 'pdf' && estWord(e.name));

  const enElement = (e: ElementDrive): Element => ({
    id: e.id,
    nom: e.name,
    dossier: !!e.folder,
    detail: e.folder
      ? `${e.folder.childCount ?? 0} élément${(e.folder.childCount ?? 0) > 1 ? 's' : ''}`
      : estWord(e.name)
        ? `${tailleLisible(e.size)} · converti en PDF`
        : tailleLisible(e.size),
    vignette: e.thumbnails?.[0]?.small?.url ?? null,
    donnees: e,
  });

  return {
    racine: 'OneDrive',
    recherche: true,
    async lister(parent, recherche) {
      const q = recherche.trim();
      const chemin = q
        ? `/me/drive/root/search(q='${encodeURIComponent(q.replace(/'/g, "''"))}')?$top=100&$expand=thumbnails`
        : parent
          ? `/me/drive/items/${encodeURIComponent(parent.id)}/children?$top=200&$expand=thumbnails`
          : `/me/drive/root/children?$top=200&$expand=thumbnails`;
      const corps = await graph<{ value?: ElementDrive[] }>(jeton, chemin);
      return (corps.value ?? [])
        .filter(retenu)
        .sort((a, b) => Number(!!b.folder) - Number(!!a.folder) || a.name.localeCompare(b.name, 'fr', { numeric: true }))
        .map(enElement);
    },
    async recuperer(choisis) {
      const fichiers: File[] = [];
      for (const el of choisis) {
        const e = el.donnees as ElementDrive;
        const id = encodeURIComponent(e.id);
        if (usage === 'pdf' && estWord(e.name)) {
          // Graph convertit le document Word en PDF, qui suit ensuite l'import PDF.
          const r = await telecharger(`${GRAPH}/me/drive/items/${id}/content?format=pdf`, {
            headers: { Authorization: `Bearer ${jeton}` },
          });
          fichiers.push(await fichierDepuisReponse(r, nomPdfDepuisWord(e.name), 'application/pdf'));
          continue;
        }
        // Adresse de téléchargement pré-signée : sans jeton, et lisible par le
        // navigateur (le contenu via `/content` passe par une redirection).
        const detail = await graph<ElementDrive>(jeton, `/me/drive/items/${id}?$select=id,name,file,@microsoft.graph.downloadUrl`);
        const lien = detail['@microsoft.graph.downloadUrl'];
        if (!lien) throw new ErreurStockage(`« ${e.name} » n'a pas pu être téléchargé.`);
        fichiers.push(await fichierDepuisReponse(await telecharger(lien), e.name, e.file?.mimeType || mimeDepuisNom(e.name)));
      }
      return { fichiers };
    },
  };
}

// ── OneNote ──────────────────────────────────────────────────

type PageOneNote = {
  id: string;
  title?: string;
  lastModifiedDateTime?: string;
  parentSection?: { displayName?: string };
};

function dateCourte(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Texte lisible d'un HTML (page OneNote) : un bloc par ligne, puces pour les listes. */
export function htmlEnTexte(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lignes: string[] = [];
  const BLOCS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'BR', 'TABLE', 'UL', 'OL']);
  let courante = '';
  const pousser = () => {
    const t = courante.replace(/\s+/g, ' ').trim();
    if (t) lignes.push(t);
    courante = '';
  };
  const parcourir = (noeud: Node) => {
    if (noeud.nodeType === Node.TEXT_NODE) {
      courante += noeud.textContent ?? '';
      return;
    }
    if (!(noeud instanceof HTMLElement)) return;
    if (noeud.tagName === 'SCRIPT' || noeud.tagName === 'STYLE' || noeud.tagName === 'TITLE') return;
    const bloc = BLOCS.has(noeud.tagName);
    if (bloc) pousser();
    if (noeud.tagName === 'LI') courante = '- ';
    if (noeud.tagName === 'TD' || noeud.tagName === 'TH') {
      if (courante.trim()) courante += ' | ';
    }
    noeud.childNodes.forEach(parcourir);
    if (bloc) pousser();
  };
  parcourir(doc.body);
  pousser();
  return lignes.join('\n');
}

export function explorateurOneNote(jeton: string): Explorateur {
  // Les 100 pages les plus récentes, lues une fois : la recherche filtre en
  // mémoire (sans accents ni casse), sans nouvel appel.
  let pages: PageOneNote[] | null = null;
  return {
    racine: 'OneNote',
    recherche: true,
    async lister(_parent, recherche) {
      if (!pages) {
        const corps = await graph<{ value?: PageOneNote[] }>(
          jeton,
          '/me/onenote/pages?$top=100&$select=id,title,lastModifiedDateTime&$expand=parentSection($select=displayName)&$orderby=lastModifiedDateTime%20desc',
        );
        pages = corps.value ?? [];
      }
      return pages
        .filter((p) => !recherche.trim() || matchesSearch([p.title], recherche))
        .map((p) => ({
          id: p.id,
          nom: p.title?.trim() || 'Sans titre',
          dossier: false,
          detail: [p.parentSection?.displayName, dateCourte(p.lastModifiedDateTime)].filter(Boolean).join(' · '),
        }));
    },
    async recuperer(choisis) {
      const page = choisis[0];
      if (!page) return null;
      const r = await telecharger(`${GRAPH}/me/onenote/pages/${encodeURIComponent(page.id)}/content`, {
        headers: { Authorization: `Bearer ${jeton}` },
      });
      if (!r.ok) throw new ErreurStockage(`La page « ${page.nom} » n'a pas pu être lue (${r.status}).`);
      return { texte: htmlEnTexte(await r.text()), nom: page.nom };
    },
  };
}
