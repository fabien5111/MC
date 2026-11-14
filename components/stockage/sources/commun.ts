// Stockages en ligne (JEP-408) — outils communs aux adaptateurs du navigateur.
import { CANAL_RETOUR_OAUTH, MAX_OCTETS_SOURCE, type RetourOAuth } from '@/lib/stockage-en-ligne';

/** Résultat d'un choix : des fichiers, un texte, ou rien (choix annulé). */
export type Selection = { fichiers: File[] } | { texte: string; nom: string } | null;

/** Élément d'un explorateur (OneDrive, OneNote, Notion), rendu par `NavigateurElements`. */
export type Element = {
  id: string;
  nom: string;
  dossier: boolean;
  detail?: string;
  vignette?: string | null;
  /** Données propres à la source, rendues telles quelles à `recuperer`. */
  donnees?: unknown;
};

/** Source qu'on parcourt dans la fenêtre du site, faute de sélecteur officiel utilisable. */
export type Explorateur = {
  /** Libellé de la racine (fil d'Ariane). */
  racine: string;
  /** Recherche proposée ? */
  recherche: boolean;
  lister: (parent: Element | null, recherche: string) => Promise<Element[]>;
  recuperer: (choisis: Element[]) => Promise<Selection>;
};

/** Erreur à montrer telle quelle au membre. */
export class ErreurStockage extends Error {}

// ── Scripts des fournisseurs ─────────────────────────────────

const scripts = new Map<string, Promise<void>>();

/** Charge un script une seule fois par page. */
export function chargerScript(src: string, attributs: Record<string, string> = {}): Promise<void> {
  const deja = scripts.get(src);
  if (deja) return deja;
  const promesse = new Promise<void>((resoudre, rejeter) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    for (const [k, v] of Object.entries(attributs)) el.setAttribute(k, v);
    el.onload = () => resoudre();
    el.onerror = () => {
      scripts.delete(src);
      el.remove();
      rejeter(new ErreurStockage('Le service est injoignable. Vérifiez votre connexion et réessayez.'));
    };
    document.head.appendChild(el);
  });
  scripts.set(src, promesse);
  return promesse;
}

// ── Fenêtre de connexion (Microsoft, Notion) ─────────────────

const NOM_FENETRE = 'jp-connexion-stockage';

/**
 * Ouvre la fenêtre de connexion. À appeler DANS le geste du membre (clic) :
 * ouverte après un `await`, elle serait bloquée par le navigateur. On l'ouvre
 * donc vide, puis on lui donne son adresse une fois prête.
 */
export function ouvrirFenetreVide(): Window | null {
  const largeur = 520;
  const hauteur = 680;
  const gauche = Math.max(0, Math.round(window.screenX + (window.outerWidth - largeur) / 2));
  const haut = Math.max(0, Math.round(window.screenY + (window.outerHeight - hauteur) / 2));
  return window.open('', NOM_FENETRE, `popup=yes,width=${largeur},height=${hauteur},left=${gauche},top=${haut}`);
}

/** Jeton aléatoire (état d'une connexion, vérificateur PKCE). */
export function aleatoire(octets = 32): string {
  const t = new Uint8Array(octets);
  crypto.getRandomValues(t);
  return base64Url(t);
}

function base64Url(octets: Uint8Array): string {
  let s = '';
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Défi PKCE (S256) d'un vérificateur. */
export async function defiPkce(verificateur: string): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificateur));
  return base64Url(new Uint8Array(empreinte));
}

/**
 * Attend le retour de la connexion : la page `/stockage/retour` diffuse
 * `code` + `state` sur un canal de même origine. Rend `null` si le membre
 * ferme la fenêtre. Un `state` différent est ignoré (autre connexion, ou
 * tentative de falsification).
 */
export function attendreRetour(fenetre: Window, state: string): Promise<string | null> {
  return new Promise((resoudre, rejeter) => {
    const canal = new BroadcastChannel(CANAL_RETOUR_OAUTH);
    let fini = false;
    const terminer = () => {
      fini = true;
      canal.close();
      window.clearInterval(veille);
    };
    canal.onmessage = (ev: MessageEvent<RetourOAuth>) => {
      if (fini || ev.data?.state !== state) return;
      terminer();
      try {
        fenetre.close();
      } catch {
        /* déjà fermée */
      }
      if (ev.data.erreur || !ev.data.code) {
        if (/access_denied|cancel/i.test(ev.data.erreur ?? '')) resoudre(null);
        else rejeter(new ErreurStockage(`Connexion refusée : ${ev.data.erreur ?? 'aucun code reçu'}.`));
        return;
      }
      resoudre(ev.data.code);
    };
    // Fenêtre fermée sans retour : choix abandonné. `closed` peut mentir
    // quand le fournisseur coupe le lien entre fenêtres (COOP) : on laisse
    // alors au canal une seconde de grâce avant de conclure.
    const veille = window.setInterval(() => {
      if (fini || !fenetre.closed) return;
      window.setTimeout(() => {
        if (fini) return;
        terminer();
        resoudre(null);
      }, 1000);
    }, 500);
  });
}

// ── Téléchargement ───────────────────────────────────────────

/** Fichier depuis une réponse, plafonné (`MAX_OCTETS_SOURCE`). */
export async function fichierDepuisReponse(reponse: Response, nom: string, typeDeRepli: string): Promise<File> {
  if (!reponse.ok) throw new ErreurStockage(`Téléchargement refusé (${reponse.status}) pour « ${nom} ».`);
  const longueur = Number(reponse.headers.get('content-length') ?? '0');
  if (longueur > MAX_OCTETS_SOURCE) throw new ErreurStockage(`« ${nom} » dépasse 30 Mo.`);
  const blob = await reponse.blob();
  if (blob.size > MAX_OCTETS_SOURCE) throw new ErreurStockage(`« ${nom} » dépasse 30 Mo.`);
  const type = (blob.type || reponse.headers.get('content-type') || typeDeRepli).split(';')[0].trim();
  return new File([blob], nom, { type: type === 'application/octet-stream' ? typeDeRepli : type });
}

/** `fetch` qui traduit une panne réseau (CORS compris) en message lisible. */
export async function telecharger(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store' });
  } catch {
    throw new ErreurStockage('Le fichier n’a pas pu être récupéré. Réessayez, ou téléchargez-le puis déposez-le.');
  }
}

/** Corps JSON d'une réponse, ou erreur lisible (`erreur` de nos routes, sinon le statut). */
export async function jsonOuErreur<T>(reponse: Response, contexte: string): Promise<T> {
  if (reponse.ok) return (await reponse.json()) as T;
  let message = `${contexte} (${reponse.status}).`;
  try {
    const corps = (await reponse.json()) as { erreur?: string; error?: { message?: string } | string };
    if (typeof corps.erreur === 'string') message = corps.erreur;
    else if (typeof corps.error === 'object' && corps.error?.message) message = `${contexte} : ${corps.error.message}`;
  } catch {
    /* corps illisible : message par défaut */
  }
  throw new ErreurStockage(message);
}
