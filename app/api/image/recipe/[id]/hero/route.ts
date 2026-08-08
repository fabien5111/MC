// Visuel d'en-tête d'une recette, servi en binaire depuis la data-URL stockée
// en base. La fiche recette pointe ici (`?v=` = date de dernière modification,
// cf. `imageResponse`) au lieu d'inliner l'image dans son HTML.
//
// Lecture par le client à cookies : la RLS s'applique comme pour la page, donc
// une recette qu'on n'a pas le droit de lire ne livre pas son image.
import { createClient } from '@/lib/supabase/server';
import { decodeDataUrl, externalImageRedirect, imageResponse } from '@/lib/data-url';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .select('hero_image_url, status, is_public')
    .eq('id', id)
    .maybeSingle();

  if (error) console.error('GET /api/image/recipe/[id]/hero:', error.message);
  if (!data?.hero_image_url) return new Response('Not found', { status: 404 });

  const redirect = externalImageRedirect(data.hero_image_url);
  if (redirect) return redirect;

  const img = decodeDataUrl(data.hero_image_url);
  if (!img) return new Response('Not found', { status: 404 });
  return imageResponse(img, { shared: data.status === 'published' && data.is_public !== false });
}
