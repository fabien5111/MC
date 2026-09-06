// Rétention des imports (§ 7.9) — logique pure, sans base ni `next/headers` :
// la purge nocturne (serveur) et la mention affichée dans « Mes imports »
// (client) doivent compter les mêmes jours à partir du même repère. Motif
// ideas.ts / ideas-data.ts.
//
// Pourquoi cette rétention existe : `imports.recette` est un JSON de travail
// qui porte les images de l'import en data-URL — `RelectureEditor` ne les
// dépose sur le stockage objet qu'à la validation. Un brouillon jamais relu
// garde donc tout en base, indéfiniment : 4,7 Mo sur 18 lignes au relevé du
// 05/09, soit 17 % de la base. Le lot B avait sorti les images des colonnes
// scalaires ; celles-ci lui échappaient par construction.

/** Durée de conservation d'un import, comptée depuis sa DERNIÈRE ACTIVITÉ. */
export const RETENTION_JOURS = 30;

/**
 * À partir de combien de jours restants l'échéance est annoncée ligne par
 * ligne. Au-delà, la mention générale en tête de liste suffit : dater chaque
 * import trente jours à l'avance transformerait la liste en compte à rebours.
 */
export const PREAVIS_JOURS = 7;

const MS_PAR_JOUR = 86_400_000;

/**
 * Le repère est `updated_at`, jamais `created_at`.
 *
 * `RelectureEditor` écrit dans la table à chaque enregistrement intermédiaire
 * (`imports.update({ recette })`) : `updated_at` suit donc l'activité réelle.
 * Compter depuis la création purgerait un brouillon repris hier mais commencé
 * il y a cinq semaines — c'est-à-dire détruire une saisie en cours, le seul
 * vrai risque de cette fonctionnalité.
 */
export function dateSuppression(derniereActivite: string | Date): Date {
  const base = derniereActivite instanceof Date ? derniereActivite : new Date(derniereActivite);
  return new Date(base.getTime() + RETENTION_JOURS * MS_PAR_JOUR);
}

/** Vrai quand l'échéance mérite d'être annoncée sur la ligne (préavis, ou déjà dépassée). */
export function suppressionProche(derniereActivite: string | Date, maintenant: Date = new Date()): boolean {
  return dateSuppression(derniereActivite).getTime() - maintenant.getTime() <= PREAVIS_JOURS * MS_PAR_JOUR;
}

/**
 * Borne de la purge, en ISO : tout import dont `updated_at` est STRICTEMENT
 * antérieur est expiré. Rendue par une fonction plutôt que composée dans la
 * route, pour que le prédicat de suppression soit testable — une purge se
 * trompe une seule fois.
 */
export function seuilPurge(maintenant: Date = new Date()): string {
  return new Date(maintenant.getTime() - RETENTION_JOURS * MS_PAR_JOUR).toISOString();
}

/**
 * Vrai si l'import est expiré au moment donné. Miroir exact de `seuilPurge`,
 * côté valeur — la comparaison est donc STRICTE, comme le `.lt()` qu'elle
 * double : à la seconde exacte de l'échéance, l'import est conservé. La borne
 * appartient au membre, pas au ménage ; un test la tient des deux côtés,
 * parce qu'une divergence d'une seconde entre le prédicat affiché et le
 * filtre SQL ferait annoncer une suppression qui n'a pas lieu — ou l'inverse.
 */
export function estExpire(derniereActivite: string | Date, maintenant: Date = new Date()): boolean {
  return dateSuppression(derniereActivite).getTime() < maintenant.getTime();
}
