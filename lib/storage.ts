// Stockage objet — constantes, nommage et validation, purs (aucun accès
// réseau, aucun `node:crypto`). Utilisable côté serveur comme côté client — la
// signature TempURL, qui a besoin de `node:crypto` et des clés secrètes, vit
// dans lib/storage-data.ts. Motif ideas.ts / ideas-data.ts.
//
// Cf. docs/migration-infomaniak.md § 7.5 (lot B).

// Deux conteneurs, et c'est structurel : les photos de contact sont des
// données personnelles, visibles du seul administrateur et de leur auteur
// (docs/contact-jira.md § 15). Une clé d'objet non devinable n'est pas un
// contrôle d'accès — d'où un conteneur réellement privé, avec sa propre clé
// TempURL. Le cluster accepte les clés par conteneur (vérifié en B0), donc une
// fuite de la clé publique ne donne aucun accès aux photos de contact.
export const CONTENEURS = {
  photos: 'jp-photos',
  contact: 'jp-contact',
} as const;

export type Conteneur = keyof typeof CONTENEURS;

// Le conteneur `photos` est en lecture publique (`.r:*`), pas `contact`.
// Conséquence pour l'appelant : une photo de contact ne se lit que par une
// URL signée, jamais par son URL nue.
export const CONTENEUR_PUBLIC: Record<Conteneur, boolean> = {
  photos: true,
  contact: false,
};

// Ce que `lib/images.ts` sait produire aujourd'hui (`resizeImageToDataUrl`
// rend du jpeg ou du webp) plus le png, que `ImageSlot` accepte en entrée.
// Liste fermée : le type déclaré par l'appelant décide de l'extension de
// l'objet, donc du Content-Type que le stockage renverra au navigateur.
export const MIMES_ACCEPTES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type MimeAccepte = (typeof MIMES_ACCEPTES)[number];

const EXTENSIONS: Record<MimeAccepte, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export function estMimeAccepte(mime: string): mime is MimeAccepte {
  return (MIMES_ACCEPTES as readonly string[]).includes(mime);
}

// 8 Mo : très au-dessus de ce que la compression client produit (quelques
// centaines de kilo-octets), assez bas pour qu'un dépôt aberrant soit refusé
// avant de coûter du stockage. Ce n'est pas la limite de 4,5 Mo du corps d'une
// fonction serverless — justement, le téléversement ne passe pas par
// l'application (§ 3).
export const TAILLE_MAX_OCTETS = 8 * 1024 * 1024;

// Durée de validité d'une URL de dépôt. Assez pour un téléversement sur une
// connexion lente, assez court pour qu'une URL interceptée ne serve plus très
// longtemps. Le jeton ne vaut que pour UN chemin d'objet et UNE méthode.
export const EXPIRATION_TELEVERSEMENT_S = 15 * 60;

// Lecture d'un objet privé : bien plus court, l'URL n'a qu'à survivre au rendu
// de la page qui l'affiche.
export const EXPIRATION_LECTURE_S = 5 * 60;

/**
 * Usages déclarés — qui a le droit de déposer quoi, et où.
 *
 * Table plutôt que suite de `if` : c'est elle que les tests interrogent pour
 * verrouiller l'invariant qui compte — **aucun dépôt anonyme sur le conteneur
 * public**. Un usage `public` pointant sur `jp-photos` ouvrirait l'écriture du
 * conteneur en lecture publique à n'importe qui.
 */
export const USAGES = {
  recette: { conteneur: 'photos', prefixe: 'recettes', acces: 'membre' },
  profil: { conteneur: 'photos', prefixe: 'profils', acces: 'membre' },
  avis: { conteneur: 'photos', prefixe: 'avis', acces: 'membre' },
  banniere: { conteneur: 'photos', prefixe: 'bannieres', acces: 'admin' },
  publicite: { conteneur: 'photos', prefixe: 'publicites', acces: 'admin' },
  article: { conteneur: 'photos', prefixe: 'articles', acces: 'admin' },
  contact: { conteneur: 'contact', prefixe: 'contact', acces: 'public' },
} as const satisfies Record<string, { conteneur: Conteneur; prefixe: string; acces: Acces }>;

export type Usage = keyof typeof USAGES;
export type Acces = 'membre' | 'admin' | 'public';

export function estUsage(v: unknown): v is Usage {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(USAGES, v);
}

/**
 * Clé d'un nouvel objet.
 *
 * UUID plutôt qu'adressage par contenu. L'adressage par contenu rendrait la
 * reprise du B3 idempotente par construction, mais deux lignes portant la même
 * image partageraient le même objet — et plus personne ne pourrait le
 * supprimer sans risque d'en casser une autre. La propriété d'un objet doit
 * rester lisible, c'est ce qui permet le balayage de réconciliation.
 *
 * L'idempotence de la reprise s'obtient autrement, et plus simplement : une
 * colonne qui porte déjà une URL de stockage est sautée.
 *
 * Le préfixe n'est pas une hiérarchie de droits — le conteneur seul décide de
 * la visibilité — c'est un confort d'inventaire quand on liste le conteneur.
 */
export function nouvelleCleObjet(prefixe: string, mime: MimeAccepte): string {
  const propre = prefixe.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  return `${propre}/${crypto.randomUUID()}.${EXTENSIONS[mime]}`;
}

/**
 * Chemin Swift complet d'un objet, tel qu'il entre dans la signature TempURL.
 *
 * `base` est la racine rendue par `swift auth` (`OS_STORAGE_URL`), de la forme
 * `/v1/AUTH_<projet>`. La signature porte sur le chemin **non encodé**, `/v1/`
 * compris : signer autre chose que ce que le serveur relira est l'erreur qui
 * produit un 401 sans explication.
 */
export function cheminObjet(baseV1: string, conteneur: Conteneur, cle: string): string {
  return `${baseV1.replace(/\/$/, '')}/${CONTENEURS[conteneur]}/${cle}`;
}

/**
 * Cette valeur est-elle une URL de stockage objet, par opposition à une
 * data-URL ?
 *
 * Sert des deux côtés de la bascule : pendant les lots B2 et B3, une même
 * colonne porte les deux formes. C'est aussi ce que les deux validateurs du
 * § 5.2 devront appeler à la place de leur `startsWith('data:image/')` — dont
 * l'un, `lib/contact.ts`, écarte une photo non-`data:` **sans erreur**.
 */
export function estUrlStockage(valeur: string | null | undefined): boolean {
  return typeof valeur === 'string' && /^https:\/\//.test(valeur);
}

export function estDataUrlImage(valeur: string | null | undefined): valeur is string {
  return typeof valeur === 'string' && valeur.startsWith('data:image/');
}
