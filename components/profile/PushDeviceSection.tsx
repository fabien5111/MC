'use client';

// « Notifications sur cet appareil » (Web Push), en tête du bloc Notifications
// de /reglages. L'état affiché est celui de CE navigateur — il est le seul à
// savoir s'il est abonné (`pushManager.getSubscription()`) — complété du nombre
// d'appareils du membre lu côté serveur.
//
// Règles imposées par les navigateurs, à ne pas contourner :
//  - l'autorisation ne se demande qu'en réponse à un clic (iOS la refuse
//    sinon, Chrome finit par la masquer) ;
//  - sur iPhone/iPad, le push n'existe que pour un site AJOUTÉ À L'ÉCRAN
//    D'ACCUEIL (iOS ≥ 16.4) : dans Safari, `PushManager` est absent. On
//    l'explique plutôt que d'afficher « non pris en charge », qui se lirait
//    comme définitif ;
//  - une autorisation refusée ne se redemande pas par script : seul le
//    réglage du navigateur la rétablit.
//
// Absent pendant une connexion « en tant que », quel qu'en soit le mode :
// l'appareil est celui de l'administrateur (la route le refuse aussi).
import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { useImpersonation } from '@/components/ImpersonationProvider';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { cleVapidVersOctets } from '@/lib/push';

type Etat =
  | 'chargement'
  | 'indisponible' // clés VAPID absentes côté serveur
  | 'non-supporte'
  | 'ios-a-installer'
  | 'refuse'
  | 'inactif'
  | 'actif';

function estIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function estInstallee(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function enregistrement(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker.getRegistration('/')) ?? null;
  } catch {
    return null;
  }
}

