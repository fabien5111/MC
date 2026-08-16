// Aide contextuelle — accès données (server-only, `next/headers` via
// lib/supabase/server). Les blocs (clé, page, emplacement) sont déclarés
// dans lib/help-blocks.ts (module pur) ; ce fichier ne fait que les
// hydrater avec leur contenu (`help_blocks`) et, côté membre, avec ses
// masquages (`help_dismissals`).
import { createClient } from '@/lib/supabase/server';
import { helpBlocksForPage, type HelpPageSlug } from '@/lib/help-blocks';

export type VisibleHelpBlock = {
  key: string;
  text: string | null;
  videoUrl: string | null;
  showText: boolean;
  showVideo: boolean;
};

// Blocs d'une page prêts à afficher à l'utilisateur courant : contenu
// renseigné, et ni le bloc, ni la vidéo, ni la page entière masqués.
// `userId` null → aucun masquage pris en compte (utilisé côté admin, où
// seul le contenu compte, pas ce que les membres ont masqué).
export async function getVisibleHelpBlocks(page: HelpPageSlug, userId: string | null): Promise<VisibleHelpBlock[]> {
  const defs = helpBlocksForPage(page);
  if (defs.length === 0) return [];
  const supabase = await createClient();
  const keys = defs.map((d) => d.key);

  const [{ data: contents, error: contentsError }, dismissalsRes] = await Promise.all([
    supabase.from('help_blocks').select('key, text, video_url').in('key', keys),
    userId
      ? supabase.from('help_dismissals').select('kind, target').eq('user_id', userId).in('target', [...keys, page])
      : Promise.resolve({ data: [] as { kind: string; target: string }[], error: null }),
  ]);
  if (contentsError) console.error('getVisibleHelpBlocks:', contentsError.message);
  if (dismissalsRes.error) console.error('getVisibleHelpBlocks:', dismissalsRes.error.message);

  const dismissals = dismissalsRes.data ?? [];
  // Masquage de toute l'aide de la page : rien à afficher, inutile d'aller
  // plus loin.
  if (dismissals.some((d) => d.kind === 'page' && d.target === page)) return [];

  const contentByKey = Object.fromEntries((contents ?? []).map((c) => [c.key, c]));
  return defs
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
