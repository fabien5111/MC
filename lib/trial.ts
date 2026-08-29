// Empreinte d'e-mail pour le contrôle d'éligibilité à l'essai gratuit.
//
// Server-only : `TRIAL_EMAIL_SALT` est un secret, et cette fonction ne doit
// jamais rejoindre le bundle client — à n'importer que depuis une route ou
// un Server Component. La base ne voit jamais l'adresse elle-même
// (cf. docs/abonnements.md §1.4) : seule l'empreinte, salée, y est stockée,
// pour que la ligne `trials` survive à la suppression du compte sans
// conserver de donnée personnelle en clair.
import { createHash } from 'node:crypto';

// Normalisation « Gmail » (spec §3.6) : minuscules, espaces retirés, points
// et tout ce qui suit un `+` supprimés côté local. Ne vaut QUE pour Gmail —
// un autre fournisseur suffit à obtenir un second essai avec une variante de
// son adresse. C'est un ralentisseur, pas un verrou (assumé, cf. doc).
export function normalizeEmailForTrial(email: string): string {
  const propre = email.trim().toLowerCase().replace(/\s+/g, '');
  const [local, domaine] = propre.split('@');
  if (!domaine) return propre;
  const estGmail = domaine === 'gmail.com' || domaine === 'googlemail.com';
  const localNormalise = estGmail ? local.replace(/\./g, '').split('+')[0] : local;
  return `${localNormalise}@${domaine}`;
}

export function hashTrialEmail(email: string): string {
  const sel = process.env.TRIAL_EMAIL_SALT;
  if (!sel) throw new Error("TRIAL_EMAIL_SALT n'est pas configuré côté serveur.");
  return createHash('sha256').update(`${sel}:${normalizeEmailForTrial(email)}`).digest('hex');
}
