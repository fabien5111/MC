// Partage du carnet et des recettes — types et constantes purs.
//
// Deux granularités indépendantes mais cumulables (cf. CLAUDE.md « Partage
// du carnet ») :
// - `book_shares` : accès permanent à l'ensemble des recettes d'un membre
//   (`scope` = 'all' ou 'published' — au sens du statut de modération, pas de
//   `is_public` : le partage lève justement la restriction de confidentialité
//   normale pour le destinataire choisi).
// - `recipe_shares` : accès à une recette précise, quel que soit son statut.
//
// Écriture : côté client (motif `follows.ts` / `FavoriteHeart`), immédiate —
// aucune acceptation du destinataire. Le destinataire peut à tout moment
// révoquer sa propre ligne (RLS `shared_with_id = auth.uid()` en DELETE), le
// propriétaire peut révoquer les siennes.
//
// Le data-fetching (RPC/lectures, qui importe `next/headers` via
// `lib/supabase/server`) vit dans `lib/shares-data.ts`, pas ici : les
// composants client (ShareBookButton, ShareButton, MemberPicker) n'ont besoin
// que des types et de `SHARE_SCOPE_LABELS` — les regrouper dans le même
// fichier que le data-fetching ferait échouer le build du bundle client, même
// motif que `lib/ideas.ts` (pur) / `lib/ideas-data.ts` (RPC, server-only).
export type ShareScope = 'all' | 'published';
export const SHARE_SCOPE_LABELS: Record<ShareScope, string> = {
  published: 'Toutes mes recettes privées',
  all: 'Toutes mes recettes privées, brouillons compris',
};

export type Member = { id: string; full_name: string | null; avatar_url: string | null; username: string | null };

export type BookShareGiven = { scope: ShareScope; created_at: string | null; member: Member };
export type BookShareReceived = { scope: ShareScope; created_at: string | null; owner: Member };
export type RecipeShareReceived = { created_at: string | null; recipe: { id: string; title: string } | null; owner: Member };
export type RecipeShareGiven = { created_at: string | null; recipe: { id: string; title: string } | null; member: Member };

// Qui a accès à UNE recette (fiche recette, propriétaire) — union de deux
// sources : les destinataires d'un partage direct de cette recette, et ceux
// dont le partage de carnet de l'auteur couvre cette recette (portée
// « toutes », ou « publiées » si la recette l'est) — même règle que la policy
// RLS `recipes_partagees`, à tenir synchrone avec elle.
export type RecipeShareInfo = { direct: Member[]; viaBook: Member[] };
