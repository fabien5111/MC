// Rendu pur de la ligne « Allergènes : » + pictos, à partir d'items déjà
// résolus (nom + picto). Pas d'accès Supabase — réutilisable côté serveur
// (AllergenPictos) comme dans un Client Component (cartes paginées).
import type { AllergenPictoItem } from '@/lib/recipe-view';

export function AllergenPictosView({
  items,
  className = '',
  iconClassName = 'w-6 h-6',
}: {
  items: AllergenPictoItem[];
  className?: string;
  iconClassName?: string;
}) {
  if (!items.length) return null;
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px]">
        Allergènes :
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {items.map((a) =>
          a.picto ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL stockée en base
            <img key={a.key} src={a.picto} alt={a.name} title={a.name} className={`${iconClassName} object-contain`} />
          ) : (
            <span
              key={a.key}
              title={a.name}
              className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface text-[11px] font-label-md"
            >
              {a.name}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
