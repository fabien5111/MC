import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getImports } from '@/lib/imports';
import { Header } from '@/components/Header';
import { ImporterForm } from '@/components/ImporterForm';

export const metadata: Metadata = { title: 'Importer une recette | Maryse Club' };

const QUOTA_JOUR = 20;

const STATUT_LBL: Record<string, [string, string]> = {
  brouillon: ['Brouillon', 'bg-secondary'],
  verifiee: ['Vérifiée', 'bg-green-700'],
  publiee: ['Publiée', 'bg-primary'],
};

export default async function ImporterPage() {
  const user = await requireUser('/importer');
  const imports = await getImports(user.id);

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
          Depuis une adresse web ou un texte collé : la recette est analysée, convertie au format Maryse
          Club et enregistrée en brouillon privé, que vous pourrez relire et corriger.
        </p>

        <ImporterForm />

        <h2 className="font-headline-md text-headline-md text-primary mb-4 mt-12">Mes imports</h2>
        {imports.length === 0 ? (
          <p className="text-on-surface-variant italic text-sm">Aucun import pour le moment.</p>
        ) : (
          <div className="flex flex-col">
            {imports.map((i) => {
              const recette = (i.recette ?? {}) as { titre?: string };
              const alertes = Array.isArray(i.alertes) ? (i.alertes as string[]) : [];
              const [lbl, cls] = STATUT_LBL[i.statut] || [i.statut, 'bg-secondary'];
              let host = i.source_type === 'texte' ? 'texte collé' : i.source_type;
              if (i.source_url) {
                try {
                  host = new URL(i.source_url).hostname.replace(/^www\./, '');
                } catch {
                  /* URL invalide : on garde le type de source */
                }
              }
              return (
                <Link
                  key={i.id}
                  href={`/relecture/${i.id}`}
                  className="flex items-center gap-3 py-3 border-b border-outline-variant/30 flex-wrap hover:bg-surface-container-low transition-colors group"
                >
                  <span className={`font-label-md text-[11px] px-2.5 py-0.5 rounded-full text-white ${cls}`}>
                    {lbl}
                  </span>
                  <span className="font-body-md flex-1 min-w-[180px] group-hover:text-primary">
                    {recette.titre || 'Sans titre'}
                  </span>
                  <span className="text-sm text-on-surface-variant">{host}</span>
                  {alertes.length > 0 && (
                    <span className="text-sm text-error" title={alertes.join('\n')}>
                      ⚠ {alertes.length}
                    </span>
                  )}
                  <span className="text-sm text-on-surface-variant">
                    {new Date(i.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant group-hover:text-primary">
                    chevron_right
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
