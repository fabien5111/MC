'use client';

// Déclenchement d'une session « connecté en tant que » (POST
// /api/admin/impersonate), partagé entre Admin → Membres (MembersManager,
// qui pilote son propre bouton par ligne + celui de l'EditPanel via
// `useImpersonateLink`) et le bouton affiché à un admin sur la vitrine
// publique d'un membre (/u/[handle], via `ImpersonateButton`) — même route,
// même panneau de lien temporaire, même journal d'audit.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDialog } from '@/components/Dialog';
import { modeLabel, type ImpersonationMode } from '@/lib/impersonation-types';

export type ImpersonationLink = {
  url: string;
  mode: ImpersonationMode;
  expiresAt: string;
  targetName: string;
};

export function useImpersonateLink() {
  const router = useRouter();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<ImpersonationLink | null>(null);

  async function connect(profileId: string, fallbackName: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: profileId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        dialog.alert(data?.erreur || 'Impossible de générer le lien de connexion.');
        return;
      }
      setLink({ url: data.url, mode: data.mode, expiresAt: data.expiresAt, targetName: data.targetName || fallbackName });
      router.refresh(); // le journal d'audit (Admin → Membres) se met à jour
    } catch (e) {
      dialog.alert('Erreur réseau : ' + ((e as Error).message || 'lien non généré'));
    } finally {
      setBusy(false);
    }
  }

  return { connect, busy, link, clear: () => setLink(null) };
}

const LABEL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

// Lien de connexion temporaire : l'admin doit l'ouvrir dans une fenêtre de
// navigation privée, sinon la session du membre écrase sa propre session
// admin dans la fenêtre courante.
export function ImpersonationLinkPanel({ link, onClose }: { link: ImpersonationLink; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const expire = new Date(link.expiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="bg-surface-bright border border-outline-variant rounded-xl w-full max-w-lg overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
            <h3 className="font-headline-md text-lg font-semibold">Connexion en tant que {link.targetName}</h3>
            <button onClick={onClose} className="text-on-surface-variant hover:text-primary">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            <p className="text-sm">
              Niveau d&apos;accès :{' '}
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                  link.mode === 'write' ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'
                }`}
              >
                {modeLabel(link.mode)}
              </span>{' '}
              <span className="text-on-surface-variant">— hérité de votre profil administrateur.</span>
            </p>

            <div className="flex gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-4">
              <span className="material-symbols-outlined text-primary shrink-0" aria-hidden>
                shield_person
              </span>
              <div className="text-sm space-y-1">
                <p className="font-semibold">
                  Faites un clic droit sur le lien → « Ouvrir dans une fenêtre de navigation privée ».
                </p>
                <p className="text-on-surface-variant">
                  Ouvert dans cette fenêtre, il remplacerait votre session administrateur par celle du membre.
                  Le lien est à usage unique et expire à {expire}.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className={LABEL}>Lien de connexion temporaire</span>
              <div className="flex gap-2 items-center">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex-1 truncate text-xs text-primary underline underline-offset-2"
                  title="Clic droit → Ouvrir dans une fenêtre de navigation privée"
                >
                  {link.url}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(link.url).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 border border-outline-variant rounded text-sm hover:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined text-lg">content_copy</span>
                  {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-outline-variant flex justify-end">
            <button onClick={onClose} className="px-6 py-2.5 bg-primary text-on-primary rounded text-sm font-semibold hover:opacity-90">
              Fermer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Bouton autonome (fetch + modal) pour un contexte hors back-office — la
// vitrine publique d'un membre (/u/[handle]), visible seulement à un admin
// regardant le profil de quelqu'un d'autre.
export function ImpersonateButton({ profileId, name, className }: { profileId: string; name: string; className?: string }) {
  const { connect, busy, link, clear } = useImpersonateLink();
  return (
    <>
      <button
        type="button"
        onClick={() => connect(profileId, name)}
        disabled={busy}
        className={
          className ??
          'flex items-center gap-2 rounded-lg border border-outline-variant px-6 py-3 font-label-md text-label-md text-on-surface-variant transition-all hover:border-primary hover:text-primary disabled:opacity-50'
        }
        title="Connecter en tant que ce membre"
      >
        <span className="material-symbols-outlined text-[18px]">switch_account</span>
        {busy ? 'Génération du lien…' : 'Connecter en tant que'}
      </button>
      {link && <ImpersonationLinkPanel link={link} onClose={clear} />}
    </>
  );
}
