'use client';

// Éditeurs des éléments de recette de la v2 du mode projet : photo d'en-tête,
// type et catégories, ustensiles, difficulté, temps, conseils et source.
//
// Ils écrivent les MÊMES colonnes et tables que l'éditeur de recette
// (`CreerForm`), section par section — jamais par son enregistrement global,
// qui supprime et réinsère toutes les étapes et effacerait les
// `component_id` du projet (cf. CLAUDE.md « Dissolution assumée »). Chaque
// éditeur a son propre bouton « Enregistrer » : la saisie en cours n'est
// écrite qu'au geste, puis le parent resynchronise (`mutate`).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useDialog } from '@/components/Dialog';
import { revalidateReference } from '@/lib/revalidate-reference';
import { normLoose } from '@/lib/search-params';
import { capitalizeSentences, slugify } from '@/lib/text';
import type { useMutation } from '@/lib/use-mutation';
import { ImageSlot } from '@/components/ImageSlot';
import { resizeDataUrlToThumb } from '@/lib/images';
import { televerserImage } from '@/lib/storage-client';
import { estDataUrlImage } from '@/lib/storage';
import type { RecipeFull } from '@/lib/recipes';

type Mutate = ReturnType<typeof useMutation>['mutate'];
export type RefOption = { id: number; name: string };
export type DifficultyOption = { id: number; name: string; level: number };

const btnPrimary =
  'rounded-pill bg-primary px-6 py-3 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:opacity-40';
const champ =
  'w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 font-body-md text-[15px] outline-none focus:border-primary';
const etiquette = 'mb-1 block font-label-md text-label-md text-outline';

// Écriture d'un ensemble de colonnes de la recette du projet.
function majRecette(recipeId: string, payload: Record<string, unknown>) {
  return createClient().from('recipes').update(payload as never).eq('id', recipeId);
}

