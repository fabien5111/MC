'use client';

// Cloche de notifications de l'en-tête. Photographie prise au rendu serveur
// (props) : pas de mise à jour en direct entre deux navigations — cohérent
// avec le reste du site, qui n'a nulle part de canal temps réel (WebSocket).
// Une nouvelle notification apparaît à la prochaine navigation ou au prochain
// `router.refresh()`, comme tout le reste de l'interface.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { markNotificationRead } from '@/lib/notification-mark-read';
import type { NotificationRow } from '@/lib/notifications-data';

function relatif(dateIso: string): string {
  const ms = Date.now() - new Date(dateIso).getTime();
  const jours = Math.floor(ms / 86_400_000);
  if (jours <= 0) return "Aujourd'hui";
  if (jours === 1) return 'Hier';
  return `Il y a ${jours} jours`;
}

export function NotificationBell({ notifications }: { notifications: NotificationRow[] }) {
  const [rows, setRows] = useState(notifications);
  const [ouvert, setOuvert] = useState(false);
  const nonLues = rows.filter((n) => !n.readAt).length;

  async function ouvrir() {
    const etaitFerme = !ouvert;
    setOuvert((v) => !v);
    if (!etaitFerme) return;
    // Marquage optimiste, sans spinner ni resynchronisation serveur : une
    // notification lue n'a pas besoin d'un rendu serveur à jour pour
    // paraître lue, le compteur local suffit (même motif que `VoteButton`).
    const nonLuesIds = rows.filter((n) => !n.readAt).map((n) => n.id);
    if (nonLuesIds.length === 0) return;
    setRows((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    const supabase = createClient();
    await Promise.all(nonLuesIds.map((id) => markNotificationRead(supabase, id)));
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
                  <li key={n.id} className="px-4 py-3">
                    <p className="font-label-md text-[13px]">{n.title}</p>
                    <p className="mt-0.5 text-xs text-on-surface-variant">{n.body}</p>
                    <p className="mt-1 text-[11px] text-on-surface-variant/70">{relatif(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
