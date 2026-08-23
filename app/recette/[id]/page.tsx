import type { Metadata } from 'next';
import Link from 'next/link';
import { getRecipeFull, getAllergensWithPicto, getIngredientConversions, type AllergenRef } from '@/lib/recipes';
import { getRecipes } from '@/lib/recipes';
import { ingredientConversionText } from '@/lib/ingredient-conversions';
import { getFavoriteIds } from '@/lib/favorites';
import { getRecipeShareInfo } from '@/lib/shares-data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getActiveAds } from '@/lib/ads';
import { getUnits, getShoppingLists, getRecipeCompletedBatches } from '@/lib/profile';
import { fmtNum, batchFactor } from '@/lib/recipe-plan';
import { getMoldTypes } from '@/lib/admin';
import { getRecipeDefaultPhoto } from '@/lib/site';
import { getApprovedComments } from '@/lib/reviews-data';
import { formatTime, formatDate, formatDateHeure } from '@/lib/format';
import { UNITS_LBL, yieldInfo, mergeIngredients, dayLabel, planningDays, effectiveTimes } from '@/lib/recipe-view';
import { AiPhotoBadge } from '@/components/AiPhotoBadge';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { MaryseIcon } from '@/components/MaryseIcon';
import { PartnerSlot } from '@/components/PartnerSlot';
import { SuggestionsSidebar } from '@/components/recipe/SuggestionsSidebar';
import { FavoriteButton } from '@/components/recipe/FavoriteButton';
import { PrintButton } from '@/components/recipe/PrintButton';
import { ShoppingWidget } from '@/components/recipe/ShoppingWidget';
import { BatchWidget } from '@/components/recipe/BatchWidget';
import { PlanProvider } from '@/components/recipe/PlanContext';
import { ShareButton } from '@/components/recipe/ShareButton';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';
import { StepPhotoGallery } from '@/components/recipe/StepPhotoGallery';
import { type TocSections } from '@/components/recipe/RecipeToc';
import { RecetteToc } from '@/components/recipe/RecetteToc';
import { RecipeComments } from '@/components/recipe/RecipeComments';
import { StarRating } from '@/components/StarRating';

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ planifier?: string }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const r = await getRecipeFull(id);
  return { title: r ? `${r.title} | Je pâtisse !` : 'Recette | Je pâtisse !' };
}

