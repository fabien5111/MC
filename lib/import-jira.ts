// Import en lot de recettes préparées dans des tickets Jira — partie PURE.
//
// Le texte de chaque recette vit dans un ticket Jira (type « Ajout données »),
// accompagné de la photo finale du dessert. La structuration — le travail que
// fait l'IA dans `/api/import-url` — est faite en amont, hors de l'application,
// et déposée dans `imports-jira/<CLÉ>.json` sous la forme exacte que rend
// l'IA (`RecetteIA`). Le membre destinataire n'y figure PAS : il est donné au
// lancement du workflow (`destinataire`, e-mail ou pseudo) — une adresse
// e-mail enregistrée dans le dépôt resterait dans l'historique git. Tout ce qui SUIT l'appel IA dans la route est en revanche
// rejoué ici à l'identique, avec les mêmes fonctions : nettoyage, validation,
// normalisation des unités contre le vrai référentiel `units`, conversion vers
// le pivot interne. Un brouillon importé de Jira est donc indiscernable, pour
// l'écran de relecture, d'un import par texte collé.
//
// Le ticket Jira est facultatif : une recette sans ticket (un composant rédigé
// hors de Jira) porte une clé locale `local-<nom>` (cf. `natureCle`), et
// s'importe de la même façon — sans photo, sans commentaire ni transition
// Jira.
//
// Les entrées/sorties (Jira, stockage objet, base) vivent dans
// `scripts/import-jira-recettes.ts`, lancé par
// `.github/workflows/import-jira-recettes.yml`.
import {
  cleanPivotRecette,
  toPivotInterne,
  validatePivot,
  type RecetteIA,
  type UniteRef,
} from '@/lib/ai/import-pivot';

export type FichierImportJira = {
  /**
   * Clé de l'import : un ticket Jira (`JEP-242`) ou une clé locale
   * (`local-genoise-nature`) — cf. `natureCle`.
   */
  ticket: string;
  /** Recette structurée, au format de sortie de l'IA d'import. */
  recette: RecetteIA;
};

const CLE_TICKET = /^[A-Z][A-Z0-9]+-\d+$/;

// Clé locale : recette qui n'a pas de ticket Jira (composant rédigé hors de
// Jira, par exemple). Préfixe imposé et premier segment alphabétique : même
// passée en majuscules (« LOCAL-GENOISE »), elle ne peut JAMAIS ressembler à
// une clé Jira, dont la partie après le tiret est numérique — la nature
// d'une clé se lit donc sur sa forme seule, sans ambiguïté.
const CLE_LOCALE = /^local-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export type NatureCle = { nature: 'jira' | 'locale'; cle: string };

/**
 * Nature et forme canonique d'une clé d'import : ticket Jira en majuscules
 * (`JEP-242`), ou clé locale en minuscules (`local-genoise-nature`). Une clé
 * locale ne touche jamais Jira : ni photo lue sur un ticket, ni commentaire,
 * ni transition.
 */
export function natureCle(saisie: string): NatureCle | { erreur: string } {
  const brut = String(saisie ?? '').trim();
  const locale = brut.toLowerCase();
  if (CLE_LOCALE.test(locale)) return { nature: 'locale', cle: locale };
  const jira = brut.toUpperCase();
  if (CLE_TICKET.test(jira)) return { nature: 'jira', cle: jira };
  return {
    erreur:
      `Clé invalide : « ${brut} » — attendu un ticket Jira (ex. JEP-242) ` +
      'ou une clé locale (ex. local-genoise-nature).',
  };
}

/**
 * Marque posée dans `imports.fichier_original`. Double rôle : situer le
 * brouillon à la relecture (c'est la colonne qui y affiche l'origine), et
 * rendre l'import idempotent — une clé dont la marque existe déjà en base
 * n'est jamais réimportée, quelle que soit l'exécution qui l'a posée. La
 * marque d'un ticket Jira est inchangée (`Jira <CLÉ>`) : les imports déjà
 * faits restent reconnus.
 */
export function marqueImportJira(ticket: string): string {
  const n = natureCle(ticket);
  return 'erreur' in n || n.nature === 'jira' ? `Jira ${ticket}` : `Import ${n.cle}`;
}

/**
 * Relit et valide la forme d'un fichier `imports-jira/<CLÉ>.json`. Le nom du
 * fichier doit correspondre à la clé qu'il déclare : un copier-coller d'un
 * fichier à l'autre sans corriger la clé importerait deux fois la même
 * recette sous deux noms.
 */
