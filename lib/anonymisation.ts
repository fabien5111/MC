// Suppression d'un compte et anonymisation (JEP-33) — logique PURE, importable
// par les composants client comme par le serveur. L'écriture est dans
// `lib/anonymisation-data.ts` (clé service_role), motif ideas.ts / ideas-data.ts.
//
// Arbitrage du 28/10/2026 : à la suppression d'un compte, le CONTENU part avec
// lui (recettes, publiées comprises — CGU § 4.2, Confidentialité « Contenus
// publiés »), sauf les avis (note + commentaire) et les idées de la boîte à
// idées, conservés et signés « Membre supprimé ».
//
// Ce qui est conservé est rattaché à un PROFIL FANTÔME propre à chaque
// suppression, et non au profil d'origine : `profiles.id` référence
// `auth.users` en cascade, et l'API d'administration de GoTrue ne sait pas
// détacher une identité Google. Garder le compte d'origine laisserait donc
// l'identité Google (adresse comprise) en base et empêcherait la même adresse
// Google de se réinscrire. Le fantôme a son propre compte de connexion, sans
// identité externe, à une adresse aléatoire, banni : personne ne s'y connecte.
// Un fantôme par suppression (jamais un seul partagé) : l'index unique
// `comments(recipe_id, user_id)` refuserait deux membres supprimés qui ont
// noté la même recette. Il sert aussi de trace minimale : sa date de création
// est celle de l'opération, sans aucune donnée d'identité.
import { normSearch } from '@/lib/text-search';

/** Nom affiché à la place du pseudo, partout où un contenu conservé est signé. */
export const NOM_MEMBRE_SUPPRIME = 'Membre supprimé';

/** `profiles.status` d'un profil fantôme. Ni bloquant ni masquant (≠ `disabled`) : ses avis restent visibles et comptent dans la note. */
export const STATUT_SUPPRIME = 'deleted';

/** Préfixe de l'adresse publique d'un fantôme (`membre-supprime-<8 hex>`, 24 caractères ≤ 30). */
export const PREFIXE_SLUG_SUPPRIME = 'membre-supprime-';

/** Domaine des adresses de connexion des fantômes : un domaine à nous, sans boîte aux lettres. */
export const DOMAINE_EMAIL_SUPPRIME = 'anonyme.jepatisse.com';

/** Action du journal `member_moderation_events` (suppression par un admin). */
export const ACTION_JOURNAL_ANONYMISATION = 'anonymisation';

/** Longueur maximale du motif saisi par l'admin. */
export const MOTIF_MAX = 500;

/** Message affiché au membre avant confirmation (validé le 28/10/2026). */
export const MESSAGE_AVANT_SUPPRESSION =
  'Vos recettes, y compris publiées, seront supprimées. Vos notes et avis resteront en ligne, signés « Membre supprimé ».';

export function estProfilSupprime(statut: string | null | undefined): boolean {
  return statut === STATUT_SUPPRIME;
}

/** Adresse publique d'un profil anonyme : elle ne mène nulle part (404), on n'y fait pas de lien. */
export function estSlugSupprime(slug: string | null | undefined): boolean {
  return !!slug && slug.startsWith(PREFIXE_SLUG_SUPPRIME);
}

/** Adresse publique et adresse de connexion d'un fantôme, à partir d'un aléa hexadécimal. */
export function identiteFantome(alea: string): { slug: string; email: string } {
  const court = alea.replace(/[^0-9a-f]/gi, '').toLowerCase().slice(0, 8).padEnd(8, '0');
  return {
    slug: `${PREFIXE_SLUG_SUPPRIME}${court}`,
    email: `supprime-${alea.replace(/[^0-9a-z]/gi, '').toLowerCase()}@${DOMAINE_EMAIL_SUPPRIME}`,
  };
}

/**
 * Confirmation par saisie du pseudo : casse, accents et espaces de bord
 * ignorés (même comparaison que la recherche). Un pseudo vide ne se confirme
 * jamais — un compte sans pseudo passe par `/choix-pseudo` avant `/reglages`.
 */
export function confirmationPseudoValide(saisie: string, pseudo: string | null | undefined): boolean {
  const attendu = normSearch((pseudo ?? '').trim());
  return attendu.length > 0 && normSearch(saisie.trim()) === attendu;
}

export type DemandeAdmin = { motif: string };
export type ContexteAdmin = {
  acteurId: string;
  cibleId: string;
  cibleRole: string | null;
  cibleStatut: string | null;
};

