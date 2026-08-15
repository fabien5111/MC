'use client';

// Choix du pseudo d'un compte qui n'en a pas encore (`/choix-pseudo`) —
// essentiellement une première connexion Google. Pré-rempli avec le nom du
// profil Google, que l'utilisateur garde ou remplace : c'est un choix, pas
// une reprise silencieuse de son état civil.
//
// L'écriture est faite par `/api/pseudo/choisir` (clé service_role) et non
// par ce composant : le navigateur ne doit pas pouvoir poser un pseudo qui
// n'aurait pas passé l'unicité et le contrôle IA.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import {
  nettoyerSaisiePseudo,
  normaliserCassePseudo,
  PSEUDO_MAX_LENGTH,
  PSEUDO_MIN_LENGTH,
  pseudoSlug,
  validerPseudo,
} from '@/lib/pseudo';

export function PseudoChooser({ next, suggestion }: { next: string; suggestion: string }) {
  const router = useRouter();
  const [pseudo, setPseudo] = useState(suggestion);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validation = validerPseudo(pseudo);
  const slug = validation.ok ? validation.slug : pseudoSlug(pseudo);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/pseudo/choisir', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pseudo: validation.pseudo }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!data?.ok) {
        setError(data?.message || "Le pseudo n'a pas pu être enregistré. Réessayez.");
        setBusy(false);
        return;
      }
      // Pas de `setBusy(false)` : on quitte la page, autant garder le voile
      // jusqu'à la navigation (même parti pris que `LoginForm`).
      router.replace(next);
      router.refresh(); // le pseudo vient d'apparaître dans l'en-tête serveur
    } catch {
      setError('La connexion au serveur a échoué. Réessayez.');
      setBusy(false);
    }
  }

  const FIELD =
    'w-full bg-transparent border-b border-outline-variant py-3 px-1 focus:outline-none focus:border-primary transition-all duration-300 font-body-md text-body-md placeholder:text-on-surface-variant/40';

  return (
    <>
      <LoadingOverlay visible={busy} label="Enregistrement du pseudo…" />
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant p-8 md:p-12">
        <div className="text-center mb-10">
          <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-primary mb-2">
            Choisissez votre pseudo
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            C&apos;est le nom sous lequel la communauté vous connaîtra. Vous pouvez garder celui que nous vous
            proposons ou en choisir un autre.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-1">
            <label className="font-label-md text-label-md text-secondary ml-1" htmlFor="pseudo">
              Pseudo
            </label>
            <input
              id="pseudo"
              type="text"
              required
              autoFocus
              autoComplete="nickname"
              maxLength={PSEUDO_MAX_LENGTH}
              placeholder="MaryseGourmande"
              value={pseudo}
              onChange={(e) => setPseudo(nettoyerSaisiePseudo(e.target.value))}
              onBlur={() => setPseudo((v) => normaliserCassePseudo(v.trim()))}
              className={FIELD}
            />
            <p className="flex items-baseline justify-between gap-3 text-[12px] text-on-surface-variant mt-1 ml-1">
              <span>
                De {PSEUDO_MIN_LENGTH} à {PSEUDO_MAX_LENGTH} caractères.
              </span>
              <span className={pseudo.length >= PSEUDO_MAX_LENGTH ? 'text-error shrink-0' : 'shrink-0'}>
                {pseudo.length}/{PSEUDO_MAX_LENGTH}
              </span>
            </p>
            {slug.length >= PSEUDO_MIN_LENGTH && (
              <p className="text-[12px] text-on-surface-variant ml-1">
                Adresse de votre profil : <span className="text-secondary">jepatisse.com/u/{slug}</span>
              </p>
            )}
          </div>

          {error && <p className="text-sm text-error text-center">{error}</p>}

          <button
            type="submit"
            disabled={busy || !validation.ok}
            className="w-full bg-primary-container text-on-primary py-4 px-8 mt-4 hover:bg-primary transition-all duration-500 active:scale-[0.98] font-label-md text-label-md tracking-widest uppercase disabled:opacity-60"
          >
            Continuer
          </button>
        </form>
      </div>
    </>
  );
}
