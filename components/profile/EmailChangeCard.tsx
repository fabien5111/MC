'use client';

// Changement d'adresse e-mail, depuis les réglages du compte. Même doctrine
// que `PasswordChangeCard` : l'utilisateur est déjà connecté, rien ne garantit
// que c'est bien lui devant le clavier (poste partagé, session laissée
// ouverte) — on revérifie donc le mot de passe actuel avant d'envoyer la
// demande de changement.
//
// `updateUser({ email })` ne change rien tout de suite : GoTrue envoie un
// e-mail de confirmation à la nouvelle adresse (et, selon la configuration du
// serveur d'authentification, un second à l'adresse actuelle) — le
// changement n'est effectif qu'après avoir suivi ce lien, qui repasse par
// `/auth/callback` comme une connexion Google ou une confirmation
// d'inscription.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useMutation } from '@/lib/use-mutation';
import { SettingsCard } from '@/components/profile/SettingsCard';

const FIELD =
  'w-full bg-transparent border-b border-outline-variant py-3 px-1 focus:outline-none focus:border-primary transition-all duration-300 font-body-md text-body-md placeholder:text-on-surface-variant/40';

export function EmailChangeCard({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const { busy, mutate } = useMutation();
  const [current, setCurrent] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const mismatch = confirmEmail.length > 0 && confirmEmail !== newEmail;
  const unchanged = newEmail.length > 0 && newEmail.trim().toLowerCase() === email.trim().toLowerCase();
  const blocked = current.length === 0 || newEmail.length === 0 || newEmail !== confirmEmail || unchanged;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (blocked) {
      setError(
        unchanged
          ? "C'est déjà votre adresse actuelle."
          : newEmail !== confirmEmail
            ? 'Les deux adresses ne correspondent pas.'
            : 'Saisissez votre mot de passe actuel.',
      );
      return;
    }
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: current });
        if (reauthError) return { error: { message: 'Mot de passe actuel incorrect.' } };
        return supabase.auth.updateUser(
          { email: newEmail },
          { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reglages')}` },
        );
      },
      { errorLabel: 'Adresse e-mail', refresh: false },
    );
    if (ok) {
      setCurrent('');
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
      <form onSubmit={submit} className="space-y-6 max-w-md">
        <div className="space-y-1">
          <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="current-password-email">
            Mot de passe actuel
          </label>
          <div className="relative">
            <input
              id="current-password-email"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={FIELD}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="new-email">
            Nouvelle adresse e-mail
          </label>
          <input
            id="new-email"
            type="email"
            required
            autoComplete="email"
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
            autoComplete="email"
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
