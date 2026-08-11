'use client';

// Formulaire de connexion / inscription + OAuth (Google).
// Le panneau s'ouvre sur la connexion ; l'inscription se fait par bascule et
// impose une confirmation du mot de passe + les règles de `lib/password.ts`.
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { evaluatePassword, PASSWORD_MIN_LENGTH } from '@/lib/password';
import { MaryseIcon } from '@/components/MaryseIcon';

// Couleur des maryses de la jauge de complexité, par nombre de critères
// satisfaits : 1 → noire, 2 → rouge, 3 → orange, 4 (tout ok) → verte.
// Toutes les maryses atteintes partagent la même couleur, comme les paliers
// d'un feu tricolore plutôt qu'un dégradé continu.
const STRENGTH_ICON_COLOR = ['text-outline-variant', 'text-black', 'text-error', 'text-orange-600', 'text-green-600'];

// Traduction des messages d'erreur Supabase Auth les plus courants ; les
// autres remontent tels quels (anglais) plutôt que d'être masqués.
const AUTH_ERRORS: Record<string, string> = {
  'User already registered': 'Un compte existe déjà avec cette adresse e-mail.',
  'Invalid login credentials': 'Adresse e-mail ou mot de passe incorrect.',
  'Email not confirmed': "Confirmez votre adresse e-mail avant de vous connecter (lien envoyé à l'inscription).",
  'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.',
};

function translateAuthError(message: string): string {
  return AUTH_ERRORS[message] ?? message;
}

