'use client';

// Liste de la page /notifications. Les notifications non lues à l'arrivée
// s'affichent en gras ET sont marquées lues aussitôt (ouvrir la page vaut
// consultation). Le gras vit dans un état local : la resynchronisation serveur
// qui suit les rend « lues », il ne doit pas disparaître pendant la visite.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { markNotificationsRead } from '@/lib/notification-mark-read';
import { nouvellesAConsulter } from '@/lib/notifications-view';
import type { NotificationRow } from '@/lib/notifications-data';
import { NotificationEntree } from './NotificationEntree';

export function NotificationsList({ rows }: { rows: NotificationRow[] }) {
  const router = useRouter();
  const [gras, setGras] = useState<Set<number>>(() => new Set());
  const vus = useRef<Set<number>>(new Set());

  useEffect(() => {
    const ids = nouvellesAConsulter(rows, vus.current);
    if (ids.length === 0) return;
    ids.forEach((id) => vus.current.add(id));
    setGras((prev) => new Set([...prev, ...ids]));
    void markNotificationsRead(createClient(), ids).then(() => router.refresh());
  }, [rows, router]);

  if (rows.length === 0) {
    return <p className="text-on-surface-variant italic">Aucune notification.</p>;
  }

  return (
    <ul className="divide-y divide-outline-variant rounded-lg border border-outline-variant bg-surface-bright">
      {rows.map((n) => {
        const entree = <NotificationEntree n={n} nouvelle={gras.has(n.id)} />;
        return (
          <li key={n.id}>
            {n.link ? (
              <Link href={n.link} className="block px-4 py-3 transition-colors hover:bg-surface-container-low">
                {entree}
              </Link>
            ) : (
              <div className="px-4 py-3">{entree}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
