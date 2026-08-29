import type { Metadata } from 'next';
import { isAdmin, requireUser } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import { getImports } from '@/lib/imports';
import { Header } from '@/components/Header';
import { MobileNav } from '@/components/MobileNav';
import { ImporterForm } from '@/components/ImporterForm';
import { ImporterList } from '@/components/ImporterList';
import Link from 'next/link';
import { canAccess, blockingMessage } from '@/lib/entitlements';
import { getCurrentPlan, getEntitlements, getGrid } from '@/lib/entitlements-data';

export const metadata: Metadata = { title: 'Importer une recette | Je pâtisse !' };

const QUOTA_JOUR = 20;

export default async function ImporterPage() {
  const user = await requireUser('/importer');
  // Impersonation en lecture seule : l'import crée un brouillon → interdit.
  await requireWritableSession();
  const [imports, admin, droits, grid, currentPlan] = await Promise.all([
    getImports(user.id),
    isAdmin(user.id),
    getEntitlements(user.id),
    getGrid(),
    getCurrentPlan(user.id),
  ]);
  // Droit d'abonnement : l'historique des imports reste visible quoi qu'il
  // arrive (§7.4, l'existant est préservé) — seul le formulaire de NOUVEL
  // import est bridé.
  const peutImporter = canAccess(droits, 'ecran_relecture_import');
  const messageBloque = peutImporter
    ? null
    : blockingMessage(grid, 'ecran_relecture_import', currentPlan?.code ?? '', {
        autorise: false,
        raison: 'PLAN_INSUFFISANT',
        limite: null,
        usage: 0,
      });

  // Quota du jour (UTC), comme la version vanilla.
  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0);
  const aujourdhui = imports.filter((i) => new Date(i.created_at) >= debutJour).length;

  return (
    <>
      <Header current="carnet" />
      <main className="max-w-[900px] mx-auto px-margin-mobile md:px-margin-desktop py-12 pb-28 lg:pb-12">
        <div className="flex items-baseline justify-between flex-wrap gap-4 mb-2">
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary">
            Importer une recette
          </h1>
          <span className="font-label-md text-label-md text-on-surface-variant">
            {aujourdhui} / {QUOTA_JOUR} imports aujourd&apos;hui
          </span>
        </div>
        <p className="text-on-surface-variant mb-8">
          Collez le texte complet d&apos;une recette : elle est analysée, convertie au format du site
          et enregistrée en brouillon privé, que vous pourrez relire et corriger.
        </p>

        {peutImporter ? (
          <ImporterForm />
        ) : (
          messageBloque && (
            <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
              <p className="font-label-md text-[15px]">{messageBloque.titre}</p>
              <p className="mt-2 text-sm text-on-surface-variant">{messageBloque.corps}</p>
              <Link href="/plans" className="mt-3 inline-block font-label-md text-[13px] text-primary underline">
                Voir les formules
              </Link>
            </div>
          )
        )}

        <h2 className="font-headline-md text-headline-md text-primary mb-4 mt-12">Mes imports</h2>
        <ImporterList imports={imports} isAdmin={admin} />
      </main>
      <MobileNav current="carnet" />
    </>
  );
}
