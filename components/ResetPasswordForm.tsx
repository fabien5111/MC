'use client';

// Choix d'un nouveau mot de passe, atteint depuis le lien reçu par e-mail
// (`ForgotPasswordForm` → callback de récupération Supabase, qui pose la
// session avant d'arriver ici). Mêmes règles de complexité qu'à l'inscription
// (`lib/password.ts`, `PasswordStrengthGauge`).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { evaluatePassword, PASSWORD_MIN_LENGTH } from '@/lib/password';
import { PasswordStrengthGauge } from '@/components/PasswordStrengthGauge';
import { LoadingOverlay } from '@/components/LoadingOverlay';

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => evaluatePassword(password), [password]);
  const mismatch = confirm.length > 0 && confirm !== password;
  const blocked = !strength.valid || password !== confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (blocked) {
      setError(
        password !== confirm
          ? 'Les deux mots de passe ne correspondent pas.'
          : 'Le mot de passe ne respecte pas les règles de sécurité.',
      );
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message || 'Une erreur est survenue.');
      setBusy(false);
      return;
    }
    // Pas de reset à false ensuite : on quitte la page, autant garder le
    // spinner affiché jusqu'à la navigation.
    router.replace('/');
    router.refresh();
  }

  const FIELD =
    'w-full bg-transparent border-b border-outline-variant py-3 px-1 focus:outline-none focus:border-primary transition-all duration-300 font-body-md text-body-md placeholder:text-on-surface-variant/40';

  return (
    <>
      <LoadingOverlay visible={busy} label="Mise à jour du mot de passe…" />
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant p-8 md:p-12 transition-all duration-500 hover:shadow-[0_32px_64px_-12px_rgba(74,30,38,0.05)]">
        <div className="text-center mb-10">
          <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-primary mb-2">
            Nouveau mot de passe
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Choisissez un nouveau mot de passe pour votre compte.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-1">
            <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="password">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <input
                id="password"
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
            <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="confirm">
              Confirmer le mot de passe
            </label>
            <input
              id="confirm"
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

          {error && <p className="text-sm text-error text-center">{error}</p>}

          <button
            type="submit"
            disabled={busy || blocked}
            className="w-full bg-primary-container text-on-primary py-4 px-8 mt-4 hover:bg-primary transition-all duration-500 active:scale-[0.98] font-label-md text-label-md tracking-widest uppercase disabled:opacity-60"
          >
            Mettre à jour le mot de passe
          </button>
        </form>
      </div>
    </>
  );
}
