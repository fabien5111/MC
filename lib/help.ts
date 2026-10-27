// Aide contextuelle — accès données (server-only, `next/headers` via
// lib/supabase/server). Les blocs (clé, page, emplacement) sont déclarés
// dans lib/help-blocks.ts (module pur) ; ce fichier ne fait que les
// hydrater avec leur contenu (`help_blocks`) et, côté membre, avec ses
// masquages (`help_dismissals`).
import { createClient } from '@/lib/supabase/server';
import { getHelpBlocksReference } from '@/lib/data/reference';
import { helpBlocksForPage, type HelpPageSlug } from '@/lib/help-blocks';

export type VisibleHelpBlock = {
  key: string;
  text: string | null;
  videoUrl: string | null;
  showText: boolean;
  showVideo: boolean;
};

// Blocs de plusieurs pages d'aide prêts à afficher à l'utilisateur courant, en
// UNE lecture de masquages : une page serveur qui héberge des emplacements de
// deux pages d'aide (la fiche recette : « fournee » et « recette ») ne paie
// qu'une requête. Contenu renseigné, et ni le bloc, ni la vidéo, ni la page
// entière masqués.
// `userId` null (visiteur non connecté) → aucun bloc et aucune lecture : l'aide
// est réservée aux membres (JEP-373). Le contenu vient du cache des
// référentiels ; seuls les masquages du membre sont lus par requête.
export async function getVisibleHelpBlocksForPages(
  pages: HelpPageSlug[],
  userId: string | null,
): Promise<Record<string, VisibleHelpBlock[]>> {
  const vide = Object.fromEntries(pages.map((p) => [p, [] as VisibleHelpBlock[]]));
  if (!userId) return vide;
  const defs = pages.flatMap((p) => helpBlocksForPage(p));
  if (defs.length === 0) return vide;
  const cibles = [...defs.map((d) => d.key), ...pages];

  const [contentRows, dismissalsRes] = await Promise.all([
    getHelpBlocksReference(),
    (await createClient()).from('help_dismissals').select('kind, target').eq('user_id', userId).in('target', cibles),
  ]);
  if (dismissalsRes.error) console.error('getVisibleHelpBlocks:', dismissalsRes.error.message);
  const dismissals = dismissalsRes.data ?? [];
  const contentByKey = Object.fromEntries(contentRows.map((c) => [c.key, c]));

  return Object.fromEntries(
    pages.map((page) => {
      // Masquage de toute l'aide de la page : rien à afficher.
      if (dismissals.some((d) => d.kind === 'page' && d.target === page)) return [page, []];
      const blocs = helpBlocksForPage(page)
        .map((def) => {
          const content = contentByKey[def.key];
          const blockDismissed = dismissals.some((d) => d.kind === 'block' && d.target === def.key);
          const videoDismissed = dismissals.some((d) => d.kind === 'video' && d.target === def.key);
          return {
            key: def.key,
            text: content?.text ?? null,
            videoUrl: content?.video_url ?? null,
            showText: !blockDismissed && !!content?.text,
            showVideo: !blockDismissed && !videoDismissed && !!content?.video_url,
          };
        })
        .filter((b) => b.showText || b.showVideo);
      return [page, blocs];
    }),
  );
}

// Blocs d'une seule page — voir `getVisibleHelpBlocksForPages`.
export async function getVisibleHelpBlocks(page: HelpPageSlug, userId: string | null): Promise<VisibleHelpBlock[]> {
  return (await getVisibleHelpBlocksForPages([page], userId))[page] ?? [];
}

// Contenu brut d'une page, sans filtrage par masquage — consommé par l'admin,
// qui doit voir/éditer un bloc même vide ou masqué par les membres.
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
