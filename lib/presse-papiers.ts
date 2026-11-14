// Coller une image (JEP-408) — lecture du presse-papiers, sans dépendance.
//
// Partagé par les emplacements de photo (`ImageSlot`) et l'import par photo
// (`ImporterForm`). Ouvert à tous les plans : ce n'est pas un stockage en ligne.

/** Types d'image que la compression sait lire (mêmes que `isAcceptedImage`). */
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

/**
 * Images d'un collage. Une capture d'écran arrive sans nom : on lui en donne
 * un, sans quoi la liste des pages de l'import afficherait une ligne vide.
 */
export function imagesDuPressePapiers(donnees: DataTransfer | null): File[] {
  if (!donnees) return [];
  const brutes: File[] = [];
  for (const item of Array.from(donnees.items ?? [])) {
    if (item.kind !== 'file') continue;
    const f = item.getAsFile();
    if (f) brutes.push(f);
  }
  if (!brutes.length) brutes.push(...Array.from(donnees.files ?? []));
  return brutes
    .filter((f) => TYPES.includes(f.type))
    .map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `image-collee-${i + 1}.${f.type.split('/')[1] || 'png'}`, { type: f.type })));
}

/** Le collage vise-t-il un champ de saisie ? On le laisse alors faire. */
export function cibleEditable(cible: EventTarget | null): boolean {
  if (!cible || typeof (cible as HTMLElement).tagName !== 'string') return false;
  const el = cible as HTMLElement;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}
