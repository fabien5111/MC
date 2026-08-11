'use client';

// Éditeur d'article (porté de admin-blog-editeur.html).
//
// Choix structurants, repris du handoff :
// - Le contenu est un document ProseMirror (TipTap) stocké en `jsonb`, pas du
//   HTML ni du Markdown : c'est ce qui permet au bloc « renvoi vers une
//   recette » d'être un nœud typé (`recipeId`) plutôt qu'un lien saisi à la
//   main, et au sommaire public de se construire depuis l'arbre.
// - Le slug se dérive du titre tant qu'il n'a pas été modifié à la main, puis
//   se verrouille dès la première publication (`published_at` posé une fois
//   pour toutes par le trigger SQL).
// - L'enregistrement automatique (20 s + 3 s après une pause de frappe) ne
//   s'applique qu'au brouillon ; un article publié n'est modifié que par une
//   action explicite (« Mettre à jour »).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TiptapLink from '@tiptap/extension-link';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { createClient } from '@/lib/supabase/client';
import { useDialog } from '@/components/Dialog';
import { ImageSlot } from '@/components/ImageSlot';
import { isAcceptedImage, resizeImageToDataUrl } from '@/lib/images';
import { withBlogSchema, articleStatusLabel, type ArticleStatus, type ArticleCategoryRow } from '@/lib/blog-types';
import { asDoc, hasContent, wordCount, readingMinutes, type ProseDoc } from '@/lib/blog-content';
import { Image as EditorImage, RecipeLink, recipeLinkContent } from '@/lib/blog-editor-extensions';
import type { ArticleRow } from '@/lib/blog-types';

const STATUS_BADGE: Record<ArticleStatus, string> = {
  publie: 'bg-green-700 text-white',
  brouillon: 'bg-secondary text-white',
  archive: 'bg-surface-container-highest text-on-surface-variant',
};

// Même motif que CreerForm/RelectureEditor/ListsManager (slugs de tags,
// ingrédients, référentiels…) — pour rester cohérent avec le reste du site.
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 80);
}

// Sujets bloquants à la publication, dans l'ordre du panneau où on les corrige.
function missingFields(state: {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  cover: string | null;
  doc: ProseDoc;
}): string[] {
  const out: string[] = [];
  if (!state.title.trim()) out.push('le titre');
  if (!state.slug.trim()) out.push('le slug');
  if (!state.excerpt.trim()) out.push("l'extrait");
  if (!state.category) out.push('la catégorie');
  if (!state.cover) out.push("l'image de couverture");
  if (!hasContent(state.doc)) out.push('au moins un bloc de contenu');
  return out;
}

function publishWarnings(state: { seoTitle: string; excerpt: string; seoDescription: string; doc: ProseDoc }): string[] {
  const out: string[] = [];
  const effectiveTitle = state.seoTitle.trim();
  const effectiveDesc = state.seoDescription.trim() || state.excerpt.trim();
  if (effectiveTitle && effectiveTitle.length > 60) out.push('Le titre SEO dépasse 60 caractères.');
  if (effectiveDesc && effectiveDesc.length > 155) out.push('La méta-description dépasse 155 caractères.');
  const withoutAlt = (state.doc.content ?? []).filter(
    (n) => n.type === 'image' && !String(n.attrs?.alt ?? '').trim(),
  ).length;
  if (withoutAlt > 0) out.push(`${withoutAlt} image${withoutAlt > 1 ? 's' : ''} sans texte alternatif.`);
  return out;
}

