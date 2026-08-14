'use client';

// Demande d'un lien de réinitialisation de mot de passe.
// Message générique après envoi, qu'un compte existe ou non pour l'adresse
// saisie (anti-énumération) : `resetPasswordForEmail` ne renvoie de toute
// façon pas d'erreur distincte dans ce cas.
import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LoadingOverlay } from '@/components/LoadingOverlay';

export function ForgotPasswordForm({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reinitialiser-mot-de-passe')}`,
    });
    if (error) {
      setError(error.message || 'Une erreur est survenue.');
      setBusy(false);
      return;
    }
    setSent(true);
    setBusy(false);
  }

  const FIELD =
    'w-full bg-transparent border-b border-outline-variant py-3 px-1 focus:outline-none focus:border-primary transition-all duration-300 font-body-md text-body-md placeholder:text-on-surface-variant/40';

  return (
    <>
      <LoadingOverlay visible={busy} label="Envoi du lien de réinitialisation…" />
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant p-8 md:p-12 transition-all duration-500 hover:shadow-[0_32px_64px_-12px_rgba(74,30,38,0.05)]">
        <div className="text-center mb-10">
          <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-primary mb-2">
            Mot de passe oublié
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Recevez un lien pour choisir un nouveau mot de passe.
          </p>
        </div>

        {sent ? (
          <p className="text-sm text-primary text-center">
            Si un compte existe avec cette adresse, un e-mail vient de vous être envoyé avec un lien de
            réinitialisation.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-6">
            <div className="space-y-1">
              <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="email">
                Adresse e-mail
              </label>
              <input
                id="email"
                type="email"
                required
                placeholder="nom@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD}
              />
            </div>

            {error && <p className="text-sm text-error text-center">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary-container text-on-primary py-4 px-8 mt-4 hover:bg-primary transition-all duration-500 active:scale-[0.98] font-label-md text-label-md tracking-widest uppercase disabled:opacity-60"
            >
              Envoyer le lien
            </button>
          </form>
        )}

        <div className="mt-10 text-center">
          <Link
            href="/connexion"
            className="text-primary font-semibold underline underline-offset-4 hover:text-secondary transition-colors"
          >
            Retour à la connexion
          </Link>
        </div>
      </div>
    </>
  );
}