/** Contrôles du geste d'un admin : motif obligatoire, ni soi-même, ni un admin, ni un compte déjà supprimé. */
export function validerDemandeAdmin(
  corps: { motif?: unknown },
  ctx: ContexteAdmin,
): { ok: true; demande: DemandeAdmin } | { ok: false; erreur: string } {
  if (ctx.acteurId === ctx.cibleId) return { ok: false, erreur: 'Vous ne pouvez pas anonymiser votre propre compte depuis la fiche.' };
  if (ctx.cibleRole === 'admin') return { ok: false, erreur: 'Un administrateur ne peut pas être anonymisé.' };
  if (estProfilSupprime(ctx.cibleStatut)) return { ok: false, erreur: 'Ce compte a déjà été supprimé.' };
  const motif = typeof corps.motif === 'string' ? corps.motif.trim() : '';
  if (!motif) return { ok: false, erreur: 'Le motif est obligatoire.' };
  if (motif.length > MOTIF_MAX) return { ok: false, erreur: `Le motif ne doit pas dépasser ${MOTIF_MAX} caractères.` };
  return { ok: true, demande: { motif } };
}

/**
 * Remplace le pseudo d'un membre supprimé dans le texte d'une notification
 * déjà délivrée à un autre membre (« Alice a mis votre recette en favori »).
 * Remplacement exact du pseudo, jamais d'une sous-chaîne d'un autre mot.
 */
export function remplacerPseudo(texte: string | null, pseudo: string): string | null {
  if (texte == null || !pseudo) return texte;
  const echappe = pseudo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return texte.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${echappe}(?=$|[^\\p{L}\\p{N}])`, 'gu'), `$1${NOM_MEMBRE_SUPPRIME}`);
}

/**
 * URL des photos d'une recette (en-tête, vignettes, photos d'étape), à
 * supprimer du stockage une fois la recette supprimée — sauf si une autre
 * ligne y renvoie encore (un duplicata ou une extraction copient les photos
 * par URL).
 */
export function photosDeRecettes(
  recettes: {
    hero_image_url?: string | null;
    hero_image_original_url?: string | null;
    hero_thumb_url?: string | null;
    hero_card_url?: string | null;
  }[],
  photosEtapes: { url?: string | null; original_url?: string | null }[],
): string[] {
  const urls = new Set<string>();
  const ajouter = (u: string | null | undefined) => {
    if (u && /^https?:\/\//.test(u)) urls.add(u);
  };
  for (const r of recettes) {
    ajouter(r.hero_image_url);
    ajouter(r.hero_image_original_url);
    ajouter(r.hero_thumb_url);
    ajouter(r.hero_card_url);
  }
  for (const p of photosEtapes) {
    ajouter(p.url);
    ajouter(p.original_url);
  }
  return [...urls];
}

export type OrigineSuppression = 'membre' | 'admin';

/** E-mail de confirmation, adressé à l'ancienne adresse du membre (corps seul : le gabarit signe). */
export function composerEmailSuppression(p: {
  origine: OrigineSuppression;
  motif?: string | null;
  abonnementResilie: boolean;
  urlSite: string;
}): { sujet: string; texte: string } {
  const lignes = [
    'Bonjour,',
    '',
    p.origine === 'membre'
      ? 'Comme vous l’avez demandé, votre compte Je pâtisse ! a été supprimé.'
      : 'Votre compte Je pâtisse ! a été supprimé par l’équipe du site.',
  ];
  if (p.origine === 'admin' && p.motif) lignes.push('', `Motif : ${p.motif}`);
  lignes.push(
    '',
    'Vos recettes, vos fournées, vos listes et vos données personnelles ont été supprimées. Vos notes et avis restent en ligne, signés « Membre supprimé ».',
  );
  if (p.abonnementResilie) {
    lignes.push('', 'Votre abonnement a été résilié : aucun nouveau prélèvement ne sera effectué.');
  }
  lignes.push(
    '',
    `Vous pouvez à tout moment créer un nouveau compte avec la même adresse, mais vous ne retrouverez aucune de vos données : il repartira de zéro. ${p.urlSite.replace(/\/$/, '')}/connexion`,
  );
  if (p.origine === 'admin') {
    lignes.push('', `Pour toute question : ${p.urlSite.replace(/\/$/, '')}/contact`);
  }
  return { sujet: 'Votre compte Je pâtisse ! a été supprimé', texte: lignes.join('\n') };
}
