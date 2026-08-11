// Extensions TipTap propres au blog.
//
// Le renvoi vers une recette est un **nœud d'éditeur**, pas un lien saisi à la
// main : c'est ce qui garantit qu'il référence une recette existante du site
// (`recipeId`) au lieu d'une URL tapée à la main, et qu'il reste repérable
// dans le document (bouton dédié de la barre d'outils, rendu distinct du texte
// courant). Un lien Markdown ne peut pas porter cette distinction — c'est la
// raison du choix TipTap/`jsonb` plutôt qu'un corps en Markdown, documentée
// dans le handoff.
import { Node, mergeAttributes } from '@tiptap/core';
import TiptapImage from '@tiptap/extension-image';

// Image du corps de texte, avec légende — le handoff prévoit un champ de
// légende sous chaque image insérée. L'extension standard n'a pas cet
// attribut : on l'ajoute plutôt que d'inventer un second nœud à synchroniser
// avec l'image qu'il légende.
export const Image = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: { default: '' },
    };
  },
});

export type RecipeLinkAttrs = { recipeId: string; title: string; note?: string };

export const RecipeLink = Node.create({
  name: 'recipeLink',
  group: 'block',
  atom: true, // pas d'édition interne : on remplace le nœud, on n'entre pas dedans

  addAttributes() {
    return {
      recipeId: { default: null },
      title: { default: '' },
      note: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-recipe-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // Rendu HTML de secours (copier/coller, export) — le rendu réel de
    // l'article passe par `components/blog/ArticleBody.tsx`, qui lit
    // directement le nœud plutôt que ce balisage.
    return ['div', mergeAttributes(HTMLAttributes, { 'data-recipe-link': '' }), HTMLAttributes.title || ''];
  },
});

// Insertion via `editor.chain().focus().insertContent(...)` plutôt qu'une
// commande dédiée : évite d'étendre les types `Commands` de TipTap pour un
// seul appel, utilisé au seul endroit de la barre d'outils.
export function recipeLinkContent(attrs: RecipeLinkAttrs) {
  return { type: RecipeLink.name, attrs };
}
