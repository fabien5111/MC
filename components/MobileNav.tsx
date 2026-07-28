// Barre de navigation basse (mobile), partagée (porté de index.html).
// « Créer » n'apparaît que connecté — et jamais pendant une impersonation en
// lecture seule.
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';

export async function MobileNav({ current = '/' }: { current?: string }) {
  const user = await getCurrentUser();
  const readOnly = await isReadOnlySession();
  const cls = (href: string) =>
    `flex flex-col items-center ${current === href ? 'text-primary' : 'text-on-surface-variant'}`;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full bg-surface-container-low border-t border-outline-variant z-50">
      <div className="flex justify-around items-center py-3">
        <Link href="/" className={cls('/')}>
          <span className="material-symbols-outlined">home</span>
          <span className="text-[10px] mt-1 font-label-md">Accueil</span>
        </Link>
        {user && !readOnly && (
          <Link href="/creer" prefetch={false} className={cls('/creer')}>
            <span className="material-symbols-outlined">add_circle</span>
            <span className="text-[10px] mt-1 font-label-md">Créer</span>
          </Link>
        )}
        <Link href="/profil#planning" prefetch={false} className={cls('/planning')}>
          <span className="material-symbols-outlined">calendar_month</span>
          <span className="text-[10px] mt-1 font-label-md">Planning</span>
        </Link>
        <Link href="/profil" prefetch={false} className={cls('/profil')}>
          <span className="material-symbols-outlined">person</span>
          <span className="text-[10px] mt-1 font-label-md">Profil</span>
        </Link>
      </div>
    </nav>
  );
}