export function BlogEditor({
  article,
  categories,
  isFullAdmin,
}: {
  article: ArticleRow;
  categories: ArticleCategoryRow[];
  isFullAdmin: boolean;
}) {
  const dialog = useDialog();
  const supabase = useMemo(() => withBlogSchema(createClient()), []);

  const [title, setTitle] = useState(article.title);
  const [slug, setSlug] = useState(article.slug);
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState<ArticleStatus>(article.status);
  const [category, setCategory] = useState(article.category ?? '');
  const [excerpt, setExcerpt] = useState(article.excerpt ?? '');
  const [cover, setCover] = useState<string | null>(article.cover_image_url);
  const [seoTitleField, setSeoTitleField] = useState(article.seo_title ?? '');
  const [seoDescField, setSeoDescField] = useState(article.seo_description ?? '');

  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const dirtyRef = useRef(false);

  // Verrouillé dès la première publication, y compris si l'article est
  // ensuite archivé — `published_at` n'est jamais réécrit par la suite.
  const slugLocked = article.published_at != null;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder: 'Commencez à écrire…' }),
      TiptapLink.configure({ openOnClick: false, autolink: true }),
      EditorImage,
      RecipeLink,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    // `ProseDoc` (lib/blog-content.ts) est un typage délibérément plus large
    // que `JSONContent` de TipTap — il couvre le document tel qu'il ressort
    // brut d'une colonne `jsonb` — d'où le passage par `unknown`.
    content: asDoc(article.content) as unknown as JSONContent,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'max-w-[68ch]' },
    },
    onUpdate: () => markDirty(),
  });

  const [docStats, setDocStats] = useState(() => {
    const doc = asDoc(article.content);
    return { words: wordCount(doc), minutes: readingMinutes(doc) };
  });

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const doc = editor.getJSON() as ProseDoc;
      setDocStats({ words: wordCount(doc), minutes: readingMinutes(doc) });
    };
    editor.on('update', update);
    return () => {
      editor.off('update', update);
    };
  }, [editor]);

  // `save` change d'identité à chaque frappe (elle capture title/slug/...) ;
  // la lire via une ref plutôt que comme dépendance évite de recréer le
  // minuteur de débounce à chaque caractère tapé, ce qui l'empêcherait de
  // jamais aboutir.
  const statusRef = useRef(status);
  const saveRef = useRef<(next?: ArticleStatus) => Promise<boolean>>(async () => false);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Deux déclencheurs distincts, comme spécifié : une pause de frappe de 3 s
  // (le cas courant — la plupart des saisies ont une pause avant la
  // suivante), et un plancher de 20 s qui garantit un enregistrement même
  // sous frappe continue, où le débounce ne se déclencherait jamais seul.
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    if (statusRef.current !== 'brouillon') return;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => void saveRef.current(), 3000);
  }, []);

  function onTitleChange(value: string) {
    setTitle(value);
    // Dérivation continue tant que le slug n'a pas été touché à la main —
    // à l'arrêt dès qu'il l'a été, même en repassant par un titre vide.
    if (!slugTouched && !slugLocked) setSlug(slugify(value));
    markDirty();
  }

  function onSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(slugify(value));
    markDirty();
  }

  // ── Enregistrement ────────────────────────────────────────────────────
  //
  // `statusOverride` porte le statut à écrire quand on en change dans le même
  // geste (`requestStatusChange`, ci-dessous) : lire `status` depuis l'état
  // React à cet instant serait la valeur d'AVANT le changement (`setStatus`
  // est asynchrone). L'enregistrement automatique et le bouton « Enregistrer »
  // appellent `save()` sans argument : ils écrivent alors le statut déjà en
  // place, sans le modifier.
  const save = useCallback(
    async (statusOverride?: ArticleStatus) => {
      if (!editor) return false;
      const statusToWrite = statusOverride ?? status;
      setSaving(true);
      const { error } = await supabase
        .from('articles')
        .update({
          title,
          slug,
          status: statusToWrite,
          category: category || null,
          excerpt: excerpt || null,
          cover_image_url: cover,
          seo_title: seoTitleField || null,
          seo_description: seoDescField || null,
          content: editor.getJSON() as ProseDoc,
        })
        .eq('id', article.id);
      setSaving(false);
      if (error) {
        dialog.alert('Enregistrement impossible : ' + error.message);
        return false;
      }
      dirtyRef.current = false;
      setLastSavedAt(Date.now());
      if (statusOverride) setStatus(statusOverride);
      // Les lectures publiques sont mises en cache 60 s (cf. lib/blog.ts) :
      // sans cet appel, une publication resterait invisible sur /blog jusqu'à
      // expiration du cache. Best-effort — une invalidation manquée n'est
      // jamais bloquante, le cache expire de toute façon.
      fetch('/api/admin/blog/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      }).catch(() => {});
      return true;
    },
    [editor, supabase, article.id, title, slug, status, category, excerpt, cover, seoTitleField, seoDescField, dialog],
  );

  // Unique point de passage pour tout changement de statut (sélecteur du
  // panneau, bouton principal, archivage) : la validation de publication
  // s'applique quelle que soit la façon dont on y arrive.
  async function requestStatusChange(next: ArticleStatus): Promise<boolean> {
    if (!editor) return false;
    if (next === status) return true;
    if (next === 'publie') {
      const doc = editor.getJSON() as ProseDoc;
      const missing = missingFields({ title, slug, excerpt, category, cover, doc });
      if (missing.length) {
        dialog.alert('Impossible de publier : il manque ' + missing.join(', ') + '.');
        return false;
      }
      const warnings = publishWarnings({ seoTitle: seoTitleField, excerpt, seoDescription: seoDescField, doc });
      if (warnings.length && !(await dialog.confirm(warnings.join('\n') + '\n\nPublier quand même ?'))) {
        return false;
      }
    }
    if (next === 'archive') {
      const ok = await dialog.confirm('Archiver cet article ? Il ne sera plus visible dans le blog.');
      if (!ok) return false;
    }
    return save(next);
  }

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Plancher de 20 s : garantit un enregistrement même sous frappe continue,
  // où le débounce de `markDirty` ne trouverait jamais de pause pour se
  // déclencher seul.
  useEffect(() => {
    if (status !== 'brouillon') return;
    const id = setInterval(() => {
      if (dirtyRef.current) void save();
    }, 20000);
    return () => clearInterval(id);
  }, [status, save]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  async function handlePrimary() {
    // Déjà publié : le bouton devient « Mettre à jour », un enregistrement
    // simple, sans repasser par la validation de publication.
    if (status === 'publie') {
      await save();
      return;
    }
    await requestStatusChange('publie');
  }

  // ── Barre d'outils ────────────────────────────────────────────────────
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [recipePickerOpen, setRecipePickerOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function openLinkPopover() {
    if (!editor) return;
    setLinkUrl(editor.getAttributes('link').href ?? '');
    setLinkOpen(true);
  }

  function applyLink() {
    if (!editor) return;
    const url = linkUrl.trim();
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    else editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
  }

  async function insertImage(file: File) {
    if (!editor) return;
    if (!isAcceptedImage(file)) {
      dialog.alert('Format non supporté (PNG, JPEG, WebP ou AVIF).');
      return;
    }
    const dataUrl = await resizeImageToDataUrl(file, 1400, 'image/webp');
    editor.chain().focus().insertContent({ type: 'image', attrs: { src: dataUrl, alt: '', caption: '' } }).run();
    markDirty();
  }

  const selectedImageAttrs = editor?.isActive('image') ? editor.getAttributes('image') : null;

  const savedLabel = (() => {
    if (status !== 'brouillon') return null;
    if (saving) return 'Enregistrement…';
    if (!lastSavedAt) return null;
    const s = Math.max(0, Math.round((now - lastSavedAt) / 1000));
    if (s < 60) return `Enregistré automatiquement il y a ${s} s`;
    return `Enregistré automatiquement il y a ${Math.round(s / 60)} min`;
  })();

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-surface/90 backdrop-blur-md border-b border-outline-variant sticky top-0 z-50">
        <div className="max-w-[1280px] mx-auto flex items-center gap-4 px-4 md:px-8 py-3">
          <Link
            href="/admin/blog"
            className="flex items-center gap-1 text-[13px] font-semibold text-on-surface-variant hover:text-primary transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-[19px]">arrow_back</span>{' '}
            <span className="hidden sm:inline">Articles</span>
          </Link>
          <span className="hidden md:flex items-center gap-2 text-[12.5px] text-outline min-w-0">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 ${STATUS_BADGE[status]}`}>
              {articleStatusLabel(status)}
            </span>
            {savedLabel && <span className="truncate">{savedLabel}</span>}
          </span>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <a
              href={`/blog/${article.slug}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-full text-[13px] font-semibold border border-outline-variant text-primary hover:bg-surface-container transition-colors"
            >
              Prévisualiser
            </a>
            <button
              type="button"
              onClick={() => save()}
              disabled={saving}
              className="px-4 py-2 rounded-full text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors hidden sm:block disabled:opacity-50"
            >
              Enregistrer
            </button>
            {isFullAdmin && status !== 'archive' && (
              <button
                type="button"
                onClick={() => requestStatusChange('archive')}
                className="px-4 py-2 rounded-full text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors hidden md:block"
              >
                Archiver
              </button>
            )}
            <button
              type="button"
              onClick={handlePrimary}
              disabled={saving}
              className="bg-primary text-on-primary px-5 py-2 rounded-full text-[13px] font-semibold hover:shadow-lg transition-all active:scale-95 tracking-[.05em] disabled:opacity-60"
            >
              {status === 'publie' ? 'Mettre à jour' : 'Publier'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1280px] mx-auto px-4 md:px-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-10 pb-32 pt-8">
        {/* Colonne rédaction */}
        <main className="min-w-0">
          <ImageSlot
            src={cover}
            onChange={(dataUrl) => {
              setCover(dataUrl);
              markDirty();
            }}
            onClear={() => {
              setCover(null);
              markDirty();
            }}
            aspectRatio={2.4}
            maxWidth={1600}
            mime="image/webp"
            placeholder="Déposer l'image d'en-tête (ratio 2,4/1)"
            editTitle="Changer l'image de couverture"
            className="mb-8 border border-outline-variant"
            style={{ aspectRatio: '2.4/1' }}
          />

          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Titre de l'article"
            className="w-full bg-transparent border-none outline-none font-headline-lg font-bold text-[32px] md:text-[40px] leading-tight text-primary placeholder:text-outline-variant"
          />

          <div className="flex items-center gap-2 mt-3 mb-8 text-[13px] text-outline">
            <span className="material-symbols-outlined text-[17px]">link</span>
            <span>/blog/</span>
            {slugLocked ? (
              <span
                className="text-on-surface-variant font-medium min-w-0 flex-1 truncate"
                title="Verrouillé : cet article a déjà été publié. Le modifier casserait les liens existants."
              >
                {slug}
              </span>
            ) : (
              <input
                value={slug}
                onChange={(e) => onSlugChange(e.target.value)}
                className="bg-transparent border-none outline-none text-on-surface-variant font-medium min-w-0 flex-1 focus:text-primary"
              />
            )}
          </div>

          <div className="sticky top-[65px] z-40 bg-surface-container-low border border-outline-variant rounded-full px-2 py-1.5 flex items-center gap-0.5 flex-wrap mb-6">
            <ToolbarButton title="Titre 2" active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
              <span className="text-[13px] font-bold">H2</span>
            </ToolbarButton>
            <ToolbarButton title="Titre 3" active={editor?.isActive('heading', { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
              <span className="text-[13px] font-bold">H3</span>
            </ToolbarButton>
            <Sep />
            <ToolbarButton title="Gras" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>
              <span className="material-symbols-outlined text-[19px]">format_bold</span>
            </ToolbarButton>
            <ToolbarButton title="Italique" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>
              <span className="material-symbols-outlined text-[19px]">format_italic</span>
            </ToolbarButton>
            <div className="relative">
              <ToolbarButton title="Lien" active={editor?.isActive('link')} onClick={openLinkPopover}>
                <span className="material-symbols-outlined text-[19px]">link</span>
              </ToolbarButton>
              {linkOpen && (
                <div className="absolute top-10 left-0 z-30 bg-white border border-outline-variant rounded-lg shadow-lg p-2 flex items-center gap-2 w-64">
                  <input
                    autoFocus
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyLink();
                      if (e.key === 'Escape') setLinkOpen(false);
                    }}
                    placeholder="https://…"
                    className="flex-1 min-w-0 border border-outline-variant rounded px-2 py-1 text-[13px] outline-none focus:border-primary"
                  />
                  <button type="button" onClick={applyLink} className="text-primary shrink-0" title="Valider">
                    <span className="material-symbols-outlined text-[19px]">check</span>
                  </button>
                </div>
              )}
            </div>
            <Sep />
            <ToolbarButton title="Liste à puces" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
              <span className="material-symbols-outlined text-[19px]">format_list_bulleted</span>
            </ToolbarButton>
            <ToolbarButton title="Citation" active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
              <span className="material-symbols-outlined text-[19px]">format_quote</span>
            </ToolbarButton>
            <ToolbarButton
              title="Tableau"
              onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            >
              <span className="material-symbols-outlined text-[19px]">table</span>
            </ToolbarButton>
            <Sep />
            <ToolbarButton title="Insérer une image" onClick={() => imageInputRef.current?.click()}>
              <span className="material-symbols-outlined text-[19px]">image</span>
            </ToolbarButton>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void insertImage(file);
                e.target.value = '';
              }}
            />
            <ToolbarButton title="Insérer une recette du site" onClick={() => setRecipePickerOpen(true)}>
              <span className="material-symbols-outlined text-[19px]">menu_book</span>
            </ToolbarButton>
            <span className="ml-auto text-[11.5px] text-outline pr-2 hidden sm:block">
              {docStats.words} mot{docStats.words !== 1 ? 's' : ''} · {docStats.minutes} min
            </span>
          </div>

          {selectedImageAttrs && (
            <div className="max-w-[68ch] -mt-4 mb-4 bg-surface-container-low border border-outline-variant rounded-lg p-3 flex flex-col gap-2 text-[12.5px]">
              <label className="flex items-center gap-2">
                <span className="text-on-surface-variant shrink-0 w-28">Légende</span>
                <input
                  value={String(selectedImageAttrs.caption ?? '')}
                  onChange={(e) => editor?.chain().focus().updateAttributes('image', { caption: e.target.value }).run()}
                  className="flex-1 bg-white border border-outline-variant rounded px-2 py-1 outline-none focus:border-primary"
                  placeholder="Légende (facultative)"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-on-surface-variant shrink-0 w-28">Texte alternatif</span>
                <input
                  value={String(selectedImageAttrs.alt ?? '')}
                  onChange={(e) => editor?.chain().focus().updateAttributes('image', { alt: e.target.value }).run()}
                  className="flex-1 bg-white border border-outline-variant rounded px-2 py-1 outline-none focus:border-primary"
                  placeholder="Décrit l'image pour l'accessibilité et le référencement"
                />
              </label>
            </div>
          )}

          <div className="blog-ed">
            <EditorContent editor={editor} />
          </div>

          <button
            type="button"
            onClick={() => editor?.chain().focus('end').insertContent({ type: 'paragraph' }).run()}
            className="flex items-center gap-2 text-[13px] font-semibold text-on-surface-variant hover:text-primary transition-colors mt-6 px-1"
          >
            <span className="material-symbols-outlined text-[20px]">add_circle</span> Ajouter un bloc
          </button>
        </main>

        {/* Panneau latéral */}
        <aside className="lg:sticky lg:top-[90px] lg:self-start flex flex-col gap-5">
          <section className="bg-white border border-outline-variant p-5 rounded-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline mb-4">Publication</p>
            <label className="block text-[12.5px] font-semibold text-on-surface-variant mb-1.5">Statut</label>
            <select
              value={status}
              onChange={(e) => void requestStatusChange(e.target.value as ArticleStatus)}
              className="w-full bg-white border border-outline-variant rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-primary mb-4"
            >
              <option value="brouillon">Brouillon</option>
              <option value="publie">Publié</option>
              {isFullAdmin && <option value="archive">Archivé</option>}
            </select>

            <label className="block text-[12.5px] font-semibold text-on-surface-variant mb-1.5">Catégorie</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                markDirty();
              }}
              className="w-full bg-white border border-outline-variant rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-primary mb-4"
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>

            <label className="block text-[12.5px] font-semibold text-on-surface-variant mb-1.5">Auteur</label>
            <p className="text-[13.5px] text-on-surface-variant">{article.author_name || '—'}</p>
          </section>

          <section className="bg-white border border-outline-variant p-5 rounded-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline mb-4">Extrait</p>
            <textarea
              value={excerpt}
              onChange={(e) => {
                setExcerpt(e.target.value.slice(0, 200));
                markDirty();
              }}
              rows={4}
              maxLength={200}
              placeholder="Résumé affiché sur la page du blog"
              className="w-full resize-none bg-white border border-outline-variant rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-primary"
            />
            <p className="text-[11.5px] text-outline mt-2">{excerpt.length} / 200 caractères</p>
          </section>

          <section className="bg-white border border-outline-variant p-5 rounded-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline mb-4">Référencement</p>

            <label className="block text-[12.5px] font-semibold text-on-surface-variant mb-1.5">Titre SEO</label>
            <input
              value={seoTitleField}
              onChange={(e) => {
                setSeoTitleField(e.target.value);
                markDirty();
              }}
              placeholder={title || 'Titre de l’article'}
              className="w-full bg-white border border-outline-variant rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-primary mb-1"
            />
            <p className={`text-[11.5px] mb-4 ${seoTitleField.length > 60 ? 'text-error' : 'text-outline'}`}>
              {seoTitleField.length} / 60 caractères conseillés
            </p>

            <label className="block text-[12.5px] font-semibold text-on-surface-variant mb-1.5">Méta-description</label>
            <textarea
              value={seoDescField}
              onChange={(e) => {
                setSeoDescField(e.target.value);
                markDirty();
              }}
              rows={3}
              placeholder={excerpt || 'Extrait de l’article'}
              className="w-full resize-none bg-white border border-outline-variant rounded-xl px-3.5 py-2.5 text-[14px] outline-none focus:border-primary mb-1"
            />
            <p className={`text-[11.5px] mb-4 ${seoDescField.length > 155 ? 'text-error' : 'text-outline'}`}>
              {seoDescField.length} / 155 caractères conseillés
            </p>

            <div className="bg-surface-container-low p-3 rounded-lg">
              <p className="text-[11px] text-outline mb-1">jepatisse.fr › blog › {slug || '…'}</p>
              <p className="text-[14px] text-primary font-medium leading-snug">
                {seoTitleField.trim() || title || 'Titre de l’article'}
              </p>
              <p className="text-[12px] text-on-surface-variant leading-snug mt-0.5">
                {seoDescField.trim() || excerpt || 'Extrait de l’article'}
              </p>
            </div>
          </section>

          <p className="text-[12.5px] text-on-surface-variant leading-relaxed px-1">
            Le sommaire de l&apos;article est généré à la lecture depuis les H2 et H3 : rien à saisir ici.
          </p>
        </aside>
      </div>

      {recipePickerOpen && editor && (
        <RecipePickerDialog
          onClose={() => setRecipePickerOpen(false)}
          onSelect={(item) => {
            editor.chain().focus().insertContent(recipeLinkContent({ recipeId: item.id, title: item.title })).run();
            setRecipePickerOpen(false);
            markDirty();
          }}
        />
      )}
    </div>
  );
}

