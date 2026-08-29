import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import { getProjectFull, getProjectTrials } from '@/lib/projects-data';
import { canAccess } from '@/lib/entitlements';
import { getCurrentPlan, getEntitlements } from '@/lib/entitlements-data';
import { getMoldTypes } from '@/lib/admin';
import { getUnits } from '@/lib/profile';
import { getIngredientConversions, getRecipeFull } from '@/lib/recipes';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { ProjectWizard } from '@/components/projets/ProjectWizard';
import { ProjectReadOnly } from '@/components/projets/ProjectReadOnly';

export const metadata: Metadata = { title: 'Projet | Je pâtisse !' };
// Jamais de cache : le dialogue est enregistré au fil de l'eau et relu à
// chaque rendu serveur (cf. ProjectWizard — la liste des composants vient
// des props, jamais d'un miroir local).
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export default async function ProjetPage({ params }: Params) {
  const { id } = await params;
  const user = await requireUser(`/projets/${id}`);
  // Même garde que /creer, /importer et /relecture : un projet s'écrit à
  // chaque geste, une session « en tant que » en lecture seule n'y entre pas.
  await requireWritableSession();

  // `getProjectFull` ne rend que ce que la RLS laisse voir, et seulement si
  // la recette est bien un projet. La propriété est donc déjà tenue ; ce
  // `notFound()` couvre l'identifiant inconnu comme la recette d'un autre.
  const project = await getProjectFull(id);
  if (!project) notFound();

  // Projet déjà validé ou dissous : ce n'est plus un chantier, c'est une
  // recette ordinaire — le parcours guidé n'a rien à en faire, sa fiche si.
  if (project.stage !== 'wizard') redirect(`/recette/${id}`);

  // Mode projet perdu (rétrogradation) : le projet reste entièrement lisible,
  // rien ne s'écrit plus. On ne redirige jamais vers la fiche recette — un
  // projet en cours n'est pas une recette utilisable en l'état, c'est un
  // chantier interrompu (cf. docs/abonnements.md §6, point tranché). Vérifié
  // avant les lectures propres au parcours interactif (moules, unités,
  // conversions, fournée d'essai) : elles ne servent à rien dans ce cas.
  const [droits, plan] = await Promise.all([getEntitlements(user.id), getCurrentPlan(user.id)]);
  if (!canAccess(droits, 'mode_projet')) {
    return (
      <>
        <Header />
        <main className="mx-auto mb-24 max-w-[900px] px-margin-mobile py-12 md:px-margin-desktop">
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

  const [moldTypes, units, conversions, recipe, trials] = await Promise.all([
    getMoldTypes(),
    getUnits(),
    // Table de conversions : sert au récapitulatif (étape 6), qui consolide
    // les ingrédients des composants avec la fonction de la fiche recette.
    getIngredientConversions(),
    // Recette du projet telle que le moteur de fournée la lit : une fournée
    // d'essai passe exactement par le même chemin que celle d'une recette
    // ordinaire (cf. lib/batch-write.ts).
    getRecipeFull(id),
    getProjectTrials(id),
  ]);

  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[900px] px-margin-mobile py-12 md:px-margin-desktop">
        <p className="font-label-md text-label-md uppercase tracking-widest text-secondary">Mode projet</p>
        <h1 className="mb-8 font-headline-lg text-[26px] font-bold leading-tight text-primary md:text-[34px]">
          {project.title === 'Nouveau projet' ? 'Nouveau projet' : project.title}
        </h1>
        <ProjectWizard
          project={project}
          moldTypes={moldTypes}
          units={units.map((u) => u.name)}
          conversions={conversions}
          unitRefs={units.map((u) => ({ id: u.id, name: u.name }))}
          recipe={recipe}
          trials={trials}
        />
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
