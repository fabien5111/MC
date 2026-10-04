// Contenu d'une entrée de notification — partagé par la cloche de l'en-tête et
// par la page /notifications, pour qu'une même notification ait le même
// aspect aux deux endroits. Rendu pur, sans état.
//
// `nouvelle` = non consultée jusqu'ici : titre et texte en gras. Le gras est
// décidé par l'appelant (il sait ce qui vient d'être vu), jamais déduit ici de
// `readAt` — une notification qu'on vient de marquer lue doit rester en gras
// le temps de la visite.
import type { NotificationRow } from '@/lib/notifications-data';
import { relatif } from '@/lib/notifications-view';

export function NotificationEntree({ n, nouvelle }: { n: NotificationRow; nouvelle: boolean }) {
  return (
    <>
      <p className={`font-label-md text-[13px] ${nouvelle ? 'font-bold text-on-surface' : ''}`}>{n.title}</p>
      <p
        className={`mt-0.5 whitespace-pre-line text-xs ${
          nouvelle ? 'font-semibold text-on-surface' : 'text-on-surface-variant'
        }`}
      >
        {n.body}
      </p>
      <p className="mt-1 text-[11px] text-on-surface-variant/70">{relatif(n.createdAt)}</p>
    </>
  );
}