function Sep() {
  return <span className="w-px h-5 bg-outline-variant mx-1.5" />;
}

function ToolbarButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
        active ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'
      }`}
    >
      {children}
    </button>
  );
}

// ── Sélecteur de recette (pour le bloc « renvoi vers une recette ») ────────
type PickerItem = { id: string; title: string };

function RecipePickerDialog({ onClose, onSelect }: { onClose: () => void; onSelect: (item: PickerItem) => void }) {
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ scopes: 'all,mine', limit: '20' });
        if (term.trim()) params.set('q', term.trim());
        const res = await fetch(`/api/recipes/picker?${params}`, { signal: controller.signal });
        const data = await res.json();
        setItems((data.items ?? []).map((r: { id: string; title: string }) => ({ id: r.id, title: r.title })));
      } catch {
        // AbortError attendu sur frappe rapide — la requête suivante prend le relais.
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [term]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-outline-variant">
          <p className="text-[15px] font-semibold text-primary mb-3">Insérer une recette</p>
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Rechercher une recette…"
            className="w-full border border-outline-variant rounded-full px-4 py-2 text-[13px] outline-none focus:border-primary"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {loading && <p className="text-[13px] text-on-surface-variant p-4">Recherche…</p>}
          {!loading && items.length === 0 && (
            <p className="text-[13px] text-on-surface-variant p-4">Aucune recette trouvée.</p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="w-full text-left px-4 py-3 border-b border-outline-variant/50 hover:bg-surface-container-low text-[14px] text-on-surface transition-colors"
            >
              {item.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
