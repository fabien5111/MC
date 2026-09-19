'use client';

// Changement d'adresse e-mail, depuis les réglages du compte.
//
// **Pas de réauthentification par mot de passe ici**, contrairement à
// `PasswordChangeCard` — et ce n'est pas un oubli. La menace qu'elle
// couvrirait (une session laissée ouverte sur un poste partagé, détournée
// pour s'approprier le compte) est déjà couverte en amont par la double
// confirmation de GoTrue (`SECURE_EMAIL_CHANGE_ENABLED`) : le changement
// n'aboutit qu'après avoir cliqué un lien envoyé à l'ADRESSE ACTUELLE, que
// l'intrus ne contrôle pas. Redemander le mot de passe ne faisait que doubler
// cette garantie, au prix d'un champ de plus. Le jour où la double
// confirmation serait désactivée côté serveur, il faudra la rétablir ici.
//
// `updateUser({ email })` ne change rien tout de suite : GoTrue envoie un
// e-mail de confirmation à la nouvelle adresse (et, selon la configuration du
// serveur d'authentification, un second à l'adresse actuelle) — le
// changement n'est effectif qu'après avoir suivi ce lien. Contrairement à une
// connexion Google, ce lien est vérifié par jeton autoporteur
// (`token_hash`/`verifyOtp`, cf. `/auth/callback`), pas par échange PKCE : un
// lien reçu par e-mail est presque toujours ouvert dans un autre contexte de
// navigation que celui qui a fait la demande. La destination après
// confirmation (`/reglages`) est fixée dans le modèle d'e-mail GoTrue lui-même
// — rien à passer ici.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useMutation } from '@/lib/use-mutation';
import { SettingsCard } from '@/components/profile/SettingsCard';

const FIELD =
  'w-full bg-transparent border-b border-outline-variant py-3 px-1 focus:outline-none focus:border-primary transition-all duration-300 font-body-md text-body-md placeholder:text-on-surface-variant/40';

export function EmailChangeCard({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const { busy, mutate } = useMutation();
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirmEmail.length > 0 && confirmEmail !== newEmail;
  const unchanged = newEmail.length > 0 && newEmail.trim().toLowerCase() === email.trim().toLowerCase();
  const blocked = newEmail.length === 0 || newEmail !== confirmEmail || unchanged;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (blocked) {
      setError(
        unchanged ? "C'est déjà votre adresse actuelle." : 'Les deux adresses ne correspondent pas.',
      );
      return;
    }
    const ok = await mutate(async () => createClient().auth.updateUser({ email: newEmail }), {
      errorLabel: 'Adresse e-mail',
      refresh: false,
    });
    if (ok) {
      setNewEmail('');
      setConfirmEmail('');
      setDone(true);
    }
  }

  if (!hasPassword) {
    return (
      <SettingsCard icon="alternate_email" title="Adresse e-mail" count={0}>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Votre compte est connecté via Google : l&apos;adresse e-mail est celle de votre compte Google, elle ne se
          change pas ici.
        </p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard icon="alternate_email" title="Adresse e-mail" count={0}>
      <LoadingOverlay visible={busy} label="Envoi de la demande de changement…" />
      <p className="font-body-md text-body-md text-on-surface-variant mb-6">
        Adresse actuelle : <span className="text-primary">{email}</span>
      </p>
      {/* `autoComplete="off"` sur les deux champs : avec `email`, le navigateur
          y remplit tout seul l'adresse du compte — c'est-à-dire précisément
          celle qu'on cherche à REMPLACER, affichée comme si elle avait été
          saisie. Un champ « nouvelle adresse » pré-rempli avec l'ancienne
          n'aide personne et fait croire à une saisie en cours. */}
      <form onSubmit={submit} className="space-y-6 max-w-md">
        <div className="space-y-1">
          <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="new-email">
            Nouvelle adresse e-mail
          </label>
          <input
            id="new-email"
            type="email"
            required
            autoComplete="off"
            placeholder="vous@exemple.fr"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className={FIELD}
          />
        </div>

        <div className="space-y-1">
          <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="confirm-email">
            Confirmer la nouvelle adresse
          </label>
          <input
            id="confirm-email"
            type="email"
            required
            autoComplete="off"
            placeholder="vous@exemple.fr"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            aria-invalid={mismatch}
            className={`${FIELD} ${mismatch ? 'border-error' : ''}`}
          />
          {mismatch && <p className="text-[12px] text-error mt-2 ml-1">Les deux adresses ne correspondent pas.</p>}
        </div>

        {error && <p className="text-sm text-error">{error}</p>}
        {done && (
          <p className="font-body-md text-sm text-primary">
            Un e-mail de confirmation a été envoyé à la nouvelle adresse. Le changement ne sera effectif qu&apos;après
            avoir cliqué sur le lien reçu — vérifiez aussi votre boîte actuelle si une seconde confirmation vous est
            demandée.
          </p>
        )}

        <button
          type="submit"
          disabled={busy || blocked}
          className="bg-primary-container text-on-primary py-3 px-8 hover:bg-primary transition-all duration-500 active:scale-[0.98] font-label-md text-label-md tracking-widest uppercase disabled:opacity-60"
        >
          Changer d&apos;adresse
        </button>
      </form>
    </SettingsCard>
  );
}