export function LoginForm({ next, initialMode = 'signin' }: { next: string; initialMode?: 'signin' | 'signup' }) {
  const router = useRouter();
  // Le panneau s'ouvre sur la connexion, sauf arrivée par « Créer un compte »
  // (`/connexion?inscription=1`) : l'en-tête visiteur propose les deux gestes
  // séparément, chacun doit tomber sur le bon formulaire.
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  const strength = useMemo(() => evaluatePassword(password), [password]);
  const mismatch = isSignup && confirm.length > 0 && confirm !== password;
  // À l'inscription seulement : la complexité, la confirmation et
  // l'acceptation des conditions bloquent l'envoi. En connexion, aucun
  // contrôle — les comptes existants peuvent avoir un mot de passe
  // antérieur à ces règles.
  const blocked = isSignup && (!strength.valid || password !== confirm || !terms);

  function toggleMode() {
    setMode(isSignup ? 'signin' : 'signup');
    setConfirm('');
    setError(null);
    setNotice(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (blocked) {
      setError(
        password !== confirm
          ? 'Les deux mots de passe ne correspondent pas.'
          : !terms
            ? "Vous devez accepter les conditions d'utilisation."
            : 'Le mot de passe ne respecte pas les règles de sécurité.',
      );
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        // Avec la confirmation par e-mail activée, Supabase ne renvoie pas
        // d'erreur pour une adresse déjà inscrite (anti-énumération) : il
        // renvoie un utilisateur factice sans identité associée.
        if (data.user && data.user.identities?.length === 0) {
          setError('Un compte existe déjà avec cette adresse e-mail.');
          return;
        }
        setNotice('Vérifiez vos e-mails pour confirmer votre compte.');
      }
    } catch (err) {
      setError(translateAuthError((err as Error).message) || 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: 'google') {
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) setError(error.message);
  }

  const FIELD =
    'w-full bg-transparent border-b border-outline-variant py-3 px-1 focus:outline-none focus:border-primary transition-all duration-300 font-body-md text-body-md placeholder:text-on-surface-variant/40';

  return (
    <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant p-8 md:p-12 transition-all duration-500 hover:shadow-[0_32px_64px_-12px_rgba(74,30,38,0.05)]">
      <div className="text-center mb-10">
        <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-primary mb-2">
          {isSignup ? 'Créer un compte' : 'Bon retour parmi nous'}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {isSignup ? 'Rejoignez la communauté de gourmands' : 'Connectez-vous à votre carnet de pâtisserie'}
        </p>
      </div>

      <div className="space-y-4 mb-8">
        <button
          type="button"
          onClick={() => oauth('google')}
          className="w-full flex items-center justify-center gap-3 py-3 px-6 border border-outline-variant hover:bg-surface-container-low transition-colors duration-300"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          <span className="font-label-md text-label-md text-on-surface">Continuer avec Google</span>
        </button>
      </div>

      <div className="relative flex items-center mb-8">
        <div className="flex-grow border-t border-outline-variant" />
        <span className="flex-shrink mx-4 font-body-md text-on-surface-variant italic">Ou</span>
        <div className="flex-grow border-t border-outline-variant" />
      </div>

      <form onSubmit={submit} className="space-y-6">
        {isSignup && (
          <div className="space-y-1">
            <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="name">
              Nom complet
            </label>
            <input id="name" type="text" placeholder="Jean Dupont" value={fullName} onChange={(e) => setFullName(e.target.value)} className={FIELD} />
          </div>
        )}
        <div className="space-y-1">
          <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="email">
            Adresse e-mail
          </label>
          <input id="email" type="email" required placeholder="nom@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
        </div>
        <div className="space-y-1">
          <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="password">
            Mot de passe
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={isSignup ? PASSWORD_MIN_LENGTH : undefined}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
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

          {isSignup && (
            // Jauge de complexité : une maryse par critère satisfait.
            <div className="pt-3 space-y-2">
              <div className="flex items-center gap-3">
                <div
                  className="flex gap-2"
                  role="progressbar"
                  aria-label="Complexité du mot de passe"
                  aria-valuemin={0}
                  aria-valuemax={strength.total}
                  aria-valuenow={strength.score}
                  aria-valuetext={strength.label}
                >
                  {strength.criteria.map((critere, i) => (
                    <MaryseIcon
                      key={critere.id}
                      size={20}
                      className={`transition-colors duration-300 ${
                        i < strength.score ? STRENGTH_ICON_COLOR[strength.score] : 'text-outline-variant/40'
                      }`}
                    />
                  ))}
                </div>
                <span className="font-label-md text-[12px] text-secondary">
                  {password.length > 0 ? strength.label : ''}
                </span>
              </div>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                {strength.criteria.map((critere) => (
                  <li
                    key={critere.id}
                    className={`flex items-center gap-1 text-[12px] ${
                      critere.ok ? 'text-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px] leading-none">
                      {critere.ok ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    {critere.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!isSignup && (
            <a href="#" className="text-[12px] text-secondary hover:text-primary mt-2 ml-1 inline-block">
              Mot de passe oublié ?
            </a>
          )}
        </div>

        {isSignup && (
          <div className="space-y-1">
            <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="confirm">
              Confirmer le mot de passe
            </label>
            <div className="relative">
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
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
            {mismatch && (
              <p className="text-[12px] text-error mt-2 ml-1">Les deux mots de passe ne correspondent pas.</p>
            )}
          </div>
        )}

        {isSignup && (
          <div className="flex items-start gap-3 py-2">
            <input
              id="terms"
              type="checkbox"
              required
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              aria-invalid={!terms && error === "Vous devez accepter les conditions d'utilisation."}
              className={`mt-1 w-4 h-4 rounded-none accent-primary-container focus:ring-primary-container transition-all cursor-pointer ${
                !terms && error === "Vous devez accepter les conditions d'utilisation." ? 'border-error' : 'border-outline'
              }`}
            />
            <label className="font-body-md text-sm text-on-surface-variant cursor-pointer select-none" htmlFor="terms">
              J&apos;accepte les{' '}
              <a className="text-primary underline underline-offset-4 hover:text-secondary-fixed-dim transition-colors" href="#">
                conditions d&apos;utilisation
              </a>{' '}
              et la politique de confidentialité.
            </label>
          </div>
        )}

        {error && (
          <p className="text-sm text-error text-center">
            {error}
            {error === 'Un compte existe déjà avec cette adresse e-mail.' && (
              <>
                {' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleMode();
                  }}
                  className="underline underline-offset-4 hover:text-error/80"
                >
                  Se connecter
                </a>
              </>
            )}
          </p>
        )}
        {notice && <p className="text-sm text-primary text-center">{notice}</p>}

        <button
          type="submit"
          disabled={busy || blocked}
          className="w-full bg-primary-container text-on-primary py-4 px-8 mt-4 hover:bg-primary transition-all duration-500 active:scale-[0.98] font-label-md text-label-md tracking-widest uppercase disabled:opacity-60"
        >
          {busy ? 'Chargement...' : isSignup ? "S'inscrire" : 'Se connecter'}
        </button>
      </form>

      <div className="mt-10 text-center">
        <p className="font-body-md text-body-md text-on-surface-variant">
          {isSignup ? 'Déjà membre ? ' : 'Pas encore de compte ? '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              toggleMode();
            }}
            className="text-primary font-semibold underline underline-offset-4 hover:text-secondary transition-colors ml-1"
          >
            {isSignup ? 'Se connecter' : 'Créer un compte'}
          </a>
        </p>
      </div>
    </div>
  );
}
