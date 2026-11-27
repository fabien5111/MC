import { StockageEnLigneProvider } from '@/components/stockage/StockageEnLigneProvider';
import { stockageEnLigne } from '@/lib/stockage-en-ligne-data';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isAdmin, requireUser } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import { getProjectFull, getProjectTrials } from '@/lib/projects-data';
import { canAccess } from '@/lib/entitlements';
import { checkQuota, getCurrentPlan, getEntitlements } from '@/lib/entitlements-data';
import { CLE_CREDITS_IA } from '@/lib/credits-ia';
import { etatRedaction } from '@/lib/redaction-ia-data';
import { getMoldTypes } from '@/lib/admin';
import { getUnits } from '@/lib/profile';
import { getIngredientConversions, getIngredientDensities, getRecipeFull } from '@/lib/recipes';
import { getAllergenRefs, getDifficulties, getIngredientRefAllergens, getIngredientRefsList, getTags, getUtensilRefNames } from '@/lib/data/reference';
import { createClient } from '@/lib/supabase/server';
import { getRemarques, getRemarquesEssais } from '@/lib/batch-lecons-data';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { getVisibleHelpBlocks } from '@/lib/help';
import { ProjectV2 } from '@/components/projets/v2/ProjectV2';
import { ProjectReadOnly } from '@/components/projets/ProjectReadOnly';
import { ProjectTrials } from '@/components/projets/ProjectTrials';
import Link from 'next/link';

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
  // Projet validé (JEP-430) : c'est une recette ordinaire, mais sa page projet
  // reste — résumé du projet et fournées d'essai, qui ne sont pas sur la fiche.
  if (project.stage === 'ready' || project.stage === 'dissolved') {
    return <ProjetValidePage id={id} project={project} />;
  }
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
  const [moldTypes, units, conversions, recipe, trials, ingredientRefs, tags, difficulties, utensilNames, ids, allergenRefs, refAllergens, helpBlocks, ingredientDensities] =
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
      getIngredientDensities(),
    ]);
  const peutGenererIA = canAccess(droits, 'mode_projet_ia_mensuel');
  const quotaProjetIA = peutGenererIA ? await checkQuota(user.id, CLE_CREDITS_IA) : null;
  // Quota des ajustements par IA des quantités (`ajustement_ia_mensuel`),
  // lecture d'affichage seule : crédits restants à côté de « Ajuster avec l'IA ».
  const quotaAjustementIA = canAccess(droits, 'ajustement_ia_mensuel')
    ? await checkQuota(user.id, CLE_CREDITS_IA)
    : null;
  // Retours de mes fournées d'essai (JEP-381) : un essai est une fournée du
  // projet. Best-effort : un échec ne coûte que ces retours.
  const [remarques, remarquesEssais] = await Promise.all([
    getRemarques({ userId: user.id, recipeId: id, essais: true }).catch(() => null),
    getRemarquesEssais(id),
  ]);
  const ligne = (ids.data ?? null) as { difficulty_id: number | null } | null;

  return (
    <>
      <Header />
      <StockageEnLigneProvider valeur={stockageEnLigne(droits)}>
      <main className="mx-auto mb-24 max-w-container-max px-margin-mobile py-12 md:px-margin-desktop">
        <ProjectV2
          project={project}
          recipe={recipe}
          moldTypes={moldTypes}
          units={units.map((u) => u.name)}
          unitRefs={units.map((u) => ({ id: u.id, name: u.name }))}
          conversions={conversions}
          ingredientDensities={ingredientDensities}
          ingredientRefs={ingredientRefs}
          referenceAllergenes={{ names: allergenRefs.map((a) => a.name), byIngredient: refAllergens }}
          trials={trials}
          remarques={remarques}
          userId={user.id}
          remarquesEssais={remarquesEssais}
          peutGenererIA={peutGenererIA}
          quotaProjetIA={quotaProjetIA}
          quotaAjustementIA={quotaAjustementIA}
          redactionIA={await etatRedaction(user.id)}
          tags={tags.map((t) => ({ id: t.id, name: t.name }))}
          difficulties={difficulties.map((d) => ({ id: d.id, name: d.name, level: d.level }))}
          utensilNames={utensilNames}
          difficultyId={ligne?.difficulty_id ?? null}
          peutCreerTag={admin}
          helpBlocks={helpBlocks}
        />
      </main>
      </StockageEnLigneProvider>
      <Footer />
      <MobileNav centre="actions" />
    </>
  );
}

// Page d'un projet validé (JEP-430) : lecture seule. Les fournées d'essai non
// envoyées dans la recette n'apparaissent qu'ici ; verdict et retours restent
// consultables (et le verdict modifiable), relancer un essai passe par la fiche.
async function ProjetValidePage({ id, project }: { id: string; project: NonNullable<Awaited<ReturnType<typeof getProjectFull>>> }) {
  const [recipe, trials, remarquesEssais] = await Promise.all([getRecipeFull(id, 'lecture'), getProjectTrials(id, false), getRemarquesEssais(id)]);
  const essais = trials.filter((t) => t.essai);
  const envoyees = trials.length - essais.length;
  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-container-max px-margin-mobile py-12 md:px-margin-desktop">
        <p className="font-label-md text-label-md uppercase tracking-widest text-secondary">Mode projet</p>
        <h1 className="mb-3 font-headline-lg text-[26px] font-bold leading-tight text-primary md:text-[34px]">{project.title}</h1>
        <ProjectReadOnly
          project={project}
          bandeau={
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant bg-surface-container p-5">
              <span className="rounded bg-green-700 px-2 py-0.5 font-label-md text-[12px] text-white">Projet validé</span>
              <p className="min-w-0 flex-1 text-sm text-on-surface-variant">
                Ce projet est devenu une recette de votre carnet. Ses fournées d’essai restent ici
                {envoyees > 0 ? ` ; ${envoyees} fournée${envoyees > 1 ? 's ont été envoyées' : ' a été envoyée'} dans la recette.` : '.'}
              </p>
              <Link href={`/recette/${id}`} className="font-label-md text-[13px] font-semibold text-primary underline">
                Voir la recette
              </Link>
            </div>
          }
          apres={
            recipe && essais.length > 0 ? (
              <section>
                <ProjectTrials recipe={recipe} trials={essais} unresolved={[]} canLaunch={false} retoursEssais={remarquesEssais} />
              </section>
            ) : (
              <p className="text-sm italic text-on-surface-variant">Aucune fournée d’essai à afficher.</p>
            )
          }
        />
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
