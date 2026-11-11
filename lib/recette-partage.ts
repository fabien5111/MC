// Carte d'aperçu d'une recette (JEP-281) — logique pure, testée.
//
// Le texte affiché sous l'image par Facebook, WhatsApp… vient de la
// description saisie par l'auteur : on la ramène à une phrase courte (les
// inspecteurs de carte conseillent ~125 caractères), coupée entre deux mots.

export const DESCRIPTION_PARTAGE_MAX = 125;
export const DESCRIPTION_PARTAGE_DEFAUT = 'Une recette à retrouver et à cuisiner sur Je pâtisse !';

/** Description de partage : espaces ramenés à un seul, coupée au mot près avec « … ». */
export function descriptionRecettePartage(brut: string | null | undefined, max = DESCRIPTION_PARTAGE_MAX): string {
  const texte = (brut ?? '').replace(/\s+/g, ' ').trim();
  if (!texte) return DESCRIPTION_PARTAGE_DEFAUT;
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max - 1);
  const dernierEspace = coupe.lastIndexOf(' ');
  // Un seul mot interminable : coupe nette plutôt qu'un texte vide.
  const base = dernierEspace > max * 0.5 ? coupe.slice(0, dernierEspace) : coupe;
  return `${base.replace(/[\s,;:.\-–—]+$/, '')}…`;
}
