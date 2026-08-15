'use client';

// Changement de mot de passe en autonomie, depuis les réglages du compte.
// Contrairement à `ResetPasswordForm` (atteint via le lien e-mail de
// récupération, qui prouve déjà l'identité), l'utilisateur est ici déjà
// connecté : rien ne garantit que c'est bien lui devant le clavier (poste
// partagé, session laissée ouverte). On revérifie donc le mot de passe actuel
// par un `signInWithPassword` avant d'appliquer le nouveau — Supabase n'offre
// pas d'API dédiée de vérification, mais un second identifiant réussi ne fait
// que rafraîchir la session déjà active, sans effet de bord.
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { evaluatePassword, PASSWORD_MIN_LENGTH } from '@/lib/password';
import { PasswordStrengthGauge } from '@/components/PasswordStrengthGauge';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useMutation } from '@/lib/use-mutation';

const FIELD =
  'w-full bg-transparent border-b border-outline-variant py-3 px-1 focus:outline-none focus:border-primary transition-all duration-300 font-body-md text-body-md placeholder:text-on-surface-variant/40';

export function PasswordChangeCard({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const { busy, mutate } = useMutation();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = useMemo(() => evaluatePassword(password), [password]);
  const mismatch = confirm.length > 0 && confirm !== password;
  const blocked = current.length === 0 || !strength.valid || password !== confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (blocked) {
      setError(
        password !== confirm
          ? 'Les deux mots de passe ne correspondent pas.'
          : current.length === 0
            ? 'Saisissez votre mot de passe actuel.'
            : 'Le nouveau mot de passe ne respecte pas les règles de sécurité.',
      );
      return;
    }
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: current });
        if (reauthError) return { error: { message: 'Mot de passe actuel incorrect.' } };
        return supabase.auth.updateUser({ password });
      },
      { errorLabel: 'Mot de passe', refresh: false },
    );
    if (ok) {
      setCurrent('');
      setPassword('');
      setConfirm('');
      setDone(true);
    }
  }

  if (!hasPassword) {
    return (
      <section className="mt-10 bg-surface-container-lowest border border-outline-variant p-8 md:p-10">
        <h2 className="font-headline-md text-headline-md text-primary mb-2">Mot de passe</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Votre compte est connecté via Google : le mot de passe est géré par Google, pas par Je pâtisse !.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10 bg-surface-container-lowest border border-outline-variant p-8 md:p-10">
      <LoadingOverlay visible={busy} label="Mise à jour du mot de passe…" />
      <h2 className="font-headline-md text-headline-md text-primary mb-6">Mot de passe</h2>
      <form onSubmit={submit} className="space-y-6 max-w-md">
        <div className="space-y-1">
          <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="current-password">
            Mot de passe actuel
          </label>
          <input
            id="current-password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={FIELD}
          />
        </div>

        <div className="space-y-1">
          <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="new-password">
            Nouveau mot de passe
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          <PasswordStrengthGauge password={password} />
        </div>

        <div className="space-y-1">
          <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="confirm-password">
            Confirmer le nouveau mot de passe
          </label>
          <input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch}
            className={`${FIELD} ${mismatch ? 'border-error' : ''}`}
          />
          {mismatch && <p className="text-[12px] text-error mt-2 ml-1">Les deux mots de passe ne correspondent pas.</p>}
        </div>

        {error && <p className="text-sm text-error">{error}</p>}
        {done && <p className="font-body-md text-sm text-primary">Mot de passe mis à jour.</p>}

        <button
          type="submit"
          disabled={busy || blocked}
          className="bg-primary-container text-on-primary py-3 px-8 hover:bg-primary transition-all duration-500 active:scale-[0.98] font-label-md text-label-md tracking-widest uppercase disabled:opacity-60"
        >
          Mettre à jour le mot de passe
        </button>
      </form>
    </section>
  );
}
