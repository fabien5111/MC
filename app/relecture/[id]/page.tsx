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
import { canAccess, isOverLimit, overLimitMessage } from '@/lib/entitlements';
import { getEntitlements, getGrid, getUsageReport } from '@/lib/entitlements-data';

export const metadata: Metadata = { title: "Relecture d'un import | Je pâtisse !" };

type Params = { params: Promise<{ id: string }> };

export default async function RelecturePage({ params }: Params) {
  const user = await requireUser();
  // Impersonation en lecture seule : la relecture publie/modifie → interdit.
  await requireWritableSession();
  const { id } = await params;
  const numId = Number(id);

  const [importRow, units, refs, refAllergens, allergens, utensilRefs, difficulties, moldTypes, tags, admin, conversions, ingredientRefIds, helpBlocks, droits, grid] = await Promise.all([
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
  ]);
  // Droit d'abonnement — RENVERSEMENT de la portée stricte du lot 5c
  // (docs/abonnements.md §9, qui posait cette page comme bloquée
  // entièrement, sans vue en lecture seule). JEP-130 : un brouillon déjà
  // importé se relit et se publie même sans le droit.
  //
  // Ce qui rend le renversement sûr : la relecture ne rappelle JAMAIS l'IA
  // (aucun appel réseau vers /api dans `RelectureEditor`) — le coût
  // Anthropic a été payé une fois pour toutes à l'import. Ce que le droit
  // garde fermé reste le NOUVEL import, sur /importer. Et le plafond de
  // recettes, lui, est tenu en base par `mc_enforce_stock` : la publication
  // sera refusée si la formule est pleine, quoi qu'affiche cette page.
  const peutRelire = canAccess(droits, 'ecran_relecture_import');

  // Compte des recettes seulement sur ce chemin dégradé : `getUsageReport`
  // vaut cinq comptages (§ « réservé aux écrans de jauges »), à ne pas
  // imposer à la relecture normale. Ici c'est de l'AFFICHAGE — dire avant la
  // saisie si le carnet a encore de la place — jamais un contrôle d'accès.
  const quotaRecettes = peutRelire
    ? null
    : ((await getUsageReport(user.id)).find((l) => l.featureKey === 'recettes_max') ?? null);
  const uniteRecettes = grid.features.find((f) => f.key === 'recettes_max')?.unit ?? null;
  const recettesPleines =
    !!quotaRecettes && !quotaRecettes.unlimited && quotaRecettes.limitValue !== null && isOverLimit(quotaRecettes.usage, quotaRecettes.limitValue);

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
        ) : (
          <>
            {/* Bandeau du chemin dégradé : le brouillon reste relisible et
                publiable, seul un NOUVEL import est fermé. Annoncé ici, en
                tête, et pas découvert au moment d'enregistrer. */}
            {!peutRelire && (
              <div className="mb-8 rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
                <p className="font-label-md text-[15px]">
                  L&apos;import de recettes par IA n&apos;est plus inclus dans votre formule
                </p>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Ce brouillon, lui, reste à vous : vous pouvez le relire, le corriger et l&apos;enregistrer dans
                  votre carnet. Seul un nouvel import demande la formule correspondante.
                </p>
                {recettesPleines ? (
                  <p className="mt-2 text-sm text-error">
                    {overLimitMessage(quotaRecettes!.usage, quotaRecettes!.limitValue!, uniteRecettes)}
                  </p>
                ) : (
                  quotaRecettes &&
                  !quotaRecettes.unlimited &&
                  quotaRecettes.limitValue !== null && (
                    <p className="mt-2 text-sm text-on-surface-variant">
                      Votre carnet compte {quotaRecettes.usage} recette{quotaRecettes.usage > 1 ? 's' : ''} sur les{' '}
                      {quotaRecettes.limitValue} que permet votre formule.
                    </p>
                  )
                )}
                <Link href="/plans" className="mt-3 inline-block font-label-md text-[13px] text-primary underline">
                  Voir les formules
                </Link>
              </div>
            )}
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
          </>
        )}
      </main>
      </div>
      <MobileNav current="carnet" />
    </>
  );
}
