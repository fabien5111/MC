// Bandeau « imports en attente de relecture » du carnet : un import n'entre au
// carnet qu'une fois relu. Rendu pur, partagé par la grille (`CarnetContent`) et
// par la rubrique « Carnet CAP » (JEP-6), où il se place au-dessus du bandeau
// d'information.
import Link from 'next/link';

export function ImportsEnAttente({ nombre, className = '' }: { nombre: number; className?: string }) {
  if (nombre <= 0) return null;
  return (
    <Link
      href="/importer"
      prefetch={false}
      className={`flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 transition-colors hover:border-primary ${className}`}
    >
      <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden>
        inbox
      </span>
      <span className="font-body-md text-sm text-on-surface">
        {nombre} import{nombre > 1 ? 's' : ''} en attente de relecture — un import n&apos;entre au carnet qu&apos;une fois
        relu.
      </span>
      <span className="material-symbols-outlined ml-auto text-[20px] text-on-surface-variant" aria-hidden>
        chevron_right
      </span>
    </Link>
  );
}
