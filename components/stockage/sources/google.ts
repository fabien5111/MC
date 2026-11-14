// Google Drive et Google Photos (JEP-408, lots 1 et 2) — côté navigateur.
//
// Le jeton est obtenu par Google Identity Services (fenêtre de Google), pour
// une portée minimale, et n'est gardé que le temps du choix :
//  - Drive : `drive.file`, qui ne donne accès QU'AUX fichiers que le membre
//    choisit dans le sélecteur de Google — rien d'autre de son Drive ;
//  - Photos : `photospicker.mediaitems.readonly`, seule portée encore offerte
//    depuis 2025 (l'API de bibliothèque a été fermée aux applications tierces).
import {
  MAX_OCTETS_SOURCE,
  TYPES_IMAGE,
  dureeGoogleMs,
  urlMediaPhotos,
  type ConfigStockage,
  type UsageStockage,
} from '@/lib/stockage-en-ligne';
import { ErreurStockage, chargerScript, fichierDepuisReponse, jsonOuErreur, telecharger, type Selection } from './commun';

// ── Types minimaux des bibliothèques de Google ───────────────

type ReponseJeton = { access_token?: string; error?: string; error_description?: string };
type ClientJeton = { requestAccessToken: (o?: { prompt?: string }) => void };
type DocPicker = Record<string, string>;
type DonneesPicker = Record<string, unknown>;
type ConstructeurPicker = {
  addView: (v: unknown) => ConstructeurPicker;
  setOAuthToken: (t: string) => ConstructeurPicker;
  setDeveloperKey: (k: string) => ConstructeurPicker;
  setAppId: (id: string) => ConstructeurPicker;
  setLocale: (l: string) => ConstructeurPicker;
  setOrigin: (o: string) => ConstructeurPicker;
  setTitle: (t: string) => ConstructeurPicker;
  setMaxItems: (n: number) => ConstructeurPicker;
  enableFeature: (f: unknown) => ConstructeurPicker;
  setCallback: (cb: (d: DonneesPicker) => void) => ConstructeurPicker;
  build: () => { setVisible: (v: boolean) => void };
};
type Vue = { setMimeTypes: (m: string) => Vue; setIncludeFolders: (b: boolean) => Vue; setSelectFolderEnabled: (b: boolean) => Vue };
type Google = {
  accounts: {
    oauth2: {
      initTokenClient: (o: {
        client_id: string;
        scope: string;
        callback: (r: ReponseJeton) => void;
        error_callback?: (e: { type?: string; message?: string }) => void;
      }) => ClientJeton;
    };
  };
  picker: {
    PickerBuilder: new () => ConstructeurPicker;
    DocsView: new (viewId?: unknown) => Vue;
    ViewId: Record<string, unknown>;
    Feature: Record<string, unknown>;
    Action: Record<string, string>;
    Response: Record<string, string>;
    Document: Record<string, string>;
  };
};
type Gapi = { load: (lib: string, cb: () => void) => void };

function google(): Google {
  const g = (window as unknown as { google?: Google }).google;
  if (!g?.accounts?.oauth2) throw new ErreurStockage('Le service de connexion de Google est indisponible.');
  return g;
}

const SCRIPT_GIS = 'https://accounts.google.com/gsi/client';
const SCRIPT_GAPI = 'https://apis.google.com/js/api.js';
const PORTEE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
const PORTEE_PHOTOS = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

let pickerPret: Promise<void> | null = null;

/** À appeler à l'ouverture de la fenêtre « Depuis… » : au clic, plus rien à charger. */
export function prechargerGoogle(avecPicker: boolean): Promise<void> {
  const gis = chargerScript(SCRIPT_GIS);
  if (!avecPicker) return gis;
  if (!pickerPret) {
    pickerPret = chargerScript(SCRIPT_GAPI).then(
      () =>
        new Promise<void>((resoudre) => {
          (window as unknown as { gapi: Gapi }).gapi.load('picker', () => resoudre());
        }),
    );
    pickerPret.catch(() => {
      pickerPret = null;
    });
  }
  return Promise.all([gis, pickerPret]).then(() => undefined);
}

/**
 * Jeton d'accès pour une portée, ou `null` si le membre ferme la fenêtre de
 * Google. À appeler dans le geste du membre : c'est elle qui ouvre la fenêtre.
 */
