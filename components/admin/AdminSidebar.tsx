'use client';

// Barre latérale partagée de la console admin (portée de admin-*.html).
// L'entrée active est déduite du chemin courant.
//
// Un gestionnaire ne voit que les entrées de son périmètre. Ce filtrage est
// un confort d'affichage, pas une sécurité : l'accès réel est refermé côté
// serveur par `requireFullAdmin()` dans chaque page concernée.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from '@/components/SignOutButton';
import { ADMIN_NAV } from '@/lib/admin-access';
import type { AppRole } from '@/lib/auth';

export function AdminSidebar({ role = 'admin' }: { role?: AppRole }) {
  const pathname = usePathname();
  const nav = role === 'admin' ? ADMIN_NAV : ADMIN_NAV.filter((item) => item.manager);

  return (
    <aside className="flex flex-col h-screen w-64 border-r border-outline-variant bg-surface-container-low z-30 shrink-0 sticky top-0">
      <Link className="p-8 border-b border-outline-variant block" href="/">
        <span className="maryse-logo-font text-3xl text-primary leading-none block">Je pâtisse !</span>
        <p className="text-xs font-medium text-on-surface-variant uppercase tracking-widest mt-1">
          Édition Premium · Admin
        </p>
      </Link>
      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        {nav.map((item) => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded transition-colors ${
                active
                  ? 'bg-primary-container/20 text-primary font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-outline-variant flex flex-col gap-3">
        <Link
          className="flex items-center gap-2 px-4 py-2 rounded font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors"
          href="/"
        >
          <span className="material-symbols-outlined text-sm">logout</span> Retour au site
        </Link>
        <SignOutButton className="w-full text-left font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors px-4 py-2" />
      </div>
    </aside>
  );
}