export function lireFichierImportJira(
  brut: unknown,
  cleAttendue: string,
): { fichier: FichierImportJira } | { erreur: string } {
  if (!brut || typeof brut !== 'object') return { erreur: 'Fichier vide ou illisible.' };
  const f = brut as Record<string, unknown>;
  const declaree = natureCle(typeof f.ticket === 'string' ? f.ticket : '');
  if ('erreur' in declaree) return { erreur: declaree.erreur };
  const ticket = declaree.cle;
  const attendue = natureCle(cleAttendue);
  if ('erreur' in attendue || ticket !== attendue.cle) {
    return { erreur: `Le fichier déclare ${ticket}, mais il est rangé sous ${cleAttendue}.` };
  }
  if (!f.recette || typeof f.recette !== 'object' || Array.isArray(f.recette)) {
    return { erreur: 'Recette structurée absente.' };
  }
  return { fichier: { ticket, recette: f.recette as RecetteIA } };
}

/**
 * Critère de recherche du membre destinataire, tel que saisi au lancement :
 * une adresse e-mail (`profiles.email`, recopiée en minuscules depuis le
 * compte) ou un pseudo (`profiles.username`, le slug de l'adresse `/u/…`).
 */
export function critereDestinataire(
  saisie: string,
): { colonne: 'email' | 'username'; valeur: string } | { erreur: string } {
  const v = saisie.trim().toLowerCase();
  if (!v) return { erreur: 'Destinataire absent : e-mail ou pseudo du membre à renseigner au lancement.' };
  if (v.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { colonne: 'email', valeur: v } : { erreur: 'Adresse e-mail invalide.' };
  }
  return /^[a-z0-9-]+$/.test(v)
    ? { colonne: 'username', valeur: v }
    : { erreur: 'Pseudo invalide : attendu le slug de l’adresse du profil (/u/…).' };
}

export type PieceJointeJira = { id: string; filename?: string; mimeType?: string; size?: number; content?: string };

/**
 * Photo principale : la pièce jointe image du ticket. S'il y en a plusieurs,
 * la plus ancienne (premier dépôt) est retenue et le choix est signalé — on
 * ne devine pas laquelle est « la bonne » au-delà de ça.
 */
export function choisirPhotoJira(pieces: PieceJointeJira[]): { piece: PieceJointeJira | null; alerte: string | null } {
  const images = pieces.filter((p) => typeof p.mimeType === 'string' && p.mimeType.startsWith('image/') && p.content);
  if (!images.length) return { piece: null, alerte: 'Aucune photo jointe au ticket : photo principale à ajouter en relecture.' };
  const triees = [...images].sort((a, b) => Number(a.id) - Number(b.id));
  return {
    piece: triees[0],
    alerte:
      triees.length > 1
        ? `${triees.length} photos jointes au ticket : « ${triees[0].filename ?? triees[0].id} » retenue comme photo principale.`
        : null,
  };
}

/**
 * Construit le brouillon (`imports.recette`) exactement comme
 * `/api/import-url` après l'appel IA : même nettoyage, même validation, même
 * conversion, mêmes champs de provenance (`source_type = 'texte'`).
 * `erreurs` non vide = import refusé, comme une extraction incomplète.
 *
 * `photoUrl` est l'URL publique de la photo déjà déposée sur `jp-photos` :
 * l'écran de relecture la reprend telle quelle à la publication
 * (`televerserImage` ne redépose qu'une data-URL fraîche), comme la photo
 * d'un import PDF.
 */
export function preparerBrouillonJira(
  fichier: FichierImportJira,
  units: UniteRef[],
  photoUrl: string | null,
  maintenant: Date,
): { pivot: Record<string, any>; erreurs: string[]; alertes: string[] } {
  // Copie profonde : `cleanPivotRecette` modifie son argument en place.
  const recette = structuredClone(fichier.recette);
  cleanPivotRecette(recette);
  const { erreurs, alertes } = validatePivot(recette, units);
  const pivot = toPivotInterne(recette, units);

  pivot.schema_version = '1.0';
  pivot.statut = 'brouillon';
  pivot.visibilite = 'privee';
  pivot.source = {
    type: 'texte',
    url: null,
    url_origine: null,
    video_url: recette.video_url || null,
    fichier_original: marqueImportJira(fichier.ticket),
    auteur_origine: recette.auteur_origine || null,
    importee_le: maintenant.toISOString(),
  };
  pivot.conseils_degustation =
    typeof pivot.conseils_degustation === 'string' && pivot.conseils_degustation.trim()
      ? pivot.conseils_degustation.trim()
      : null;

  if (photoUrl) {
    pivot.photo_principale = photoUrl;
    pivot.photo_principale_original = photoUrl;
    pivot.photo_principale_ai_retouched = false;
  }

  return { pivot, erreurs, alertes };
}
