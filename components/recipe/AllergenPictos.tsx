// Ligne « Allergènes : » + pictos, réutilisable sur les cartes et la fiche
// recette. Server Component : charge la table de référence (mémoïsée par
// requête) et rapproche chaque nom d'allergène de son picto (insensible à la
// casse et aux accents). Sans correspondance de picto, l'allergène s'affiche en
// texte. Chaque picto porte le libellé de l'allergène en infobulle (title).
import { getAllergensWithPicto } from '@/lib/recipes';

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export async function AllergenPictos({
  names,
  className = '',
  iconClassName = 'w-6 h-6',
}: {
  names: string[];
  className?: string;
  iconClassName?: string;
}) {
  if (!names.length) return null;
  const refs = await getAllergensWithPicto();
  const byName = new Map(refs.map((a) => [norm(a.name), a]));
  const items = names.map((n) => {
    const ref = byName.get(norm(n));
    return { key: norm(n) || n, name: ref?.name ?? n, picto: ref?.picto ?? null };
  });

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
