// Photo d'une étape de recette, servie en binaire depuis la data-URL stockée
// en base — même principe que le visuel d'en-tête (voir
// app/api/image/recipe/[id]/hero/route.ts).
//
// L'URL n'a pas besoin de version : `CreerForm` supprime et réinsère toutes
// les étapes à chaque enregistrement, donc une photo modifiée arrive avec un
// nouvel `id` (cf. CLAUDE.md « Recettes planifiées », qui documente ce
// delete + insert). L'`id` fait donc office de version.
//
// La recette parente est jointe en `!inner` pour deux raisons : classer la
// réponse (cachable par un CDN ou non), et ne rien servir dont la recette
// elle-même n'est pas lisible.
import { createClient } from '@/lib/supabase/server';
import { decodeDataUrl, externalImageRedirect, imageResponse } from '@/lib/data-url';

type Row = {
  url: string | null;
  recipe_steps: { recipes: { status: string | null; is_public: boolean | null } | null } | null;
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photoId = Number(id);
  if (!Number.isInteger(photoId)) return new Response('Not found', { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('step_photos')
    .select('url, recipe_steps!inner(recipes!inner(status, is_public))')
    .eq('id', photoId)
    .maybeSingle();

  if (error) console.error('GET /api/image/step-photo/[id]:', error.message);
  const row = (data as unknown as Row | null) ?? null;
  if (!row?.url) return new Response('Not found', { status: 404 });

  const redirect = externalImageRedirect(row.url);
  if (redirect) return redirect;

  const img = decodeDataUrl(row.url);
  if (!img) return new Response('Not found', { status: 404 });
  // Recette parente illisible pour une raison inattendue : on ne suppose pas
  // qu'elle est publique — le cache reste privé.
  const recipe = row.recipe_steps?.recipes ?? null;
  return imageResponse(img, { shared: recipe?.status === 'published' && recipe.is_public !== false });
}
