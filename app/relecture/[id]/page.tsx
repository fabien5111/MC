import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser, isAdmin } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import {
  getImport,
  getIngredientRefNames,
  getIngredientRefAllergens,
  getAllergenRefs,
  getUtensilRefNames,
} from '@/lib/imports';
import { getUnits } from '@/lib/profile';
import { getIngredientConversions, getIngredientRefsList } from '@/lib/recipes';
import { getDifficulties, getTags } from '@/lib/taxonomy';
import { getMoldTypes } from '@/lib/admin';
import { getVisibleHelpBlocks } from '@/lib/help';
import { Header } from '@/components/Header';
import { MobileNav } from '@/components/MobileNav';
import { RelectureEditor } from '@/components/RelectureEditor';
import { canAccess, blockingMessage } from '@/lib/entitlements';
import { getCurrentPlan, getEntitlements, getGrid } from '@/lib/entitlements-data';

export const metadata: Metadata = { title: "Relecture d'un import | Je pâtisse !" };

type Params = { params: Promise<{ id: string }> };

export default async function RelecturePage({ params }: Params) {
  const user = await requireUser();
  // Impersonation en lecture seule : la relecture publie/modifie → interdit.
  await requireWritableSession();
  const { id } = await params;
  const numId = Number(id);

  const [importRow, units, refs, refAllergens, allergens, utensilRefs, difficulties, moldTypes, tags, admin, conversions, ingredientRefIds, helpBlocks, droits, grid, currentPlan] = await Promise.all([
    Number.isFinite(numId) ? getImport(numId) : Promise.resolve(null),
    getUnits(),
    getIngredientRefNames(),
    getIngredientRefAllergens(),
    getAllergenRefs(),
    getUtensilRefNames(),
    getDifficulties(),
    getMoldTypes(),
    getTags(),
    isAdmin(user.id),
    getIngredientConversions(),
    getIngredientRefsList(),
    getVisibleHelpBlocks('relecture', user.id),
    getEntitlements(user.id),
    getGrid(),
    getCurrentPlan(user.id),
  ]);
  // Droit d'abonnement : un brouillon laissé après une rétrogradation reste
  // en base (rien n'est supprimé), mais ni relu ni publié tant que le droit
  // n'est pas rétabli — même portée stricte que le mode projet (§5c).
  const peutRelire = canAccess(droits, 'ecran_relecture_import');
  const messageBloque = peutRelire
    ? null
    : blockingMessage(grid, 'ecran_relecture_import', currentPlan?.code ?? '', {
        autorise: false,
        raison: 'PLAN_INSUFFISANT',
        limite: null,
        usage: 0,
      });

  return (
    <>
      <Header current="carnet" />
      <div className="relecture-page">
      {/* `pb-24` : réserve du bouton flottant du sommaire (52 px + marges) —
          la barre d'actions fixe qu'il remplace a disparu. */}
      <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-12 pb-24">
        <Link
          href="/importer"
          className="flex items-center gap-2 text-on-surface-variant hover:text-primary font-label-md text-label-md mb-6 w-fit"
        >
          <span className="material-symbols-outlined">arrow_back</span> Mes imports
        </Link>

        {!importRow ? (
          <div className="text-on-surface-variant italic">
            Import introuvable (ou vous n&apos;y avez pas accès).
          </div>
        ) : !peutRelire ? (
          <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
            <p className="font-label-md text-[15px]">{messageBloque?.titre}</p>
            <p className="mt-2 text-sm text-on-surface-variant">{messageBloque?.corps}</p>
            <Link href="/plans" className="mt-3 inline-block font-label-md text-[13px] text-primary underline">
              Voir les formules
            </Link>
          </div>
        ) : (
          <RelectureEditor
            importRow={importRow}
            units={units.map((u) => u.name)}
            unitRefs={units}
            ingredientRefs={refs}
            refAllergens={refAllergens}
            allergens={allergens}
            utensilRefs={utensilRefs}
            difficulties={difficulties}
            moldTypes={moldTypes}
            tags={tags}
            isAdmin={admin}
            conversions={conversions}
            ingredientRefIds={ingredientRefIds}
            helpBlocks={helpBlocks}
          />
        )}
      </main>
      </div>
      <MobileNav current="carnet" />
    </>
  );
}
