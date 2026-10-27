import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isAdmin, requireUser } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import { getProjectFull, getProjectTrials } from '@/lib/projects-data';
import { canAccess } from '@/lib/entitlements';
import { checkQuota, getCurrentPlan, getEntitlements } from '@/lib/entitlements-data';
import { getMoldTypes } from '@/lib/admin';
import { getUnits } from '@/lib/profile';
import { getIngredientConversions, getRecipeFull } from '@/lib/recipes';
import { getAllergenRefs, getDifficulties, getIngredientRefAllergens, getIngredientRefsList, getTags, getUtensilRefNames } from '@/lib/data/reference';
import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { getVisibleHelpBlocks } from '@/lib/help';
import { ProjectV2 } from '@/components/projets/v2/ProjectV2';
import { ProjectReadOnly } from '@/components/projets/ProjectReadOnly';

export const metadata: Metadata = { title: 'Projet | Je pâtisse !' };
// Tout s'enregistre au fil de l'eau et se relit à chaque rendu serveur,
// jamais de cache.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Mode projet — page verticale qui présente le projet comme la recette qu'il
// deviendra (cf. CLAUDE.md « Mode projet »). Ancien parcours en onglets
// retiré : cette page est désormais celle de tous les membres.
export default async function ProjetPage({ params }: Params) {
  const { id } = await params;
  const user = await requireUser(`/projets/${id}`);
  // Même garde que /creer, /importer et /relecture : un projet s'écrit à
  // chaque geste, une session « en tant que » en lecture seule n'y entre pas.
  await requireWritableSession();

  // `getProjectFull` ne rend que ce que la RLS laisse voir, et seulement si
  // la recette est bien un projet : l'identifiant inconnu comme la recette
  // d'un autre tombent sur `notFound()`.
  const project = await getProjectFull(id);
  if (!project) notFound();
  // Projet déjà validé ou dissous : c'est une recette ordinaire.
  if (project.stage !== 'wizard') redirect(`/recette/${id}`);

  // Mode projet perdu (rétrogradation) : le projet reste lisible, rien ne
  // s'écrit plus — jamais de renvoi vers la fiche recette, un projet en
  // cours est un chantier interrompu (docs/abonnements.md §6).
  const [droits, plan, admin] = await Promise.all([getEntitlements(user.id), getCurrentPlan(user.id), isAdmin(user.id)]);
  if (!canAccess(droits, 'mode_projet')) {
    return (
      <>
        <Header />
        <main className="mx-auto mb-24 max-w-container-max px-margin-mobile py-12 md:px-margin-desktop">
          <p className="font-label-md text-label-md uppercase tracking-widest text-secondary">Mode projet</p>
          <h1 className="mb-8 font-headline-lg text-[26px] font-bold leading-tight text-primary md:text-[34px]">
            {project.title === 'Nouveau projet' ? 'Nouveau projet' : project.title}
          </h1>
          <ProjectReadOnly project={project} planLabel={plan?.label ?? 'gratuite'} />
        </main>
        <Footer />
        <MobileNav />
      </>
    );
  }

  const supabase = await createClient();
  const [moldTypes, units, conversions, recipe, trials, ingredientRefs, tags, difficulties, utensilNames, ids, allergenRefs, refAllergens, helpBlocks] =
    await Promise.all([
      getMoldTypes(),
      getUnits(),
      getIngredientConversions(),
      // Portée `edition` : la v2 modifie la photo d'en-tête, dont l'original
      // n'est lu que dans cette portée (comme /creer).
      getRecipeFull(id, 'edition'),
      getProjectTrials(id),
      getIngredientRefsList(),
      getTags(),
      getDifficulties(),
      getUtensilRefNames(),
      // `difficulty_id` n'est pas porté par `RecipeFull` (seule la jointure
      // l'est) : lu à part pour pré-remplir.
      supabase.from('recipes').select('difficulty_id').eq('id', id).maybeSingle(),
      getAllergenRefs(),
      getIngredientRefAllergens(),
      getVisibleHelpBlocks('projet', user.id),
    ]);
  const peutGenererIA = canAccess(droits, 'mode_projet_ia_mensuel');
  const quotaProjetIA = peutGenererIA ? await checkQuota(user.id, 'mode_projet_ia_mensuel') : null;
  // Quota des ajustements par IA des quantités (`ajustement_ia_mensuel`),
  // lecture d'affichage seule : crédits restants à côté de « Ajuster avec l'IA ».
  const quotaAjustementIA = canAccess(droits, 'ajustement_ia_mensuel')
    ? await checkQuota(user.id, 'ajustement_ia_mensuel')
    : null;
  const ligne = (ids.data ?? null) as { difficulty_id: number | null } | null;

  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-container-max px-margin-mobile py-12 md:px-margin-desktop">
        <ProjectV2
          project={project}
          recipe={recipe}
          moldTypes={moldTypes}
          units={units.map((u) => u.name)}
          unitRefs={units.map((u) => ({ id: u.id, name: u.name }))}
          conversions={conversions}
          ingredientRefs={ingredientRefs}
          referenceAllergenes={{ names: allergenRefs.map((a) => a.name), byIngredient: refAllergens }}
          trials={trials}
          peutGenererIA={peutGenererIA}
          quotaProjetIA={quotaProjetIA}
          quotaAjustementIA={quotaAjustementIA}
          tags={tags.map((t) => ({ id: t.id, name: t.name }))}
          difficulties={difficulties.map((d) => ({ id: d.id, name: d.name, level: d.level }))}
          utensilNames={utensilNames}
          difficultyId={ligne?.difficulty_id ?? null}
          peutCreerTag={admin}
          helpBlocks={helpBlocks}
        />
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