function demanderJeton(clientId: string, portee: string): Promise<string | null> {
  return new Promise((resoudre, rejeter) => {
    const client = google().accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: portee,
      callback: (r) => {
        if (r.access_token) resoudre(r.access_token);
        else if (r.error === 'access_denied') resoudre(null);
        else rejeter(new ErreurStockage(`Connexion à Google refusée : ${r.error_description || r.error || 'aucun jeton'}.`));
      },
      error_callback: (e) => {
        if (e.type === 'popup_closed') resoudre(null);
        else if (e.type === 'popup_failed_to_open') {
          rejeter(new ErreurStockage('La fenêtre de Google a été bloquée : autorisez les fenêtres pour ce site et réessayez.'));
        } else rejeter(new ErreurStockage(`Connexion à Google impossible : ${e.message || e.type || 'erreur inconnue'}.`));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

// ── Google Drive ─────────────────────────────────────────────

const MIME_GOOGLE_DOC = 'application/vnd.google-apps.document';
const API_DRIVE = 'https://www.googleapis.com/drive/v3/files';

function mimesDrive(usage: UsageStockage): string {
  if (usage === 'image') return TYPES_IMAGE.join(',');
  if (usage === 'pdf') return 'application/pdf';
  return MIME_GOOGLE_DOC;
}

/** Étapes signalées à la fenêtre du site, pour s'effacer puis montrer le fouet. */
export type EtapesChoix = {
  /** Le sélecteur du fournisseur va s'afficher par-dessus la page. */
  avantAffichage: () => void;
  /** Le choix est fait, les fichiers se téléchargent. */
  avantTelechargement: () => void;
};

/** Choix dans Google Drive (sélecteur de Google, affiché dans la page). */
export async function choisirDansDrive(
  config: NonNullable<ConfigStockage['google']>,
  usage: UsageStockage,
  max: number,
  etapes: EtapesChoix,
): Promise<Selection> {
  await prechargerGoogle(true);
  const jeton = await demanderJeton(config.clientId, PORTEE_DRIVE);
  if (!jeton) return null;
  const g = google();

  const docs = await new Promise<DocPicker[] | null>((resoudre) => {
    const vue = new g.picker.DocsView(g.picker.ViewId.DOCS)
      .setMimeTypes(mimesDrive(usage))
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    let constructeur = new g.picker.PickerBuilder()
      .addView(vue)
      .setOAuthToken(jeton)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setLocale('fr')
      .setOrigin(window.location.origin)
      .setTitle(usage === 'texte' ? 'Choisir un document Google' : usage === 'pdf' ? 'Choisir un PDF' : 'Choisir des photos')
      .setCallback((donnees) => {
        const action = donnees[g.picker.Response.ACTION];
        if (action === g.picker.Action.PICKED) resoudre((donnees[g.picker.Response.DOCUMENTS] as DocPicker[]) ?? []);
        else if (action === g.picker.Action.CANCEL) resoudre(null);
      });
    if (max > 1) constructeur = constructeur.enableFeature(g.picker.Feature.MULTISELECT_ENABLED).setMaxItems(max);
    // Le sélecteur de Google s'ajoute à la fin de la page et lui donne le
    // focus : le navigateur fait alors défiler la page jusqu'en bas. La
    // position d'origine est rétablie (JEP-408, relevé sur l'aperçu).
    const x = window.scrollX;
    const y = window.scrollY;
    etapes.avantAffichage();
    constructeur.build().setVisible(true);
    const retablir = () => window.scrollTo(x, y);
    window.requestAnimationFrame(() => {
      retablir();
      window.setTimeout(retablir, 150);
    });
  });
  if (!docs?.length) return null;
  etapes.avantTelechargement();

  const auth = { Authorization: `Bearer ${jeton}` };
  const champ = g.picker.Document;

  if (usage === 'texte') {
    const doc = docs[0];
    const id = encodeURIComponent(doc[champ.ID]);
    const reponse = await telecharger(`${API_DRIVE}/${id}/export?mimeType=text%2Fplain`, { headers: auth });
    if (!reponse.ok) throw new ErreurStockage(`Le document « ${doc[champ.NAME]} » n'a pas pu être lu (${reponse.status}).`);
    return { texte: (await reponse.text()).replace(/^﻿/, ''), nom: doc[champ.NAME] };
  }

  const fichiers: File[] = [];
  for (const doc of docs.slice(0, max)) {
    const id = encodeURIComponent(doc[champ.ID]);
    const taille = Number(doc[champ.SIZE_BYTES] ?? '0');
    if (taille > MAX_OCTETS_SOURCE) throw new ErreurStockage(`« ${doc[champ.NAME]} » dépasse 30 Mo.`);
    const reponse = await telecharger(`${API_DRIVE}/${id}?alt=media&supportsAllDrives=true`, { headers: auth });
    fichiers.push(await fichierDepuisReponse(reponse, doc[champ.NAME], doc[champ.MIME_TYPE] || 'application/octet-stream'));
  }
  return { fichiers };
}

// ── Google Photos ────────────────────────────────────────────

const API_PHOTOS = 'https://photospicker.googleapis.com/v1';

export type SessionPhotos = {
  id: string;
  pickerUri: string;
  jeton: string;
  intervalleMs: number;
  expireA: number;
};

type SessionBrute = {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  pollingConfig?: { pollInterval?: string; timeoutIn?: string };
};

/**
 * Première étape : connexion puis création d'une session de choix. Le membre
 * ouvre ensuite Google Photos par un second clic (`ouvrirGooglePhotos`) — un
 * onglet ouvert après ces deux appels réseau serait bloqué par le navigateur.
 */
export async function preparerGooglePhotos(
  config: NonNullable<ConfigStockage['googlePhotos']>,
  max: number,
): Promise<SessionPhotos | null> {
  await prechargerGoogle(false);
  const jeton = await demanderJeton(config.clientId, PORTEE_PHOTOS);
  if (!jeton) return null;
  const reponse = await telecharger(`${API_PHOTOS}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pickingConfig: { maxItemCount: String(Math.max(1, max)) } }),
  });
  const session = await jsonOuErreur<SessionBrute>(reponse, 'Google Photos a refusé la demande');
  const delai = dureeGoogleMs(session.pollingConfig?.timeoutIn, 30 * 60 * 1000, 60 * 1000);
  return {
    id: session.id,
    pickerUri: session.pickerUri,
    jeton,
    intervalleMs: dureeGoogleMs(session.pollingConfig?.pollInterval, 3000, 1000, 15000),
    expireA: Date.now() + delai,
  };
}

export function ouvrirGooglePhotos(session: SessionPhotos): void {
  // `/autoclose` : Google ferme l'onglet une fois le choix validé.
  window.open(`${session.pickerUri.replace(/\/$/, '')}/autoclose`, '_blank');
}

type MediaBrut = { id: string; type?: string; mediaFile?: { baseUrl?: string; mimeType?: string; filename?: string } };

/** Attend que le membre valide son choix dans Google Photos, puis télécharge les photos. */
export async function recupererGooglePhotos(
  session: SessionPhotos,
  max: number,
  signal: AbortSignal,
  avantTelechargement: () => void,
): Promise<Selection> {
  const auth = { Authorization: `Bearer ${session.jeton}` };
  try {
    for (;;) {
      if (signal.aborted) return null;
      if (Date.now() > session.expireA) throw new ErreurStockage('Le délai pour choisir dans Google Photos est écoulé. Recommencez.');
      const r = await telecharger(`${API_PHOTOS}/sessions/${encodeURIComponent(session.id)}`, { headers: auth, signal });
      const etat = await jsonOuErreur<SessionBrute>(r, 'Google Photos ne répond pas');
      if (etat.mediaItemsSet) break;
      await new Promise((ok) => window.setTimeout(ok, session.intervalleMs));
    }

    const medias: MediaBrut[] = [];
    let suite: string | null = null;
    do {
      const qs: string = `sessionId=${encodeURIComponent(session.id)}&pageSize=100${suite ? `&pageToken=${encodeURIComponent(suite)}` : ''}`;
      const r = await telecharger(`${API_PHOTOS}/mediaItems?${qs}`, { headers: auth, signal });
      const page: { mediaItems?: MediaBrut[]; nextPageToken?: string } = await jsonOuErreur(r, 'Google Photos ne répond pas');
      medias.push(...(page.mediaItems ?? []));
      suite = page.nextPageToken ?? null;
    } while (suite && medias.length < max);

    const photos = medias.filter((m) => m.type !== 'VIDEO' && m.mediaFile?.baseUrl).slice(0, max);
    if (!photos.length) throw new ErreurStockage('Aucune photo choisie (les vidéos ne sont pas prises en charge).');
    avantTelechargement();

    const fichiers: File[] = [];
    for (const m of photos) {
      const nom = (m.mediaFile?.filename || 'photo').replace(/\.(heic|heif)$/i, '.jpg');
      fichiers.push(await telechargerMediaPhotos(urlMediaPhotos(m.mediaFile!.baseUrl!), session.jeton, nom));
    }
    return { fichiers };
  } finally {
    // La session ne sert plus : on la ferme, sans attendre ni échouer.
    void fetch(`${API_PHOTOS}/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE', headers: auth }).catch(() => {});
  }
}

/**
 * Téléchargement d'un média : par le navigateur d'abord ; si Google ne
 * l'autorise pas (CORS), par la passerelle du site, restreinte aux hôtes de
 * Google Photos (`/api/stockage/en-ligne/google-photos`).
 */
async function telechargerMediaPhotos(url: string, jeton: string, nom: string): Promise<File> {
  try {
    const direct = await fetch(url, { headers: { Authorization: `Bearer ${jeton}` }, cache: 'no-store' });
    if (direct.ok) return await fichierDepuisReponse(direct, nom, 'image/jpeg');
  } catch {
    /* CORS : repli par le serveur */
  }
  const relais = await telecharger('/api/stockage/en-ligne/google-photos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!relais.ok) await jsonOuErreur(relais, 'Photo impossible à récupérer');
  return fichierDepuisReponse(relais, nom, 'image/jpeg');
}
