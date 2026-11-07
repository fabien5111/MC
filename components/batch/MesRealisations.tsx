// « Mes réalisations » (JEP-382) : photos de réalisation des fournées du
// membre — privées, lues sous sa session (RLS propriétaire). Deux usages :
// - fiche recette : photos de toutes SES fournées de cette recette, par
//   fournée (la plus récente d'abord) ;
// - « En cuisine » : grille chronologique de toutes ses photos.
// Un clic sur une photo mène à la fournée qui la porte. Rendu pur, sans état.
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { grouperParFournee, type Realisation } from '@/lib/batch-photos';

function Vignette({ p, avecTitre }: { p: Realisation; avecTitre: boolean }) {
  return (
    <Link
      href={`/fournee/${p.fournee.id}`}
      title={[p.fournee.titre, p.legende].filter(Boolean).join(' — ')}
      className="group flex flex-col gap-1 min-w-0"
    >
      <span className="relative block aspect-square overflow-hidden rounded border border-outline-variant bg-surface-container-high">
        {/* eslint-disable-next-line @next/next/no-img-element -- stockage objet */}
        <img src={p.thumb_url || p.url} alt={p.legende ?? ''} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
      </span>
      {avecTitre && <span className="truncate font-label-md text-[12px] text-primary">{p.fournee.titre}</span>}
      {(avecTitre || p.legende) && (
        <span className="truncate text-[11px] text-on-surface-variant">
          {[avecTitre ? formatDate(p.fournee.date ?? p.created_at) : '', p.legende ?? ''].filter(Boolean).join(' · ')}
        </span>
      )}
    </Link>
  );
}

const GRILLE = 'grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6';

/** Fiche recette : photos groupées par fournée. Rien sans photo. */
export function MesRealisationsRecette({ realisations }: { realisations: Realisation[] }) {
  if (!realisations.length) return null;
  const groupes = grouperParFournee(realisations);
  return (
    <details className="no-print group border border-outline-variant mb-12">
      <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
        <span className="font-label-md text-label-md text-primary">
          MES RÉALISATIONS DE CETTE RECETTE ({realisations.length})
        </span>
        <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
      </summary>
      <div className="p-4 bg-white flex flex-col gap-6">
        <p className="flex items-start gap-1.5 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] shrink-0">lock</span>
          Les photos de vos fournées, visibles de vous seul.
        </p>
        {groupes.map((g) => (
          <div key={g.fourneeId}>
            <Link
              href={`/fournee/${g.fourneeId}`}
              className="mb-2 inline-block font-body-md text-body-md text-primary underline underline-offset-2 hover:text-secondary"
            >
              Fournée du {formatDate(g.date ?? g.photos[0]?.created_at)}
            </Link>
            <div className={GRILLE}>
              {g.photos.map((p) => (
                <Vignette key={p.id} p={p} avecTitre={false} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

/** « En cuisine » : grille chronologique (la plus récente d'abord). Rien sans photo. */
export function MesRealisationsCuisine({ realisations }: { realisations: Realisation[] }) {
  if (!realisations.length) return null;
  return (
    <section id="mes-realisations" className="mt-14 scroll-mt-28 border-t border-outline-variant/60 pt-8">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
          Mes réalisations ({realisations.length})
          <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-180">expand_more</span>
        </summary>
        <p className="mt-4 mb-4 flex items-start gap-1.5 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] shrink-0">lock</span>
          Toutes les photos de vos fournées, visibles de vous seul. Une photo mène à sa fournée.
        </p>
        <div className={GRILLE}>
          {realisations.map((p) => (
            <Vignette key={p.id} p={p} avecTitre />
          ))}
        </div>
      </details>
    </section>
  );
}