export default async function RecettePage({ params, searchParams }: Params) {
  const { id } = await params;
  const { planifier } = await searchParams;
  const recipe = await getRecipeFull(id);

  if (!recipe) {
    return (
      <>
        <Header />
        <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-20 text-center">
          <p className="font-headline-md text-headline-md text-primary mb-2">Recette introuvable</p>
          <p className="text-on-surface-variant">Elle n&apos;existe pas ou n&apos;est pas accessible.</p>
        </main>
      </>
    );
  }

  const [user, favIds, units, suggestionsRaw, moldTypes, allergenRefs, conversions, ads, defaultPhoto, comments] = await Promise.all([
    getCurrentUser(),
    getFavoriteIds(),
    getUnits(),
    getRecipes({ limit: 4 }),
    getMoldTypes(),
    getAllergensWithPicto(),
    getIngredientConversions(),
    getActiveAds(['recipe_inline', 'sidebar']),
    getRecipeDefaultPhoto(),
    getApprovedComments(recipe.id),
  ]);
  const isOwner = !!user && recipe.author_id === user.id;
  // Réservé au propriétaire : un visiteur n'a pas à savoir avec qui la
  // recette est partagée (lib/shares.ts — à tenir synchrone avec la policy
  // RLS `recipes_partagees`).
  const shareInfo = isOwner ? await getRecipeShareInfo(recipe.id, recipe.author_id, recipe.status) : undefined;
  // Admin : débloque le mode d'ajustement des quantités par IA dans la création d'une fournée.
  const userIsAdmin = user ? await isAdmin(user.id) : false;
  const shoppingLists = user ? (await getShoppingLists(user.id)).map((l) => ({ id: l.id, name: l.name })) : [];
  // Mes fournées terminées sur cette recette — propres au visiteur connecté
  // (RLS `owns_plan()`), quel que soit l'auteur de la recette.
  const completedBatches = user ? await getRecipeCompletedBatches(user.id, recipe.id) : [];
  const unitTips: Record<string, string> = {};
  units.forEach((u) => {
    if (u.tooltip) unitTips[String(u.name).toLowerCase().trim()] = u.tooltip;
  });
  const suggestions = suggestionsRaw.filter((r) => r.id !== recipe.id).slice(0, 2);

  // Rendu quantité + unité (unité survolable si infobulle définie), suivi
  // d'une conversion entre parenthèses quand l'ingrédient est référencé dans
  // la table « Conversions d'ingrédients » (ex. « 2 œufs (≈ 100 g) »).
  const Qty = ({ quantity, unit, refId }: { quantity: string | number | null; unit: string | null; refId?: number | null }) => {
    const q = quantity != null && String(quantity) !== '' ? String(quantity) : '';
    const tip = unit ? unitTips[unit.toLowerCase().trim()] : undefined;
    const conv = ingredientConversionText(conversions, units, refId, unit, quantity);
    return (
      <>
        {/* Le nombre et son unité forment un tout : sur une colonne étroite
            (mobile), sans `nowrap`, « 1650 » se retrouve séparé de « ml ». La
            conversion reste hors du groupe — l'inclure rigidifierait la
            colonne à la largeur de « 1 unité(s) (≈ 20 g) ». */}
        <span className="whitespace-nowrap">
          {q}
          {q && unit ? ' ' : ''}
          {unit ? (
            tip ? (
              <span className="unit-tip" title={tip}>
                {unit}
              </span>
            ) : (
              unit
            )
          ) : null}
        </span>
        {conv && <span className="print-fs-9 text-on-surface-variant font-body-md text-[12px]"> ({conv})</span>}
      </>
    );
  };

  const yInfo = yieldInfo(recipe);
  const level = recipe.difficulties?.level || 0;
  const tags = (recipe.recipe_tags || []).map((t) => t.tags?.name).filter(Boolean) as string[];
  const groups = [...(recipe.ingredient_groups || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  // Allergènes de la recette : on part des infos contenues dans la recette
  // elle-même — le champ « allergène » (texte libre) de chaque ingrédient,
  // éventuellement multiple — complété par l'allergène du référentiel rattaché.
  // Le picto et l'infobulle sont retrouvés par rapprochement de nom dans la
  // table de référence ; un allergène sans correspondance reste affiché en texte.
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const allergens: { key: string; name: string; picto: string | null; tooltip: string | null }[] = (() => {
    const refByName = new Map(allergenRefs.map((a) => [norm(a.name), a]));
    const seen = new Map<string, { key: string; name: string; picto: string | null; tooltip: string | null }>();
    const add = (raw: string, ref?: AllergenRef | null) => {
      const clean = raw.trim();
      if (!clean) return;
      const k = norm(clean);
      if (!k) return;
      const match = ref ?? refByName.get(k) ?? null;
      const existing = seen.get(k);
      if (existing) {
        if (!existing.picto && match?.picto) {
          existing.picto = match.picto;
          existing.tooltip = match.tooltip;
          existing.name = match.name;
        }
        return;
      }
      seen.set(k, { key: k, name: match?.name ?? clean, picto: match?.picto ?? null, tooltip: match?.tooltip ?? null });
    };
    for (const g of groups) {
      for (const it of g.ingredients || []) {
        if (it.ingredient_refs?.allergens) add(it.ingredient_refs.allergens.name, it.ingredient_refs.allergens);
        if (it.allergen) for (const part of it.allergen.split(/[,;/]/)) add(part);
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  })();
  const groupsByOrder: Record<number, (typeof groups)[number]> = {};
  groups.forEach((g) => (groupsByOrder[g.order_index || 0] = g));
  const steps = [...(recipe.recipe_steps || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const utensils = [...(recipe.recipe_utensils || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const times = effectiveTimes(recipe);
  const merged = mergeIngredients(recipe, conversions, units);
  const days = planningDays(steps);
  const dLabel = (offset: number | null | undefined) => dayLabel(offset);

  // Sommaire de consultation : contrairement à l'éditeur, une section absente
  // de la recette n'existe pas dans le DOM — elle n'a donc rien à faire dans
  // la liste, sous peine de lien mort (pas de scroll-spy possible non plus).
  const tocSections: TocSections = {
    before: [
      { id: 'sec-technique', label: 'Bloc technique', icon: 'straighten', level: 1 },
      ...(recipe.description ? [{ id: 'sec-description', label: 'Description', icon: 'edit_note', level: 1 as const }] : []),
      ...(steps.length > 0 ? [{ id: 'sec-planning', label: 'Planning de préparation', icon: 'calendar_month', level: 1 as const }] : []),
      ...(utensils.length > 0 ? [{ id: 'sec-ustensiles', label: 'Ustensiles', icon: 'blender', level: 1 as const }] : []),
      ...(groups.length > 0 ? [{ id: 'sec-ingredients', label: 'Ingrédients', icon: 'egg_alt', level: 1 as const }] : []),
      ...(steps.length > 0 ? [{ id: 'sec-etapes', label: 'Étapes', icon: 'format_list_numbered', level: 1 as const }] : []),
    ],
    after: [
      ...(recipe.tips ? [{ id: 'sec-conseils', label: 'Conseils de la recette', icon: 'lightbulb', level: 1 as const }] : []),
      ...(recipe.serving_advice ? [{ id: 'sec-degustation', label: 'Dégustation et conservation', icon: 'restaurant', level: 1 as const }] : []),
      ...(comments.length > 0 ? [{ id: 'sec-commentaires', label: `Avis (${comments.length})`, icon: 'rate_review', level: 1 as const }] : []),
    ],
  };
  const tocSteps = steps.map((s, i) => ({ key: String(s.id), title: s.title || `Étape ${i + 1}` }));

  let statusBadge: { label: string; cls: string } | null = null;
  if (recipe.status === 'pending') statusBadge = { label: 'En attente de validation', cls: 'bg-secondary text-white' };
  else if (recipe.status === 'draft') statusBadge = { label: 'Brouillon', cls: 'bg-secondary text-white' };
  else if (recipe.status === 'rejected') statusBadge = { label: 'Publication refusée', cls: 'bg-error text-white' };
  else if (recipe.status === 'published' && isOwner) statusBadge = { label: 'Publiée', cls: 'bg-green-700 text-white' };

  return (
    <>
      <Header className="no-print" />
      <div className="no-print max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop pt-6">
        <div className="flex items-center gap-2 text-on-surface-variant font-label-md text-[12px]">
          <Link className="hover:text-primary" href="/">
            Accueil
          </Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-primary">{recipe.title}</span>
        </div>
      </div>

      <div className="recette-page">
      <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-8 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <PlanProvider autoOpen={planifier === '1'}>
        <RecetteToc
          recipeId={recipe.id}
          isOwner={isOwner}
          sections={tocSections}
          steps={tocSteps}
          status={recipe.status || 'draft'}
          isPublic={recipe.is_public !== false}
          isAdmin={userIsAdmin}
        />
        <div className="recipe-print-content lg:col-span-8">
          {/* En-tête */}
          <div className="flex flex-col gap-4 mb-8">
            <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary text-center">
              {recipe.title}
            </h1>
            <div className="no-print flex items-center gap-4 flex-wrap">
              {statusBadge && (
                <span className={`${statusBadge.cls} px-3 py-1 font-label-md text-[10px] uppercase tracking-widest`}>
                  {statusBadge.label}
                </span>
              )}
              <span className="bg-surface-container-highest text-primary px-3 py-1 font-label-md text-[10px] uppercase tracking-widest">
                {recipe.is_public === false ? 'Privée' : 'Publique'}
              </span>
              <StarRating
                value={recipe.rating_avg}
                count={recipe.rating_count}
                size={16}
                className="font-label-md text-label-md"
              />
              <span className="flex items-center gap-2 text-secondary ml-auto">
                <FavoriteButton recipeId={recipe.id} initialFav={favIds.has(recipe.id)} />
                <ShareButton title={recipe.title} recipeId={recipe.id} ownerId={recipe.author_id} isOwner={isOwner} shareInfo={shareInfo} />
                <PrintButton />
              </span>
            </div>
            {recipe.moderation_note && (isOwner || userIsAdmin) && (
              // Motif saisi par l'admin à la refus (§9, Admin → Recettes) —
              // sans messagerie interne pour le transmettre autrement,
              // l'auteur ne le découvrait jusqu'ici qu'en le demandant.
              // Visible de l'auteur et de l'admin, jamais du public. Reste
              // affiché tant que la recette n'est pas resoumise (statut
              // `rejected` ou repassée en `draft` sans resoumission) — la
              // resoumission vide `moderation_note` (trigger SQL
              // `recipes_archive_rejection_note`).
              <div className="no-print border border-error/40 bg-error-container/40 text-on-error-container rounded-xl px-5 py-3 flex items-start gap-3">
                <span className="material-symbols-outlined text-[20px] shrink-0">info</span>
                <p className="font-body-md text-[13px]">
                  <span className="font-semibold">
                    Motif du refus{recipe.moderation_note_at ? ` du ${formatDate(recipe.moderation_note_at)}` : ''} :
                  </span>{' '}
                  {recipe.moderation_note}
                </p>
              </div>
            )}
            <div className="flex items-center gap-4 text-on-surface-variant font-label-md text-label-md flex-wrap">
              <span className="flex items-center gap-2">
                Par{' '}
                {/* Signature de l'auteur : lien vers son profil public.
                    Repli sur `author_id` si l'auteur n'a pas encore choisi de
                    nom d'utilisateur — `getPublicProfile` accepte les deux. */}
                <Link
                  className="no-print flex items-center gap-2 hover:text-primary transition-colors"
                  href={`/u/${recipe.profiles?.username || recipe.author_id}`}
                >
                  <span className="w-6 h-6 rounded-full overflow-hidden border border-outline-variant block bg-surface-container">
                    {recipe.profiles?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                      <img src={recipe.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant flex items-center justify-center w-full h-full">
                        person
                      </span>
                    )}
                  </span>
                  <span className="border-b border-primary">{recipe.profiles?.full_name || 'Auteur'}</span>
                </Link>
                {/* Version imprimée : le nom de l'auteur reste, sans avatar ni lien. */}
                <span className="hidden print:inline">{recipe.profiles?.full_name || 'Auteur'}</span>
              </span>
              <span className="w-1 h-1 bg-outline-variant rounded-full" />
              <span>
                {(recipe.status === 'published' ? 'Publié le ' : 'Créée le ') + formatDate(recipe.created_at)}
              </span>
              {recipe.updated_at && recipe.updated_at !== recipe.created_at && (
                <>
                  <span className="w-1 h-1 bg-outline-variant rounded-full" />
                  <span className="text-[12px] font-normal">Dernière modification le {formatDateHeure(recipe.updated_at)}</span>
                </>
              )}
            </div>
            {tags.length > 0 && (
              <div className="no-print mt-4 border-y border-outline-variant py-4 flex gap-2 flex-wrap">
                {tags.map((n) => (
                  <span key={n} className="bg-secondary-fixed text-on-secondary-fixed px-3 py-1 rounded-full font-label-md text-[12px]">
                    {n}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Créer une fournée — le panneau s'ouvre au clic sur le bouton du
              rail. Une fournée créée quitte cette fiche pour vivre sur son
              propre écran (/fournee/[id]) — voir CLAUDE.md « Fournées ». */}
          <div className="no-print">
          <BatchWidget recipe={recipe} moldTypes={moldTypes} ingredients={merged} isAdmin={userIsAdmin} />
          </div>

          {/* Mes fournées terminées — historique personnel, replié par
              défaut. Absent de l'impression : sans intérêt sur la fiche
              papier de la recette. */}
          {completedBatches.length > 0 && (
            <details className="no-print group border border-outline-variant mb-12">
              <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
                <span className="font-label-md text-label-md text-primary">
                  MES FOURNÉES TERMINÉES ({completedBatches.length})
                </span>
                <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <div className="p-4 bg-white">
                <ul className="divide-y divide-outline-variant/30">
                  {completedBatches.map((b) => (
                    <li key={b.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                      <Link href={`/fournee/${b.id}?mode=preparer`} className="font-body-md text-body-md text-primary underline underline-offset-2 hover:text-secondary">
                        {formatDate(b.date_fin ?? b.planned_date)}
                      </Link>
                      <span className="flex items-center gap-3 text-on-surface-variant font-label-md text-label-md flex-wrap">
                        <span className="bg-surface-variant px-2 py-1">× {fmtNum(batchFactor(b))}</span>
                        {b.user_note && <span className="italic">{b.user_note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}

          {/* Hero */}
          {recipe.hero_image_url && (
            <div className="print-hero relative w-full aspect-[16/9] mb-12 overflow-hidden ambient-shadow border border-outline-variant">
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin */}
              <img src={recipe.hero_image_url} alt={recipe.title} className="w-full h-full object-cover" />
              {recipe.hero_image_ai_retouched && <AiPhotoBadge />}
            </div>
          )}

          {/* Bloc technique */}
          <div id="sec-technique" className="scroll-mt-28 bg-surface-container-low p-8 mb-12 space-y-8">
            <div className="flex flex-wrap justify-evenly items-start gap-y-8 gap-x-4">
              {yInfo && (
                <div className="flex flex-col gap-1 items-center text-center">
                  <span className="print-fs-9 font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
                    {yInfo.label}
                  </span>
                  <span className="print-yield-value font-headline-md text-headline-md text-primary">{yInfo.value}</span>
                </div>
              )}
              <div className="flex flex-col gap-1 items-center text-center">
                <span className="print-fs-9 font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
                  Difficulté
                </span>
                <div className="flex items-center justify-center gap-2 h-8">
                  {level ? (
                    [1, 2, 3, 4, 5].map((i) => (
                      <MaryseIcon key={i} className={i <= level ? 'text-primary' : 'text-outline-variant'} />
                    ))
                  ) : (
                    <span className="text-sm text-on-surface-variant">—</span>
                  )}
                  {/* Impression : le nom de la difficulté rejoint les pictos sur
                      la même ligne, sous le libellé « Difficulté » — au lieu
                      d'une 3e ligne comme à l'écran. */}
                  {recipe.difficulties?.name && (
                    <span className="hidden print:inline font-label-md text-label-md text-on-surface">
                      {recipe.difficulties.name}
                    </span>
                  )}
                </div>
                {recipe.difficulties?.name && (
                  <span className="no-print font-label-md text-label-md text-on-surface">
                    {recipe.difficulties.name}
                  </span>
                )}
              </div>
            </div>
            {recipe.yield_notes && (
              <div className="pt-2 border-t border-outline-variant/40 text-center">
                <span className="print-fs-11 font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px] block mb-1">
                  Complément d&apos;informations sur les quantités
                </span>
                <p className="print-fs-11 font-body-md text-body-md italic text-on-surface-variant whitespace-pre-line">{recipe.yield_notes}</p>
              </div>
            )}
            <div className={`print-times grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-4 ${recipe.yield_notes ? 'pt-2 border-t border-outline-variant/40' : ''}`}>
              {(
                [
                  ['Temps de prép', times.prep],
                  ['Cuisson', times.cook],
                  ['Attente', times.wait],
                  ['Durée totale', times.total],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="print-times-item flex flex-col gap-1 items-center text-center">
                  <span className="print-fs-11 font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
                    {label}
                  </span>
                  <span className="print-fs-11 font-body-lg text-body-lg font-bold text-primary">{v ? formatTime(v) : '—'}</span>
                </div>
              ))}
            </div>
            {allergens.length > 0 && (
              <div className="flex items-center justify-center gap-3 flex-wrap pt-2 border-t border-outline-variant/40">
                <span className="print-fs-9 font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
                  Allergènes :
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {allergens.map((a) =>
                    a.picto ? (
                      <span key={a.key} className="flex flex-col items-center gap-0.5">
                        {/* eslint-disable-next-line @next/next/no-img-element -- data-URL stockée en base */}
                        <img src={a.picto} alt={a.name} title={a.name} className="w-8 h-8 object-contain" />
                        {/* Libellé absent à l'écran (le nom est déjà dans le title au survol) mais
                            indispensable au papier, où le survol n'existe pas. */}
                        <span className="hidden print:block print-fs-9 text-[9px] text-on-surface-variant">
                          {a.name}
                        </span>
                      </span>
                    ) : (
                      <span
                        key={a.key}
                        title={a.name}
                        className="px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface font-label-md text-[12px]"
                      >
                        {a.name}
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {recipe.description && (
            <div id="sec-description" className="scroll-mt-28 bg-primary p-10 text-white relative overflow-hidden mb-12">
              <div className="absolute -right-10 -top-10 opacity-10">
                <span className="material-symbols-outlined text-[120px]">restaurant_menu</span>
              </div>
              <h3 className="font-headline-md text-headline-md mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined">auto_awesome</span>En quelques mots
              </h3>
              <p className="print-fs-11 font-body-lg text-body-lg italic opacity-90 leading-relaxed">{recipe.description}</p>
            </div>
          )}

          {/* Source & liens d'origine */}
          {(recipe.source || recipe.source_url || recipe.video_url) && (
            <div className="print-fs-9 mb-12 flex flex-wrap items-center gap-x-6 gap-y-2 font-body-md text-body-md">
              {(recipe.source || recipe.source_url) &&
                (recipe.source_url ? (
                  <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary underline underline-offset-2 hover:text-secondary">
                    <span className="material-symbols-outlined text-[18px]">menu_book</span>
                    {recipe.source ? (
                      <>Source :&nbsp;<span className="font-semibold">{recipe.source}</span></>
                    ) : (
                      <>Recette d&apos;origine</>
                    )}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[18px] text-primary">menu_book</span>
                    Source :&nbsp;<span className="font-semibold text-on-surface">{recipe.source}</span>
                  </span>
                ))}
              {recipe.video_url && (
                <a href={recipe.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary underline underline-offset-2 hover:text-secondary">
                  <span className="material-symbols-outlined text-[18px]">play_circle</span>Vidéo
                </a>
              )}
            </div>
          )}

          {/* Planning de préparation — sans intérêt à l'impression quand
              toutes les étapes tombent le même jour (un seul jalon à
              afficher) : masqué dans ce cas, conservé à l'écran. */}
          {steps.length > 0 && (
            <div id="sec-planning" className={`scroll-mt-28 ${days.length <= 1 ? 'no-print ' : ''}mb-12 py-10 border-y border-outline-variant`}>
              <h3 className="font-headline-md text-headline-md text-primary mb-8">Planning de préparation</h3>
              <div className="relative flex flex-col md:flex-row gap-8">
                <div className="hidden md:block absolute top-10 left-0 w-full h-[2px] bg-outline-variant" />
                {days.map((d, i) => (
                  <div key={i} className="relative flex flex-col items-center text-center gap-4 z-10 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                      {i + 1}
                    </div>
                    <span className="font-label-md text-[12px] text-secondary">{dLabel(d.offset)}</span>
                    {d.items.map((it, k) => (
                      <p key={k} className="font-body-md text-body-md font-semibold">
                        {it.title}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ustensiles */}
          {utensils.length > 0 && (
            <div id="sec-ustensiles" className="scroll-mt-28 mb-12">
              <h3 className="font-headline-md text-headline-md text-primary mb-6">Ustensiles nécessaires</h3>
              <ul className="grid grid-cols-1 gap-y-2 list-none">
                {utensils.map((u) => {
                  const url = u.utensils?.url || u.url;
                  return (
                    <li key={u.id} className="py-2 border-b border-outline-variant/30 font-body-md text-body-md">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-secondary">
                          {u.name}
                        </a>
                      ) : (
                        u.name
                      )}
                      {u.comment && <span className="print-fs-9 text-on-surface-variant text-sm italic"> — {u.comment}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Ingrédients */}
          {groups.length > 0 && (
            <div id="sec-ingredients" className="scroll-mt-28 mb-12">
              <h3 className="font-headline-md text-headline-md text-primary mb-8">Ingrédients</h3>
              <div className="no-print">
                <div className="space-y-10">
                  {groups.map((g) => (
                    <div key={g.id}>
                      <h4 className="font-label-md text-label-md text-secondary border-b border-outline-variant pb-2 mb-4">
                        {g.name || ''}
                      </h4>
                      {/* La colonne du nom est en `minmax(0,1fr)`, jamais en
                          `max-content` : une colonne `max-content` ne peut pas
                          rétrécir, donc un nom long (« Levure sèche de
                          boulanger — ou levure fraîche ») élargissait la grille
                          au-delà du viewport et mettait toute la page en
                          défilement horizontal sur mobile. */}
                      <ul className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 sm:gap-x-10 print:gap-x-10">
                        {[...(g.ingredients || [])]
                          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                          .map((it) => {
                            const url = it.ingredient_refs?.url || it.url;
                            return (
                              <li
                                key={it.id}
                                className="border-b border-outline-variant/30 py-2"
                                style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1', alignItems: 'center' }}
                              >
                                <span className="font-label-md text-label-md text-primary">
                                  <Qty quantity={it.quantity} unit={it.unit} refId={it.ref_id} />
                                </span>
                                <span className="font-body-md text-body-md break-words">
                                  {url ? (
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-secondary">
                                      {it.name}
                                    </a>
                                  ) : (
                                    it.name
                                  )}
                                  {it.comment && <span className="print-fs-9 text-on-surface-variant text-sm italic"> — {it.comment}</span>}
                                  {it.allergen && (
                                    <span className="print-fs-9 text-[14px] text-on-surface-variant font-normal italic"> (Allergènes : {it.allergen})</span>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {merged.length > 0 && (
                <details className="group border border-outline-variant mt-12">
                  <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
                    <span className="font-label-md text-label-md text-primary">LISTE COMPLÈTE DES INGRÉDIENTS</span>
                    <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                  </summary>
                  <div className="p-4 bg-white">
                    <ul className="grid grid-cols-[minmax(0,16rem)_max-content] gap-x-3 sm:gap-x-6 print:gap-x-6">
                      {merged.map((m, k) => (
                        <li key={k} className="py-2 border-b border-outline-variant/30" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}>
                          <span className="font-body-md text-body-md break-words">
                            <span className="hidden print:inline-block align-text-bottom w-4 h-4 border-2 border-on-surface mr-2" />
                            {m.name}
                            {m.comment && <span className="print-fs-9 text-on-surface-variant text-sm italic"> — {m.comment}</span>}
                          </span>
                          <span className="font-label-md text-label-md text-primary">
                            <Qty quantity={m.qty} unit={m.unit} refId={m.ref_id} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              )}

              {merged.length > 0 && (
                <div className="no-print">
                <ShoppingWidget
                  recipeTitle={recipe.title}
                  ingredients={merged}
                  lists={shoppingLists}
                  isLoggedIn={!!user}
                  conversions={conversions}
                  units={units}
                />
                </div>
              )}
            </div>
          )}

          {/* Publicité */}
          <PartnerSlot slot="recipe_inline" ads={ads} className="mb-12" />

          {/* Étapes */}
          {steps.length > 0 && (
            <div id="sec-etapes" className="scroll-mt-28 space-y-16">
              {steps.map((s, i) => {
                const grp = groupsByOrder[s.order_index || 0];
                const ings = grp ? [...(grp.ingredients || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)) : [];
                const photos = [...(s.step_photos || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
                const stepTotal = (s.prep_time || 0) + (s.wait_time || 0) + (s.cook_time || 0);
                const badges: string[] = [
                  dLabel(Math.max(0, s.day_offset || 0)),
                  s.prep_time ? `PRÉP ${formatTime(s.prep_time).toUpperCase()}` : '',
                  s.wait_time ? `ATTENTE ${formatTime(s.wait_time).toUpperCase()}` : '',
                  s.cook_time
                    ? `CUISSON ${formatTime(s.cook_time).toUpperCase()}${s.cook_temp ? ' · ' + s.cook_temp + ' °C' : ''}`
                    : s.cook_temp
                      ? `CUISSON ${s.cook_temp} °C`
                      : '',
                ].filter(Boolean);
                const stepTitle = (
                  <h4 className="font-headline-md text-headline-md text-primary">
                    {i + 1}. {s.title || 'Étape ' + (i + 1)}
                  </h4>
                );
                const stepMeta = (
                  <div className="print-fs-9 flex gap-4 text-on-surface-variant font-label-md text-[12px] flex-wrap">
                    {badges.map((b, k) => (
                      <span key={k} className="bg-surface-variant px-3 py-1">
                        {b}
                      </span>
                    ))}
                    {stepTotal > 0 && (
                      <span className="bg-primary text-white px-3 py-1">TOTAL {formatTime(stepTotal).toUpperCase()}</span>
                    )}
                  </div>
                );
                const header = (
                  <>
                    {stepTitle}
                    {stepMeta}
                  </>
                );
                const extra = (
                  <>
                    <StepPhotoGallery photos={photos} />
                    {s.video_url && <StepVideoPlayer url={s.video_url} />}
                    {Array.isArray(s.sous_etapes) && s.sous_etapes.length > 0 ? (
                      <ul className="flex flex-col gap-3 font-body-lg text-body-lg leading-relaxed text-on-surface">
                        {s.sous_etapes.map((t, k) => (
                          <li key={k} className="flex gap-3">
                            <span className="text-primary shrink-0">–</span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    ) : s.description ? (
                      <div className="font-body-lg text-body-lg leading-relaxed text-on-surface whitespace-pre-line">
                        {s.description}
                      </div>
                    ) : null}
                    {s.tips && (
                      <details className="group border border-outline-variant" open>
                        <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
                          <span className="font-label-md text-label-md text-primary">Conseils &amp; Astuces de l&apos;étape</span>
                          <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                        </summary>
                        <div className="p-4 bg-white font-body-md text-body-md italic whitespace-pre-line">{s.tips}</div>
                      </details>
                    )}
                  </>
                );
                return (
                  <div
                    key={s.id}
                    // Même format que `stepAnchorId` (components/recipe/RecipeToc.tsx),
                    // recalculé ici plutôt qu'importé : cette fonction vient d'un
                    // module « use client » — un Server Component peut le rendre en
                    // JSX (<RecipeToc />), mais appeler une de ses exports comme une
                    // fonction plante au rendu serveur (référence client, pas de code
                    // exécutable côté serveur).
                    id={`sec-etape-${i + 1}`}
                    className={`scroll-mt-28 flex flex-col gap-6${i < steps.length - 1 ? ' pb-14 border-b-2 border-outline-variant' : ''}`}
                  >
                    <div className="flex items-center justify-between border-b border-outline pb-4 flex-wrap gap-3">{header}</div>
                    {ings.length > 0 && (
                      <details className="group border border-outline-variant mb-2" open>
                        <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
                          <span className="font-label-md text-label-md text-primary">Ingrédients de l&apos;étape</span>
                          <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                        </summary>
                        <div className="p-4 bg-white">
                          <ul className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 sm:gap-x-10 print:gap-x-10">
                            {ings.map((it) => (
                              <li key={it.id} className="py-2 border-b border-outline-variant/30" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}>
                                <span className="font-label-md text-label-md text-primary">
                                  <span className="hidden print:inline-block align-text-bottom w-4 h-4 border-2 border-on-surface mr-2" />
                                  <Qty quantity={it.quantity} unit={it.unit} refId={it.ref_id} />
                                </span>
                                <span className="font-body-md text-body-md break-words">
                                  {it.name}
                                  {it.comment && <span className="print-fs-9 text-on-surface-variant text-sm italic"> — {it.comment}</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </details>
                    )}
                    {extra}
                  </div>
                );
              })}
            </div>
          )}

          {/* Conseils de la recette */}
          {recipe.tips && (
            <div id="sec-conseils" className="scroll-mt-28 mt-20 bg-primary p-10 text-white relative overflow-hidden">
              <div className="absolute -right-10 -top-10 opacity-10">
                <span className="material-symbols-outlined text-[120px]">lightbulb</span>
              </div>
              <h3 className="font-headline-md text-headline-md mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined">auto_awesome</span>Conseils et astuces de la recette
              </h3>
              <p className="font-body-lg text-body-lg italic opacity-90 leading-relaxed whitespace-pre-line">{recipe.tips}</p>
              {recipe.profiles?.full_name && (
                <p className="print-fs-9 mt-6 font-label-md text-label-md">— {recipe.profiles.full_name}</p>
              )}
            </div>
          )}

          {/* Conseils de dégustation et de conservation */}
          {recipe.serving_advice && (
            <div id="sec-degustation" className="scroll-mt-28 mt-12 bg-surface-container-low border border-outline-variant p-10 relative overflow-hidden">
              <div className="absolute -right-10 -top-10 opacity-10">
                <span className="material-symbols-outlined text-[120px] text-primary">restaurant</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-primary mb-4 flex items-center gap-3">
                <span className="material-symbols-outlined">restaurant</span>Dégustation et conservation
              </h3>
              <p className="font-body-lg text-body-lg italic text-on-surface-variant leading-relaxed whitespace-pre-line">{recipe.serving_advice}</p>
            </div>
          )}

          <RecipeComments comments={comments} />
        </div>
        </PlanProvider>

        <SuggestionsSidebar
          suggestions={suggestions}
          favIds={favIds}
          ads={ads}
          showPlan={!!user}
          defaultPhoto={defaultPhoto}
        />
      </main>
      </div>

      <div className="no-print">
      <Footer />
      <MobileNav />
      </div>
    </>
  );
}
