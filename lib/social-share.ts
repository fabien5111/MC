// Partage vers les réseaux sociaux (JEP-21) — URL de partage, fonctions pures.
//
// Chaque réseau reçoit l'URL de la PAGE, jamais une image : c'est la page qui
// porte sa carte d'aperçu (balises OpenGraph + `opengraph-image`), et chaque
// réseau la lit lui-même. Rien d'autre à fournir que l'URL et un texte.
//
// INSTAGRAM N'A PAS D'URL DE PARTAGE. Aucune adresse web ne permet de
// publier un lien sur Instagram — ni publication, ni story. Deux chemins
// seulement : la feuille de partage native du téléphone (`navigator.share`),
// où Instagram apparaît s'il est installé, et la copie du lien à coller en
// story ou en bio. D'où `instagram` absent de `lienReseau` : la feuille de
// partage (`SocialShareSheet`) l'aiguille vers l'une ou l'autre.

export type Reseau = 'facebook' | 'pinterest' | 'whatsapp' | 'x' | 'email';

export const RESEAUX: { id: Reseau; label: string }[] = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'x', label: 'X' },
  { id: 'email', label: 'E-mail' },
];

export type ContenuPartage = {
  url: string;
  // Phrase d'accroche (WhatsApp, X, corps de l'e-mail, description Pinterest).
  texte: string;
  // Objet de l'e-mail.
  titre: string;
  // Image absolue proposée à Pinterest (épinglé = une image, pas une page).
  image?: string;
};

export function lienReseau(reseau: Reseau, c: ContenuPartage): string {
  const u = encodeURIComponent(c.url);
  const t = encodeURIComponent(c.texte);
  switch (reseau) {
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case 'pinterest':
      return `https://pinterest.com/pin/create/button/?url=${u}&description=${t}${c.image ? `&media=${encodeURIComponent(c.image)}` : ''}`;
    case 'whatsapp':
      return `https://wa.me/?text=${encodeURIComponent(`${c.texte} ${c.url}`)}`;
    case 'x':
      return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    case 'email':
      return `mailto:?subject=${encodeURIComponent(c.titre)}&body=${encodeURIComponent(`${c.texte}\n\n${c.url}`)}`;
  }
}

// Message imposé par la spec pour le partage d'un carnet.
export const MESSAGE_PARTAGE_CARNET = 'Je te partage mes recettes sur Je pâtisse !';

export const MESSAGE_PARTAGE_SITE =
  'Je pâtisse ! — la haute pâtisserie à la maison : ton carnet de recettes, les fournées guidées et la liste de courses.';
