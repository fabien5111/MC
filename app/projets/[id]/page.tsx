import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import { getProjectFull } from '@/lib/projects-data';
import { getMoldTypes } from '@/lib/admin';
import { getUnits } from '@/lib/profile';
import { getIngredientConversions } from '@/lib/recipes';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { ProjectWizard } from '@/components/projets/ProjectWizard';

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

  const [project, moldTypes, units, conversions] = await Promise.all([
    getProjectFull(id),
    getMoldTypes(),
    getUnits(),
    // Table de conversions : sert au récapitulatif (étape 6), qui consolide
    // les ingrédients des composants avec la fonction de la fiche recette.
    getIngredientConversions(),
  ]);

  // `getProjectFull` ne rend que ce que la RLS laisse voir, et seulement si
  // la recette est bien un projet. La propriété est donc déjà tenue ; ce
  // `notFound()` couvre l'identifiant inconnu comme la recette d'un autre.
  if (!project) notFound();

  // Projet déjà validé ou dissous : ce n'est plus un chantier, c'est une
  // recette ordinaire — le parcours guidé n'a rien à en faire, sa fiche si.
  if (project.stage !== 'wizard') redirect(`/recette/${id}`);

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
        />
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
