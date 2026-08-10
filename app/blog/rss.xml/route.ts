// Flux RSS du blog — `/blog/rss.xml`.
//
// Route Handler plutôt que fichier statique : le contenu dépend des articles
// publiés, lus via la même couche mise en cache que `/blog` (`lib/blog.ts`,
// `revalidate: 60`) — pas de nouvelle source de vérité à maintenir.
import { getSitemapArticles, getArticle } from '@/lib/blog';
import { siteUrl } from '@/lib/site-url';

// Pas de `revalidate` ici : ça ferait de cette route un candidat à la
// génération statique (ISR), exécutée dès `next build` — où les variables
// Supabase peuvent ne pas être posées (poste sans `.env.local`, CI sans
// secrets). La fraîcheur de 60 s est déjà assurée par le cache de
// `lib/blog.ts` ; cette route reste simplement dynamique, par requête.
export const dynamic = 'force-dynamic';

// Échappement XML minimal (titre, extrait) — le contenu du corps n'est pas
// repris dans le flux (voir plus bas), seuls des champs texte courts le sont.
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MAX_ITEMS = 30;

export async function GET() {
  const base = siteUrl();
  const articles = (await getSitemapArticles()).slice(0, MAX_ITEMS);

  // L'extrait suffit au flux (RSS n'est pas la lecture principale visée par
  // le handoff — « le flux RSS suffit dans un premier temps », en lieu d'une
  // newsletter) ; il évite de resservir tout le corps, potentiellement lourd
  // avec ses images en data-URL, dans chaque `<item>`.
  const items = await Promise.all(
    articles.map(async (a) => {
      const full = await getArticle(a.slug);
      if (!full) return null;
      const url = `${base}/blog/${a.slug}`;
      return `  <item>
    <title>${esc(full.title)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <pubDate>${new Date(full.published_at ?? full.created_at).toUTCString()}</pubDate>
    ${full.excerpt ? `<description>${esc(full.excerpt)}</description>` : ''}
  </item>`;
    }),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Le blog — Je pâtisse !</title>
  <link>${base}/blog</link>
  <description>Des articles de fond sur la technique et les ingrédients, et les modes d'emploi du site.</description>
  <language>fr</language>
${items.filter(Boolean).join('\n')}
</channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
