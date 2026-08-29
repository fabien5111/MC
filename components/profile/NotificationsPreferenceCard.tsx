'use client';

// Préférence de notification (spec §10) : un seul réglage, « recevoir les
// notifications d'abonnement par e-mail ». Ne conditionne QUE l'e-mail — les
// notifications in-app d'expiration restent affichées quoi qu'il arrive,
// puisqu'elles conditionnent l'accès au service (cf. la cloche de l'en-tête).
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { SettingsCard } from '@/components/profile/SettingsCard';

export function NotificationsPreferenceCard({ userId, notifyEmail }: { userId: string; notifyEmail: boolean }) {
  const { mutate, busy } = useMutation();
  const [active, setActive] = useState(notifyEmail);

  async function basculer() {
    const suivant = !active;
    setActive(suivant);
    const ok = await mutate(
      () => createClient().from('profiles').update({ notify_email: suivant } as never).eq('id', userId),
      { refresh: false, errorLabel: 'Préférence de notification' },
    );
    if (!ok) setActive(!suivant);
  }

  return (
    <SettingsCard icon="notifications" title="Notifications" count={0}>
      <LoadingOverlay visible={busy} label="Mise à jour…" />
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="font-body-md text-sm text-on-surface">
          Recevoir les notifications d’abonnement par e-mail
          <span className="mt-1 block text-xs text-on-surface-variant">
            Fin d’essai, échéance approchante, expiration. Les alertes affichées ici, dans le site, restent visibles
            quel que soit ce réglage.
          </span>
        </span>
        <input
          type="checkbox"
          checked={active}
          onChange={basculer}
          className="h-5 w-5 shrink-0 accent-primary"
        />
      </label>
    </SettingsCard>
  );
}