function minutes(v: string): number | null {
  const n = parseInt(v, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// ── Photo d'en-tête ─────────────────────────────────────────────────────
// Même dépôt que `CreerForm` : la photo, son original et deux vignettes
// (listes « En cuisine » ~96 px, cartes ~480 px), recalculées seulement pour
// un dépôt frais — jamais en rechargeant dans un canvas une image déjà sur le
// stockage (cf. CLAUDE.md, « Image illisible »).
export function HeroEditor({ recipe, mutate, busy }: { recipe: RecipeFull; mutate: Mutate; busy: boolean }) {
  const [hero, setHero] = useState<string | null>(recipe.hero_image_url ?? null);
  const [original, setOriginal] = useState<string | null>(recipe.hero_image_original_url ?? recipe.hero_image_url ?? null);
  const [ai, setAi] = useState(recipe.hero_image_ai_retouched);
  const modifie = hero !== (recipe.hero_image_url ?? null) || ai !== recipe.hero_image_ai_retouched;

  async function enregistrer() {
    await mutate(
      async () => {
        try {
          if (!hero) {
            return await majRecette(recipe.id, {
              hero_image_url: null,
              hero_image_original_url: null,
              hero_thumb_url: null,
              hero_card_url: null,
              hero_image_ai_retouched: false,
            });
          }
          const frais = estDataUrlImage(hero);
          const [url, originalUrl, thumb, card] = await Promise.all([
            televerserImage('recette', hero),
            televerserImage('recette', original),
            frais ? televerserImage('recette', await resizeDataUrlToThumb(hero)) : Promise.resolve(undefined),
            frais
              ? televerserImage('recette', await resizeDataUrlToThumb(hero, 480, 'image/jpeg', 0.7))
              : Promise.resolve(undefined),
          ]);
          return await majRecette(recipe.id, {
            hero_image_url: url,
            hero_image_original_url: originalUrl,
            ...(thumb !== undefined ? { hero_thumb_url: thumb } : {}),
            ...(card !== undefined ? { hero_card_url: card } : {}),
            hero_image_ai_retouched: ai,
          });
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
      },
      { errorLabel: 'Enregistrement de la photo' },
    );
  }

  return (
    <div className="space-y-3">
      <label className={etiquette}>PHOTO DU DESSERT</label>
      <div className="aspect-[16/9] w-full max-w-xl">
        <ImageSlot
          src={hero}
          originalSrc={original}
          aiRetouched={ai}
          onChange={(url) => {
            setHero(url);
            setAi(false);
          }}
          promptAiRetouched
          onAiRetouchedChange={setAi}
          onOriginalChange={setOriginal}
          onClear={() => {
            setHero(null);
            setOriginal(null);
            setAi(false);
          }}
          shape="rounded"
          maxWidth={1400}
          placeholder="Déposez la photo du dessert fini"
          className="h-full w-full"
        />
      </div>
      {modifie && (
        <button type="button" onClick={enregistrer} disabled={busy} className={btnPrimary}>
          Enregistrer la photo
        </button>
      )}
    </div>
  );
}

// ── Catégories (tags) ───────────────────────────────────────────────────
// Même principe que l'éditeur de recette (`CreerForm`) : les tags choisis
// sont des pastilles pleines qu'un clic retire, « + Ajouter un tag » ouvre une
// liste avec recherche (sans accents ni casse) et cases à cocher, et un tag
// absent du référentiel se crée à la volée — la v2 étant réservée aux admins,
// ce champ est toujours proposé (dans l'éditeur, il l'est aux seuls admins).
// Différence voulue : la liaison recette ↔ tags ne s'écrit qu'au bouton
// « Enregistrer », section par section ; le tag créé, lui, entre au
// référentiel tout de suite, comme dans l'éditeur.
//
// Pas de « type de recette » : `recipes.type_id` n'est saisi nulle part ailleurs
// sur le site (78 recettes sur 78 sans type au relevé du 06/10/2026).
export function TagsEditor({
  recipe,
  tags,
  mutate,
  busy,
}: {
  recipe: RecipeFull;
  tags: RefOption[];
  mutate: Mutate;
  busy: boolean;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const initiaux = new Map(
    recipe.recipe_tags.flatMap((t) => (t.tags ? [[t.tags.id, t.tags.name] as [number, string]] : [])),
  );
  const [selected, setSelected] = useState<Map<number, string>>(new Map(initiaux));
  const [extraTags, setExtraTags] = useState<RefOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [creating, setCreating] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Repli de la liste au clic en dehors, comme dans l'éditeur.
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pickerOpen]);

  // Dédoublonné par id : un tag créé puis relu depuis le serveur ne doit pas
  // produire deux entrées de même clé React.
  const allTags = useMemo(() => [...new Map([...tags, ...extraTags].map((t) => [t.id, t])).values()], [tags, extraTags]);
  const remaining = useMemo(() => allTags.filter((t) => !selected.has(t.id)), [allTags, selected]);
  const filtered = useMemo(() => {
    const q = normLoose(search.trim());
    return q ? remaining.filter((t) => normLoose(t.name).includes(q)) : remaining;
  }, [remaining, search]);

  const modifie = selected.size !== initiaux.size || [...initiaux.keys()].some((id) => !selected.has(id));

  async function addTag(name: string) {
    const clean = capitalizeSentences(name.trim());
    if (!clean) return;
    const existing = allTags.find((t) => t.name.trim().toLowerCase() === clean.toLowerCase());
    if (existing) {
      setSelected((prev) => new Map(prev).set(existing.id, existing.name));
      setNewTagName('');
      setPickerOpen(false);
      return;
    }
    setCreating(true);
    const { data, error } = await createClient()
      .from('tags')
      .insert({ name: clean, slug: slugify(clean), status: 'published' })
      .select('id, name, slug')
      .single();
    setCreating(false);
    if (error || !data) return void dialog.alert('Erreur : ' + (error?.message ?? 'insertion impossible'));
    setExtraTags((p) => [...p, { id: data.id, name: data.name }]);
    setSelected((prev) => new Map(prev).set(data.id, data.name));
    setNewTagName('');
    setPickerOpen(false);
    // Référentiel mis en cache : invalidé avant la resynchronisation.
    void revalidateReference('tags');
    router.refresh();
  }

  async function enregistrer() {
    await mutate(
      async () => {
        const supabase = createClient();
        // Même geste que l'éditeur : liaisons supprimées puis réinsérées.
        const { error: delErr } = await supabase.from('recipe_tags').delete().eq('recipe_id', recipe.id);
        if (delErr) return { error: delErr };
        if (!selected.size) return { error: null };
        return supabase.from('recipe_tags').insert([...selected.keys()].map((tag_id) => ({ recipe_id: recipe.id, tag_id })));
      },
      { errorLabel: 'Enregistrement des catégories' },
    );
  }

  return (
    <div className="space-y-4">
      <label className={etiquette}>CATÉGORIES ET TAGS</label>
      <div className="flex flex-wrap items-center gap-2">
        {[...selected].map(([id, name]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSelected((prev) => new Map([...prev].filter(([tid]) => tid !== id)))}
            title="Retirer ce tag"
            className="flex items-center gap-1.5 rounded-full bg-primary-container px-4 py-1.5 font-label-md text-label-md text-white transition-opacity hover:opacity-80"
          >
            {name}
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        ))}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => {
              setPickerOpen((v) => !v);
              setSearch('');
            }}
            className="rounded-full border border-outline-variant px-4 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
          >
            + Ajouter un tag
          </button>
          {pickerOpen && (
            <div className="absolute left-0 z-20 mt-2 flex max-h-64 min-w-[220px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-white shadow-lg">
              <div className="shrink-0 px-2 pb-2 pt-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un tag…"
                  autoFocus
                  className="w-full rounded-lg border border-outline-variant px-3 py-1.5 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                {filtered.length ? (
                  filtered.map((t) => (
                    <label
                      key={t.id}
                      className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container"
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={(e) => {
                          if (!e.target.checked) return;
                          setSelected((prev) => new Map(prev).set(t.id, t.name));
                        }}
                        className="accent-primary"
                      />
                      {t.name}
                    </label>
                  ))
                ) : (
                  <p className="px-4 py-2 text-sm italic text-on-surface-variant">Aucun autre tag disponible</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void addTag(newTagName);
            }
          }}
          placeholder="Nouveau tag (hors référentiel)"
          className={`${champ} min-w-[200px] flex-1`}
        />
        <button
          type="button"
          disabled={!newTagName.trim() || creating}
          onClick={() => void addTag(newTagName)}
          title="Créer ce tag dans le référentiel et l'ajouter à la recette"
          className="rounded-full border border-primary px-4 py-1.5 font-label-md text-label-md text-primary transition-colors hover:bg-primary hover:text-on-primary disabled:pointer-events-none disabled:opacity-40"
        >
          Créer le tag
        </button>
      </div>
      {modifie && (
        <button type="button" onClick={enregistrer} disabled={busy} className={btnPrimary}>
          Enregistrer les catégories
        </button>
      )}
    </div>
  );
}

