import type { Metadata } from 'next';
import { isAdmin, requireUser } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import { getImports } from '@/lib/imports';
import { Header } from '@/components/Header';
import { ImporterForm } from '@/components/ImporterForm';
import { ImporterList } from '@/components/ImporterList';

export const metadata: Metadata = { title: 'Importer une recette | Maryse Club' };

const QUOTA_JOUR = 20;

export default async function ImporterPage() {
  const user = await requireUser('/importer');
  // Impersonation en lecture seule : l'import crée un brouillon → interdit.
  await requireWritableSession();
  const [imports, admin] = await Promise.all([getImports(user.id), isAdmin(user.id)]);

  // Quota du jour (UTC), comme la version vanilla.
  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0);
  const aujourdhui = imports.filter((i) => new Date(i.created_at) >= debutJour).length;

  return (
    <>
      <Header current="/profil" />
      <main className="max-w-[900px] mx-auto px-margin-mobile md:px-margin-desktop py-12">
        <div className="flex items-baseline justify-between flex-wrap gap-4 mb-2">
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary">
            Importer une recette
          </h1>
          <span className="font-label-md text-label-md text-on-surface-variant">
            {aujourdhui} / {QUOTA_JOUR} imports aujourd&apos;hui
          </span>
        </div>
        <p className="text-on-surface-variant mb-8">
          Collez le texte complet d&apos;une recette : elle est analysée, convertie au format Maryse Club
          et enregistrée en brouillon privé, que vous pourrez relire et corriger.
        </p>

        <ImporterForm />

        <h2 className="font-headline-md text-headline-md text-primary mb-4 mt-12">Mes imports</h2>
        <ImporterList imports={imports} isAdmin={admin} />
      </main>
    </>
  );
}
