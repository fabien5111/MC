'use client';

// Cloche de notifications de l'en-tête. Photographie prise au rendu serveur
// (props) : pas de mise à jour en direct entre deux navigations — cohérent
// avec le reste du site, qui n'a nulle part de canal temps réel (WebSocket).
// Une nouvelle notification apparaît à la prochaine navigation ou au prochain
// `router.refresh()`, comme tout le reste de l'interface.
//
// La cloche ne montre que les cinq plus récentes ; le reste est sur
// /notifications. La pastille, elle, compte TOUTES les non lues (calculées en
// base par l'en-tête) — pas seulement les cinq affichées.
import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { markNotificationsRead } from '@/lib/notification-mark-read';
import { NotificationEntree } from '@/components/notifications/NotificationEntree';
import type { NotificationRow } from '@/lib/notifications-data';
import { memoriserNouvelles, stockageSession } from '@/lib/notifications-view';

export function NotificationBell({
  userId,
  notifications,
  nonLuesTotal,
}: {
  userId: string;
  notifications: NotificationRow[];
  nonLuesTotal: number;
}) {
  const [rows, setRows] = useState(notifications);
  const [nonLues, setNonLues] = useState(nonLuesTotal);
  // Notifications vues à l'ouverture : elles restent EN GRAS pendant que la
  // liste est ouverte, même si on les marque lues aussitôt après. À la
  // réouverture, elles ne sont plus nouvelles.
  const [nouvelles, setNouvelles] = useState<ReadonlySet<number>>(new Set());
  const [ouvert, setOuvert] = useState(false);

  async function ouvrir() {
    const etaitFerme = !ouvert;
    setOuvert((v) => !v);
    if (!etaitFerme) return;
    const aMarquer = rows.filter((n) => !n.readAt).map((n) => n.id);
    setNouvelles(new Set(aMarquer));
    if (aMarquer.length === 0) return;
    // La page /notifications reprendra ce gras (elles seront lues en base).
    memoriserNouvelles(stockageSession(), userId, aMarquer);
    // Marquage optimiste, sans spinner ni resynchronisation serveur : une
    // notification lue n'a pas besoin d'un rendu serveur à jour pour
    // paraître lue, le compteur local suffit (même motif que `VoteButton`).
    // Seules les notifications AFFICHÉES sont marquées : une plus ancienne,
    // jamais vue, reste non lue (et dans la pastille).
    const maintenant = new Date().toISOString();
    setRows((prev) => prev.map((n) => (aMarquer.includes(n.id) ? { ...n, readAt: maintenant } : n)));
    setNonLues((v) => Math.max(0, v - aMarquer.length));
    await markNotificationsRead(createClient(), aMarquer);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={ouvrir}
        aria-label={nonLues > 0 ? `${nonLues} notification${nonLues > 1 ? 's' : ''} non lue${nonLues > 1 ? 's' : ''}` : 'Notifications'}
        className="relative p-2 text-on-surface-variant transition-colors hover:text-primary"
      >
        <span className="material-symbols-outlined">notifications</span>
        {nonLues > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-on-error">
            {nonLues > 9 ? '9+' : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOuvert(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-lg border border-outline-variant bg-surface-bright shadow-lg">
            <p className="border-b border-outline-variant px-4 py-3 font-label-md text-[13px]">Notifications</p>
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-on-surface-variant">Rien pour l’instant.</p>
            ) : (
              <ul className="divide-y divide-outline-variant">
                {rows.map((n) => (
                  <li key={n.id}>
                    {n.link ? (
                      // Chaque entrée ouvre ce qui la concerne (JEP-278) ; les
                      // anciennes lignes, sans lien, restent un simple texte.
                      <Link
                        href={n.link}
                        onClick={() => setOuvert(false)}
                        className="block px-4 py-3 transition-colors hover:bg-surface-container-low"
                      >
                        <NotificationEntree n={n} nouvelle={nouvelles.has(n.id)} />
                      </Link>
                    ) : (
                      <div className="px-4 py-3">
                        <NotificationEntree n={n} nouvelle={nouvelles.has(n.id)} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/notifications"
              onClick={() => setOuvert(false)}
              className="block border-t border-outline-variant px-4 py-3 text-center text-[13px] font-semibold text-primary transition-colors hover:bg-surface-container-low"
            >
              Voir toutes les notifications
              {nonLues > 0 && (
                <span className="font-normal text-on-surface-variant">
                  {' '}
                  · {nonLues} non lue{nonLues > 1 ? 's' : ''}
                </span>
              )}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
