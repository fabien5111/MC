'use client';

// Liste des articles du back-office (porté de admin-blog.html).
//
// Suppression optimiste : la liste part de `articles` (props) et se filtre
// dans un état local, sur le même motif que ProfileTabs/ImporterList — un
// article supprimé disparaît dès la fin de l'écriture, sans attendre le
// nouveau rendu serveur.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { articleStatusLabel, withBlogSchema, type ArticleStatus, type ArticleCategoryRow } from '@/lib/blog-types';
import type { ManagedArticle } from '@/lib/admin-blog';
import type { AppRole } from '@/lib/auth';

const STATUS_BADGE: Record<ArticleStatus, string> = {
  publie: 'bg-green-700 text-white',
  brouillon: 'bg-secondary text-white',
  archive: 'bg-surface-container-highest text-on-surface-variant',
};

const PILL = 'px-4 py-1.5 rounded-full text-[12.5px] font-semibold transition-all';
const PILL_ON = `${PILL} bg-primary text-on-primary`;
const PILL_OFF = `${PILL} border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary`;

const STATUS_FILTERS: { key: 'all' | ArticleStatus; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'publie', label: 'Publiés' },
  { key: 'brouillon', label: 'Brouillons' },
  { key: 'archive', label: 'Archivés' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function BlogManager({
  articles,
  categories,
  role,
}: {
  articles: ManagedArticle[];
  categories: ArticleCategoryRow[];
  role: AppRole;
}) {
  const [items, setItems] = useState(articles);
  const [status, setStatus] = useState<'all' | ArticleStatus>('all');
  const [q, setQ] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const { mutate } = useMutation();
  const dialog = useDialog();

  const names = useMemo(() => new Map(categories.map((c) => [c.slug, c.name])), [categories]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const a of items) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [items]);

  const query = q.trim().toLowerCase();
  const filtered = items.filter(
    (a) =>
      (status === 'all' || a.status === status) &&
      (!query || `${a.title} ${a.slug}`.toLowerCase().includes(query)),
  );

  async function createArticle() {
    const supabase = withBlogSchema(createClient());
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Titre et slug provisoires : `title` est NOT NULL, `slug` NOT NULL et
    // UNIQUE. Ils se réécrivent dès la première frappe dans l'éditeur (le
    // slug se dérive du titre tant qu'il n'est pas touché à la main).
    const draftSlug = `brouillon-${Date.now().toString(36)}`;
    const ok = await mutate(
      async () => {
        const { data, error } = await supabase
          .from('articles')
          .insert({
            title: '',
            slug: draftSlug,
            author_id: user.id,
            author_name: user.user_metadata?.full_name ?? null,
            status: 'brouillon',
          })
          .select('id')
          .single();
        if (error) return { error };
        window.location.href = `/admin/blog/${data.id}`;
        return { error: null };
      },
      { errorLabel: 'Création impossible', refresh: false },
    );
    if (!ok) return;
  }

  async function duplicate(a: ManagedArticle) {
    const supabase = withBlogSchema(createClient());
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: full, error: readErr } = await supabase
      .from('articles')
      .select('title, content, excerpt, cover_image_url, category, seo_title, seo_description')
      .eq('id', a.id)
      .maybeSingle();
    if (readErr || !full) {
      dialog.alert('Article introuvable : ' + (readErr?.message ?? ''));
      return;
    }
    await mutate(async () => {
      // La copie appartient à celui qui la crée, pas à l'auteur d'origine :
      // un admin qui duplique l'article d'un rédacteur récupère un brouillon
      // à lui, pas un brouillon signé par quelqu'un d'autre.
      const { data, error } = await supabase
        .from('articles')
        .insert({
          ...full,
          title: `${full.title} (copie)`,
          slug: `copie-${Date.now().toString(36)}`,
          status: 'brouillon',
          author_id: user.id,
          author_name: user.user_metadata?.full_name ?? null,
        })
        .select('id')
        .single();
      if (error) return { error };
      window.location.href = `/admin/blog/${data.id}`;
      return { error: null };
    });
  }

  async function archive(id: string) {
    await mutate(() => withBlogSchema(createClient()).from('articles').update({ status: 'archive' }).eq('id', id), {
      confirm: 'Archiver cet article ? Il ne sera plus visible dans le blog.',
      errorLabel: 'Archivage impossible',
    });
  }

  async function remove(id: string) {
    const ok = await mutate(() => withBlogSchema(createClient()).from('articles').delete().eq('id', id), {
      confirm: 'Supprimer définitivement cet article ?',
      errorLabel: 'Suppression impossible',
      refresh: false,
    });
    if (ok) setItems((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <main className="flex-1 p-margin-mobile md:p-margin-desktop space-y-8 max-w-[1400px] w-full">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline mb-3">Blog</p>
          <h1 className="font-headline-lg font-bold text-[30px] md:text-[38px] leading-tight text-primary">
            Articles
          </h1>
        </div>
        <button
          type="button"
          onClick={createArticle}
          className="flex items-center gap-1 bg-primary text-on-primary pl-3 pr-4 py-2.5 rounded-full text-[13px] font-semibold hover:shadow-lg transition-all active:scale-95 tracking-[.05em]"
        >
          <span className="material-symbols-outlined text-[18px]">add</span> Nouvel article
        </button>
      </div>

      <div className="border-y border-outline-variant py-4 mb-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={status === f.key ? PILL_ON : PILL_OFF}
            >
              {f.label} <span className="opacity-60">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <label htmlFor="admin-blog-q" className="sr-only">
            Chercher un article
          </label>
          <input
            id="admin-blog-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Titre ou slug…"
            className="w-52 md:w-64 bg-surface-container-low border-none rounded-full pl-4 pr-10 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none"
          />
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
            search
          </span>
        </div>
      </div>

      <div className="hidden md:grid grid-cols-[minmax(0,1fr)_130px_120px_130px_40px] gap-4 px-4 pb-3">
        <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline">Article</span>
        <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline">Catégorie</span>
        <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline">Statut</span>
        <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline">Modifié</span>
        <span />
      </div>

      <div className="flex flex-col">
        {filtered.map((a) => (
          <div
            key={a.id}
            className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_130px_120px_130px_40px] gap-x-4 gap-y-2 items-center px-4 py-4 border-t border-outline-variant/60 hover:bg-surface-container-low transition-colors relative"
          >
            <div className="min-w-0">
              <Link
                href={`/admin/blog/${a.id}`}
                className="block text-[15px] font-semibold text-primary hover:text-secondary transition-colors truncate"
              >
                {a.title || 'Sans titre'}
              </Link>
              <p className="text-[12px] text-outline mt-1 truncate">
                /blog/{a.slug}
                {role === 'admin' && a.author_name ? ` · ${a.author_name}` : ''}
              </p>
            </div>
            <span className="text-[13px] text-on-surface-variant">
              {a.category ? (names.get(a.category) ?? a.category) : '—'}
            </span>
            <span>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_BADGE[a.status]}`}>
                {articleStatusLabel(a.status)}
              </span>
            </span>
            <span className="text-[13px] text-on-surface-variant">{fmtDate(a.updated_at)}</span>
            <div className="justify-self-start md:justify-self-end">
              <button
                type="button"
                onClick={() => setMenuFor(menuFor === a.id ? null : a.id)}
                title="Actions"
                className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[19px]">more_horiz</span>
              </button>
              {menuFor === a.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                  <div className="absolute right-0 top-10 z-20 bg-white border border-outline-variant rounded-lg shadow-lg py-1 w-48 text-[13.5px]">
                    <Link
                      href={`/admin/blog/${a.id}`}
                      className="flex items-center gap-2 px-4 py-2 text-on-surface hover:bg-surface-container-low"
                      onClick={() => setMenuFor(null)}
                    >
                      <span className="material-symbols-outlined text-[17px]">edit</span> Modifier
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(null);
                        duplicate(a);
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-on-surface hover:bg-surface-container-low w-full text-left"
                    >
                      <span className="material-symbols-outlined text-[17px]">content_copy</span> Dupliquer
                    </button>
                    {a.status === 'publie' && (
                      <a
                        href={`/blog/${a.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 text-on-surface hover:bg-surface-container-low"
                        onClick={() => setMenuFor(null)}
                      >
                        <span className="material-symbols-outlined text-[17px]">open_in_new</span> Voir en ligne
                      </a>
                    )}
                    {role === 'admin' && a.status !== 'archive' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuFor(null);
                          archive(a.id);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-on-surface hover:bg-surface-container-low w-full text-left"
                      >
                        <span className="material-symbols-outlined text-[17px]">archive</span> Archiver
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMenuFor(null);
                        remove(a.id);
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-error hover:bg-surface-container-low w-full text-left"
                    >
                      <span className="material-symbols-outlined text-[17px]">delete</span> Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-[14px] text-on-surface-variant italic py-16 text-center">
          Aucun article pour ce filtre.
        </p>
      )}

      <p className="text-[13px] text-on-surface-variant mt-12 pt-6 border-t border-outline-variant/60 max-w-[70ch]">
        {role === 'admin'
          ? "Un rédacteur ne voit dans cette liste que ses propres articles ; l'archivage est réservé à l'administrateur."
          : "Vous ne voyez ici que vos propres articles. L'archivage est réservé à l'administrateur."}
      </p>
    </main>
  );
}
