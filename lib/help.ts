// Aide contextuelle — accès données (server-only, `next/headers` via
// lib/supabase/server). Les blocs (clé, page, emplacement) sont déclarés
// dans lib/help-blocks.ts (module pur) ; ce fichier ne fait que les
// hydrater avec leur contenu (`help_blocks`).
//
// Plus aucun masquage par le membre (JEP-391) : l'aide n'est plus qu'un picto
// « ? » qui ouvre une fenêtre, elle ne prend plus de place à masquer. La table
// `help_dismissals` reste en base, ni lue ni écrite.
import { createClient } from '@/lib/supabase/server';
import { getHelpBlocksReference } from '@/lib/data/reference';
import { helpBlocksForPage, type HelpPageSlug } from '@/lib/help-blocks';

export type VisibleHelpBlock = {
  key: string;
  // Titre de la fenêtre (le même que sur la page Aide).
  title: string;
  text: string | null;
  videoUrl: string | null;
};

// Blocs de plusieurs pages d'aide prêts à afficher : ceux dont le contenu est
// renseigné (texte ou vidéo).
// `userId` null (visiteur non connecté) → aucun bloc : l'aide contextuelle est
// réservée aux membres (JEP-373). Le contenu vient du cache des référentiels :
// aucune requête par rendu.
export async function getVisibleHelpBlocksForPages(
  pages: HelpPageSlug[],
  userId: string | null,
): Promise<Record<string, VisibleHelpBlock[]>> {
  const vide = Object.fromEntries(pages.map((p) => [p, [] as VisibleHelpBlock[]]));
  if (!userId) return vide;
  if (pages.every((p) => helpBlocksForPage(p).length === 0)) return vide;

  const contentRows = await getHelpBlocksReference();
  const contentByKey = Object.fromEntries(contentRows.map((c) => [c.key, c]));

  return Object.fromEntries(
    pages.map((page) => {
      const blocs = helpBlocksForPage(page)
        .map((def) => {
          const content = contentByKey[def.key];
          return {
            key: def.key,
            title: def.title,
            text: content?.text?.trim() || null,
            videoUrl: content?.video_url || null,
          };
        })
        .filter((b) => b.text || b.videoUrl);
      return [page, blocs];
    }),
  );
}

// Blocs d'une seule page — voir `getVisibleHelpBlocksForPages`.
export async function getVisibleHelpBlocks(page: HelpPageSlug, userId: string | null): Promise<VisibleHelpBlock[]> {
  return (await getVisibleHelpBlocksForPages([page], userId))[page] ?? [];
}

// Contenu brut d'une page — consommé par l'admin, qui doit voir/éditer un bloc
// même vide.
export async function getHelpBlocksContent(
  page: HelpPageSlug,
): Promise<Record<string, { text: string | null; videoUrl: string | null }>> {
  const keys = helpBlocksForPage(page).map((d) => d.key);
  if (keys.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.from('help_blocks').select('key, text, video_url').in('key', keys);
  if (error) {
    console.error('getHelpBlocksContent:', error.message);
    return {};
  }
  return Object.fromEntries((data ?? []).map((r) => [r.key, { text: r.text, videoUrl: r.video_url }]));
}