async function envoyerAuServeur(methode: 'POST' | 'DELETE', corps: unknown): Promise<{ error: { message: string } | null }> {
  try {
    const r = await fetch('/api/push/abonnement', {
      method: methode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    return { error: r.ok ? null : { message: j.message ?? `erreur ${r.status}` } };
  } catch (e) {
    return { error: { message: (e as Error).message || 'réseau indisponible' } };
  }
}

export function PushDeviceSection({ clePublique, appareils }: { clePublique: string | null; appareils: number | null }) {
  const [etat, setEtat] = useState<Etat>('chargement');
  const [preparation, setPreparation] = useState(false);
  const { mutate, busy } = useMutation();
  const dialog = useDialog();
  const impersonation = useImpersonation();

  const diagnostiquer = useCallback(async (): Promise<Etat> => {
    if (!clePublique) return 'indisponible';
    if (estIOS() && !estInstallee()) return 'ios-a-installer';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return 'non-supporte';
    }
    if (Notification.permission === 'denied') return 'refuse';
    const reg = await enregistrement();
    if (!reg) return 'non-supporte';
    const abonnement = await reg.pushManager.getSubscription().catch(() => null);
    if (!abonnement) return 'inactif';
    // Resynchronisation silencieuse : la ligne serveur a pu être purgée, ou un
    // autre membre s'est connecté sur ce navigateur — l'appareil suit la
    // personne connectée. Idempotent, échec ignoré (lecture seule comprise).
    void envoyerAuServeur('POST', abonnement.toJSON());
    return 'actif';
  }, [clePublique]);

  useEffect(() => {
    if (impersonation) return;
    let actif = true;
    diagnostiquer().then((e) => actif && setEtat(e));
    return () => {
      actif = false;
    };
  }, [diagnostiquer, impersonation]);

  async function activer() {
    if (!clePublique) return;
    setPreparation(true);
    let abonnement: PushSubscription | null = null;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setEtat(permission === 'denied' ? 'refuse' : 'inactif');
        return;
      }
      const reg = await enregistrement();
      if (!reg) {
        setEtat('non-supporte');
        return;
      }
      const options = { userVisibleOnly: true, applicationServerKey: cleVapidVersOctets(clePublique) };
      try {
        abonnement = await reg.pushManager.subscribe(options);
      } catch {
        // Abonnement antérieur signé par une autre clé (clés VAPID changées) :
        // le navigateur refuse d'en créer un second tant que l'ancien existe.
        await (await reg.pushManager.getSubscription())?.unsubscribe();
        abonnement = await reg.pushManager.subscribe(options);
      }
    } catch (e) {
      await dialog.alert(`Activation impossible : ${(e as Error).message || 'erreur du navigateur'}`);
      return;
    } finally {
      setPreparation(false);
    }
    const sub = abonnement;
    const ok = await mutate(() => envoyerAuServeur('POST', sub.toJSON()), {
      errorLabel: 'Notifications sur cet appareil',
    });
    if (ok) setEtat('actif');
    // Le serveur a refusé : pas d'abonnement orphelin côté navigateur.
    else await sub.unsubscribe().catch(() => {});
  }

  async function desactiver() {
    const reg = await enregistrement();
    const abonnement = await reg?.pushManager.getSubscription().catch(() => null);
    if (!abonnement) {
      setEtat('inactif');
      return;
    }
    const endpoint = abonnement.endpoint;
    const ok = await mutate(() => envoyerAuServeur('DELETE', { endpoint }), {
      errorLabel: 'Notifications sur cet appareil',
    });
    if (!ok) return;
    await abonnement.unsubscribe().catch(() => {});
    setEtat('inactif');
  }

  async function essayer() {
    setPreparation(true);
    try {
      const r = await fetch('/api/push/test', { method: 'POST' });
      const j = (await r.json().catch(() => ({}))) as { atteints?: number; message?: string };
      if (!r.ok) await dialog.alert(j.message ?? `Essai impossible (erreur ${r.status}).`);
      else if (!j.atteints) await dialog.alert('Aucun appareil n’a pu être joint. Désactivez puis réactivez les notifications.');
    } finally {
      setPreparation(false);
    }
  }

  if (impersonation || etat === 'chargement' || etat === 'indisponible') return null;

  const bouton =
    'rounded-full bg-primary px-6 py-2 text-[13px] font-semibold text-on-primary hover:opacity-90 transition-all';

  return (
    <div className="mb-6 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-4">
      <LoadingOverlay visible={busy || preparation} label="Notifications…" />
      <p className="flex items-center gap-2 font-label-md text-[15px] font-semibold text-on-surface">
        <span className="material-symbols-outlined text-[20px]" aria-hidden>
          smartphone
        </span>
        Notifications sur cet appareil
      </p>
      {etat === 'actif' && (
        <>
          <p className="mt-1 text-sm text-on-surface-variant">
            Activées : les notifications cochées « Sur le téléphone » ci-dessous s’affichent sur cet appareil, même
            site fermé.
            {appareils != null && appareils > 1 && ` Vous les recevez sur ${appareils} appareils.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={essayer} className={bouton}>
              Envoyer une notification d’essai
            </button>
            <button type="button" onClick={desactiver} className="text-sm text-on-surface-variant underline">
              Désactiver sur cet appareil
            </button>
          </div>
        </>
      )}
      {etat === 'inactif' && (
        <>
          <p className="mt-1 text-sm text-on-surface-variant">
            Recevez vos rappels de fournée et les nouvelles de vos recettes directement sur cet appareil, même site
            fermé. Votre navigateur vous demandera l’autorisation.
          </p>
          <button type="button" onClick={activer} className={`${bouton} mt-3`}>
            Activer sur cet appareil
          </button>
        </>
      )}
      {etat === 'ios-a-installer' && (
        <p className="mt-1 text-sm text-on-surface-variant">
          Sur iPhone et iPad, les notifications ne sont possibles que depuis l’application installée : dans Safari,
          appuyez sur l’icône Partager, puis « Sur l’écran d’accueil ». Ouvrez ensuite Je pâtisse ! depuis cette icône
          et revenez ici.
        </p>
      )}
      {etat === 'refuse' && (
        <p className="mt-1 text-sm text-on-surface-variant">
          Les notifications ont été refusées pour ce site. Pour les rétablir, autorisez-les dans les réglages de votre
          navigateur (icône à gauche de l’adresse, ou réglages du site), puis rechargez cette page.
        </p>
      )}
      {etat === 'non-supporte' && (
        <p className="mt-1 text-sm text-on-surface-variant">
          Ce navigateur ne permet pas de recevoir les notifications. Vous les retrouvez dans la cloche et, selon vos
          réglages, par e-mail.
        </p>
      )}
    </div>
  );
}
