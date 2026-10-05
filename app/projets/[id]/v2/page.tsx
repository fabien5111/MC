import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isAdmin, requireUser } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import { getProjectFull, getProjectTrials } from '@/lib/projects-data';
import { canAccess } from '@/lib/entitlements';
import { getEntitlements } from '@/lib/entitlements-data';
import { getMoldTypes } from '@/lib/admin';
import { getUnits } from '@/lib/profile';
import { getIngredientConversions, getRecipeFull } from '@/lib/recipes';
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

  const [moldTypes, units, conversions, recipe, trials] = await Promise.all([
    getMoldTypes(),
    getUnits(),
    getIngredientConversions(),
    // La recette du projet telle que la fiche la lit : étapes, groupes
    // d'ingrédients, ustensiles, tags, temps… — c'est elle que la v2 montre
    // se construire.
    getRecipeFull(id, 'lecture'),
    getProjectTrials(id),
  ]);

  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[900px] px-margin-mobile py-12 md:px-margin-desktop">
        <ProjectV2
          project={project}
          recipe={recipe}
          moldTypes={moldTypes}
          conversions={conversions}
          unitRefs={units.map((u) => ({ id: u.id, name: u.name }))}
          trialCount={trials.length}
        />
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