// ── Ustensiles, difficulté, temps ───────────────────────────────────────
export function OrganisationEditor({
  recipe,
  difficultyId,
  difficulties,
  utensilNames,
  mutate,
  busy,
}: {
  recipe: RecipeFull;
  difficultyId: number | null;
  difficulties: DifficultyOption[];
  utensilNames: string[];
  mutate: Mutate;
  busy: boolean;
}) {
  const init = {
    ustensiles: [...recipe.recipe_utensils]
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((u) => ({ name: u.name, comment: u.comment ?? '' })),
    difficulte: difficultyId ? String(difficultyId) : '',
    prep: recipe.prep_time ? String(recipe.prep_time) : '',
    cook: recipe.cook_time ? String(recipe.cook_time) : '',
    wait: recipe.wait_time ? String(recipe.wait_time) : '',
    total: recipe.total_time ? String(recipe.total_time) : '',
  };
  const [ustensiles, setUstensiles] = useState(init.ustensiles);
  const [difficulte, setDifficulte] = useState(init.difficulte);
  const [prep, setPrep] = useState(init.prep);
  const [cook, setCook] = useState(init.cook);
  const [wait, setWait] = useState(init.wait);
  const [total, setTotal] = useState(init.total);
  const modifie =
    JSON.stringify({ ustensiles, difficulte, prep, cook, wait, total }) !== JSON.stringify(init);

  async function enregistrer() {
    await mutate(
      async () => {
        const supabase = createClient();
        const { error } = await majRecette(recipe.id, {
          difficulty_id: difficulte ? Number(difficulte) : null,
          prep_time: minutes(prep),
          cook_time: minutes(cook),
          wait_time: minutes(wait),
          total_time: minutes(total),
        });
        if (error) return { error };
        const { error: delErr } = await supabase.from('recipe_utensils').delete().eq('recipe_id', recipe.id);
        if (delErr) return { error: delErr };
        const rows = ustensiles
          .map((u, i) => ({ recipe_id: recipe.id, name: u.name.trim(), comment: u.comment.trim() || null, order_index: i }))
          .filter((u) => u.name);
        if (!rows.length) return { error: null };
        return supabase.from('recipe_utensils').insert(rows);
      },
      { errorLabel: 'Enregistrement des ustensiles, de la difficulté et des temps' },
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label className={etiquette}>USTENSILES</label>
        <ul className="space-y-2">
          {ustensiles.map((u, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={u.name}
                onChange={(e) => setUstensiles((prev) => prev.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                list="dl-ustensiles-v2"
                placeholder="Cercle à tarte"
                className={`${champ} min-w-0 flex-[2]`}
              />
              <input
                value={u.comment}
                onChange={(e) => setUstensiles((prev) => prev.map((x, k) => (k === i ? { ...x, comment: e.target.value } : x)))}
                placeholder="Commentaire (optionnel)"
                className={`${champ} min-w-0 flex-1`}
              />
              <button
                type="button"
                title="Retirer"
                onClick={() => setUstensiles((prev) => prev.filter((_, k) => k !== i))}
                className="p-1"
              >
                <span className="material-symbols-outlined text-[20px] text-error">delete</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setUstensiles((prev) => [...prev, { name: '', comment: '' }])}
          className="mt-2 text-[12.5px] font-semibold text-primary"
        >
          + Ustensile
        </button>
        <datalist id="dl-ustensiles-v2">
          {utensilNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      <div>
        <label className={etiquette}>DIFFICULTÉ</label>
        <select value={difficulte} onChange={(e) => setDifficulte(e.target.value)} className={`${champ} sm:w-auto`}>
          <option value="">— À préciser —</option>
          {difficulties.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={etiquette}>TEMPS (EN MINUTES)</label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['Préparation', prep, setPrep],
              ['Cuisson', cook, setCook],
              ['Repos', wait, setWait],
              ['Total', total, setTotal],
            ] as const
          ).map(([libelle, valeur, maj]) => (
            <div key={libelle}>
              <span className="mb-0.5 block text-[12px] text-on-surface-variant">{libelle}</span>
              <input value={valeur} onChange={(e) => maj(e.target.value)} inputMode="numeric" className={champ} />
            </div>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-on-surface-variant">
          Laissés vides, les temps sont calculés à partir de ceux des étapes.
        </p>
      </div>

      {modifie && (
        <button type="button" onClick={enregistrer} disabled={busy} className={btnPrimary}>
          Enregistrer
        </button>
      )}
    </div>
  );
}

// ── Conseils et source ──────────────────────────────────────────────────
export function ConseilsEditor({ recipe, mutate, busy }: { recipe: RecipeFull; mutate: Mutate; busy: boolean }) {
  const init = {
    tips: recipe.tips ?? '',
    serving: recipe.serving_advice ?? '',
    source: recipe.source ?? '',
    sourceUrl: recipe.source_url ?? '',
    videoUrl: recipe.video_url ?? '',
  };
  const [v, setV] = useState(init);
  const modifie = JSON.stringify(v) !== JSON.stringify(init);
  const maj = (k: keyof typeof init) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));

  async function enregistrer() {
    await mutate(
      () =>
        majRecette(recipe.id, {
          tips: v.tips.trim() || null,
          serving_advice: v.serving.trim() || null,
          source: v.source.trim() || null,
          source_url: v.sourceUrl.trim() || null,
          video_url: v.videoUrl.trim() || null,
        }),
      { errorLabel: 'Enregistrement des conseils' },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={etiquette}>CONSEILS</label>
        <textarea value={v.tips} onChange={maj('tips')} rows={3} className={champ} placeholder="Astuces de réalisation, conservation…" />
      </div>
      <div>
        <label className={etiquette}>CONSEILS DE SERVICE</label>
        <textarea value={v.serving} onChange={maj('serving')} rows={2} className={champ} placeholder="Température de dégustation, accompagnement…" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={etiquette}>SOURCE</label>
          <input value={v.source} onChange={maj('source')} className={champ} placeholder="Livre, chef…" />
        </div>
        <div>
          <label className={etiquette}>LIEN</label>
          <input value={v.sourceUrl} onChange={maj('sourceUrl')} inputMode="url" className={champ} placeholder="https://…" />
        </div>
        <div>
          <label className={etiquette}>VIDÉO</label>
          <input value={v.videoUrl} onChange={maj('videoUrl')} inputMode="url" className={champ} placeholder="https://youtube.com/…" />
        </div>
      </div>
      {modifie && (
        <button type="button" onClick={enregistrer} disabled={busy} className={btnPrimary}>
          Enregistrer
        </button>
      )}
    </div>
  );
}
