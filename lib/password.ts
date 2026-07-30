// Règles de complexité du mot de passe (inscription).
// Logique pure, sans effet de bord : utilisable côté serveur comme côté client.

export type PasswordCriterion = {
  /** Identifiant stable, utilisable comme clé de rendu. */
  id: 'length' | 'uppercase' | 'digit' | 'special';
  /** Libellé affiché à l'utilisateur. */
  label: string;
  /** Le mot de passe satisfait-il ce critère ? */
  ok: boolean;
};

export type PasswordStrength = {
  criteria: PasswordCriterion[];
  /** Nombre de critères satisfaits (0 à 4). */
  score: number;
  /** Nombre total de critères. */
  total: number;
  /** Tous les critères sont satisfaits. */
  valid: boolean;
  /** Libellé de synthèse (« Faible », « Excellent »…). */
  label: string;
};

export const PASSWORD_MIN_LENGTH = 8;

// Est considéré comme « caractère spécial » tout ce qui n'est ni lettre ni
// chiffre (ponctuation, symboles, espace). Une liste blanche plus étroite
// rejetterait des mots de passe légitimes générés par un gestionnaire.
const SPECIAL = /[^\p{L}\p{N}]/u;

export function evaluatePassword(password: string): PasswordStrength {
  const criteria: PasswordCriterion[] = [
    {
      id: 'length',
      label: `${PASSWORD_MIN_LENGTH} caractères minimum`,
      ok: password.length >= PASSWORD_MIN_LENGTH,
    },
    { id: 'uppercase', label: 'Une majuscule', ok: /\p{Lu}/u.test(password) },
    { id: 'digit', label: 'Un chiffre', ok: /\p{N}/u.test(password) },
    { id: 'special', label: 'Un caractère spécial', ok: SPECIAL.test(password) },
  ];

  const score = criteria.filter((c) => c.ok).length;
  const total = criteria.length;

  return {
    criteria,
    score,
    total,
    valid: score === total,
    label: ['Trop court', 'Faible', 'Moyen', 'Bon', 'Excellent'][score],
  };
}
