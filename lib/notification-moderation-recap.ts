// Section « Modération » du récapitulatif e-mail, recomposée à l'ENVOI
// (JEP-386) — PUR : aucune lecture de base, testable sans réseau.
//
// Les lignes `moderation_recette` / `moderation_avis` de `email_digest_queue`
// sont figées au moment de l'événement et ne portent aucune référence à la
// recette ou à l'avis : renvoyées telles quelles, elles annonçaient une recette
// à valider dont l'auteur avait été anonymisé depuis, ou un avis déjà validé.
// Elles ne servent donc plus que de DÉCLENCHEUR (« il s'est passé quelque chose
// dans cette file depuis le dernier mail ») ; le contenu vient de l'état réel
// des files, lu par `envoyerRecapitulatifs` juste avant l'envoi.
import type { LigneRecap } from '@/lib/notification-email';

/** Une file de modération telle qu'elle est au moment de l'envoi. */
export type FileModeration = {
  /** Nombre total d'éléments en attente. */
  total: number;
  /** Titres des plus récents (au plus `TITRES_MAX` sont affichés). */
  titres: string[];
};

export type FilesModeration = { recettes: FileModeration; avis: FileModeration };

export const TITRES_MAX = 5;

/** Événements dont les lignes en file sont remplacées par l'état réel. */
export const EVENEMENTS_FILE: Record<string, keyof FilesModeration> = {
  moderation_recette: 'recettes',
  moderation_avis: 'avis',
};

export function estEvenementFile(evenement: string): boolean {
  return Object.prototype.hasOwnProperty.call(EVENEMENTS_FILE, evenement);
}

/**
 * Files que le rôle peut traiter : l'écran des avis (`/admin/commentaires`)
 * est réservé à l'admin complet, le gestionnaire n'a que les recettes. Tout
 * autre rôle (rôle retiré depuis la mise en file) : aucune.
 */
export function filesDuRole(role: string | null | undefined): (keyof FilesModeration)[] {
  if (role === 'admin') return ['recettes', 'avis'];
  if (role === 'gestionnaire') return ['recettes'];
  return [];
}

function citer(titres: string[], total: number, prefixe = ''): string {
  const vus = titres.map((t) => t.trim()).filter(Boolean).slice(0, TITRES_MAX);
  if (vus.length === 0) return '';
  const reste = total - vus.length;
  return ` : ${vus.map((t) => `${prefixe}« ${t} »`).join(', ')}${reste > 0 ? ` et ${reste} autre${reste > 1 ? 's' : ''}` : ''}`;
}

/**
 * Lignes « Modération » du récapitulatif d'un membre. Une file n'apparaît que
 * si le membre avait au moins une ligne en file pour elle (les préférences ont
 * déjà été appliquées à ces lignes), que son rôle la lui ouvre ET qu'elle
 * n'est pas vide à l'instant de l'envoi — une file vidée entre-temps ne dit
 * plus rien.
 */
export function lignesModerationActuelles(opts: {
  evenements: Iterable<string>;
  role: string | null | undefined;
  files: FilesModeration;
}): LigneRecap[] {
  const demandees = new Set<keyof FilesModeration>();
  for (const e of opts.evenements) if (estEvenementFile(e)) demandees.add(EVENEMENTS_FILE[e]);
  const lignes: LigneRecap[] = [];
  for (const file of filesDuRole(opts.role)) {
    if (!demandees.has(file)) continue;
    const { total, titres } = opts.files[file];
    if (total <= 0) continue;
    if (file === 'recettes') {
      lignes.push({
        categorie: 'moderation',
        rubrique: 'moderation',
        titre: total > 1 ? 'Des recettes attendent une modération' : 'Une recette attend une modération',
        corps: `${total > 1 ? `${total} recettes attendent` : '1 recette attend'} votre validation${citer(titres, total)}.`,
        lien: '/admin/recettes',
      });
    } else {
      lignes.push({
        categorie: 'moderation',
        rubrique: 'moderation',
        titre: total > 1 ? 'Des avis attendent une modération' : 'Un avis attend une modération',
        corps: `${total > 1 ? `${total} avis attendent` : '1 avis attend'} votre validation${citer(titres, total, 'sur ')}.`,
        lien: '/admin/commentaires',
      });
    }
  }
  return lignes;
}
