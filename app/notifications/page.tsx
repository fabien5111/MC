// Toutes les notifications du membre. La cloche n'en montre que 5 ; ici, la
// liste complète, filtrable « Membre / Administrateur » pour un administrateur
// ou un gestionnaire. L'URL est le seul état (`portee`, `n`), comme /idees.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { NotificationsList } from '@/components/notifications/NotificationsList';
import { isManager, requireUser } from '@/lib/auth';
import { listNotifications } from '@/lib/notifications-data';
import {
  LIBELLE_PORTEE,
  NOTIFICATIONS_PAGE,
  PORTEES,
  lirePortee,
  tailleAffichee,
} from '@/lib/notifications-view';

export const metadata: Metadata = { title: 'Notifications | Je pâtisse !' };
export const dynamic = 'force-dynamic';

const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser('/notifications');
  const sp = await searchParams;
  const peutFiltrer = await isManager(user.id);
  const portee = lirePortee(premier(sp.portee), peutFiltrer);
  const shown = tailleAffichee(premier(sp.n));

  const { rows, hasMore } = await listNotifications(user.id, { portee, limite: shown });

  return (
    <>
      <Header />

      <main className="max-w-[900px] mx-auto pb-24 px-margin-mobile md:px-margin-desktop">
        <section className="pt-12 pb-8">
          <h1 className="font-headline-lg text-headline-lg text-primary">Notifications</h1>
          <div className="h-1 w-12 bg-secondary mt-1 mb-4" />
          <p className="text-on-surface-variant max-w-xl">
            Les nouveautés depuis votre dernière visite sont en gras.
          </p>
        </section>

        {peutFiltrer && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className="font-label-md text-label-md text-on-surface-variant mr-1">Afficher</span>
            {PORTEES.map((p) => (
              <Link
                key={p}
                href={p === 'toutes' ? '/notifications' : `/notifications?portee=${p}`}
                className={`px-4 py-1.5 rounded-full text-[13px] font-label-md transition-colors ${
                  portee === p
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                }`}
              >
                {LIBELLE_PORTEE[p]}
              </Link>
            ))}
          </div>
        )}

        <NotificationsList key={portee} rows={rows} />

        {hasMore && (
          <div className="mt-10 text-center">
            <Link
              href={`/notifications?${portee === 'toutes' ? '' : `portee=${portee}&`}n=${shown + NOTIFICATIONS_PAGE}`}
              className="inline-block border-2 border-primary text-primary px-12 py-3.5 rounded-full font-label-md text-[12.5px] uppercase tracking-[0.18em] hover:bg-primary hover:text-on-primary transition-all active:scale-95"
            >
              Charger plus
            </Link>
          </div>
        )}
      </main>

      <Footer />
      <MobileNav />
    </>
  );
}
