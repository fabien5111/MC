import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isAdmin, requireUser } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import { getProjectFull, getProjectTrials } from '@/lib/projects-data';
import { canAccess } from '@/lib/entitlements';
import { checkQuota, getEntitlements } from '@/lib/entitlements-data';
import { getMoldTypes } from '@/lib/admin';
import { getUnits } from '@/lib/profile';
import { getIngredientConversions, getRecipeFull } from '@/lib/recipes';
import { getDifficulties, getIngredientRefsList, getTags, getUtensilRefNames } from '@/lib/data/reference';
import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { ProjectV2 } from '@/components/projets/v2/ProjectV2';

export const metadata: Metadata = { title: 'Projet (v2) | Je pâtisse !' };
// Même doctrine que la v1 : tout s'enregistre au fil de l'eau et se relit à
// chaque rendu serveur, jamais de cache.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Mode projet v2 — page verticale qui présente le projet comme la recette
// qu'il deviendra (cf. CLAUDE.md « Mode projet v2 »). Réservée aux admins le
// temps de la comparaison avec le parcours actuel : les deux écrans lisent et
// écrivent les MÊMES données, on peut ouvrir un même projet dans l'un puis
// dans l'autre.
export default async function ProjetV2Page({ params }: Params) {
  const { id } = await params;
  const user = await requireUser(`/projets/${id}/v2`);
  // Version d'essai : un membre ordinaire (ou un gestionnaire) qui suivrait
  // le lien retombe sur le parcours actuel, sans message — il n'a rien perdu.
  if (!(await isAdmin(user.id))) redirect(`/projets/${id}`);
  await requireWritableSession();

  const project = await getProjectFull(id);
  if (!project) notFound();
  if (project.stage !== 'wizard') redirect(`/recette/${id}`);

  // Mode projet perdu (rétrogradation) : la v1 sait l'afficher en lecture
  // seule, la v2 n'a pas encore cet état — on y renvoie.
  const droits = await getEntitlements(user.id);
  if (!canAccess(droits, 'mode_projet')) redirect(`/projets/${id}`);

  const supabase = await createClient();
  const [moldTypes, units, conversions, recipe, trials, ingredientRefs, tags, difficulties, utensilNames, ids] =
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
    ]);
  const peutGenererIA = canAccess(droits, 'mode_projet_ia_mensuel');
  const quotaProjetIA = peutGenererIA ? await checkQuota(user.id, 'mode_projet_ia_mensuel') : null;
  const ligne = (ids.data ?? null) as { difficulty_id: number | null } | null;

  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[900px] px-margin-mobile py-12 md:px-margin-desktop">
        <ProjectV2
          project={project}
          recipe={recipe}
          moldTypes={moldTypes}
          units={units.map((u) => u.name)}
          unitRefs={units.map((u) => ({ id: u.id, name: u.name }))}
          conversions={conversions}
          ingredientRefs={ingredientRefs}
          trials={trials}
          peutGenererIA={peutGenererIA}
          quotaProjetIA={quotaProjetIA}
          tags={tags.map((t) => ({ id: t.id, name: t.name }))}
          difficulties={difficulties.map((d) => ({ id: d.id, name: d.name, level: d.level }))}
          utensilNames={utensilNames}
          difficultyId={ligne?.difficulty_id ?? null}
        />
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
