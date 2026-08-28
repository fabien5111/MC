'use client';

// Choix du pseudo d'un compte qui n'en a pas encore (`/choix-pseudo`) —
// essentiellement une première connexion Google. Pré-rempli avec le nom du
// profil Google, que l'utilisateur garde ou remplace : c'est un choix, pas
// une reprise silencieuse de son état civil.
//
// L'écriture est faite par `/api/pseudo/choisir` (clé service_role) et non
// par ce composant : le navigateur ne doit pas pouvoir poser un pseudo qui
// n'aurait pas passé l'unicité et le contrôle IA.
//
// Mêmes trois niveaux de contrôle que `LoginForm` (format local → disponibilité
// en direct pendant la frappe, sans IA → vérification complète juste avant
// l'écriture) : un pseudo refusé localement (ex. une liste noire évidente)
// désactive le bouton, mais sans message live le visiteur ne comprend jamais
// pourquoi puisqu'un bouton désactivé ne déclenche jamais `onSubmit`.
import { useEffect, useState } from 'react';
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

// Motif `IdeaForm` / `LoginForm` : vérification bon marché (unicité, pas
// d'IA) débouncée pendant la frappe.
const PSEUDO_CHECK_DEBOUNCE_MS = 300;

export function PseudoChooser({ next, suggestion }: { next: string; suggestion: string }) {
  const router = useRouter();
  const [pseudo, setPseudo] = useState(suggestion);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validation = validerPseudo(pseudo);
  const slug = validation.ok ? validation.slug : pseudoSlug(pseudo);

  // Disponibilité vérifiée EN DIRECT (unicité seule, sans IA) : sans ça, le
  // bouton reste cliquable pour un pseudo déjà pris jusqu'au clic, ce qui
  // ressemble à un bouton qui « ne voit pas » le problème. La vérification
  // qui fait vraiment foi reste celle d'avant l'écriture (`/api/pseudo/choisir`,
  // IA comprise) — celle-ci n'est qu'un confort d'affichage.
  const [pseudoCheck, setPseudoCheck] = useState<'idle' | 'checking' | 'ok' | 'ko'>('idle');
  const [pseudoCheckMessage, setPseudoCheckMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!validation.ok) {
      setPseudoCheck('idle');
      setPseudoCheckMessage(null);
      return;
    }
    setPseudoCheck('checking');
    const controller = new AbortController();
    const candidat = validation.pseudo;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/pseudo/verifier', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pseudo: candidat, verifierIA: false }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
        if (data?.ok) {
          setPseudoCheck('ok');
          setPseudoCheckMessage(null);
        } else {
          setPseudoCheck('ko');
          setPseudoCheckMessage(data?.message || `Le pseudo « ${candidat} » est déjà pris.`);
        }
      } catch {
        // Requête annulée (nouvelle frappe) ou réseau indisponible : ne pas
        // bloquer sur un simple confort d'affichage, la vérification à
        // l'envoi tranchera de toute façon.
        setPseudoCheck('idle');
      }
    }, PSEUDO_CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `validation.pseudo` dérive de `pseudo`, inutile en double dépendance.
  }, [validation.ok, validation.ok ? validation.pseudo : null]);

  const blocked = !validation.ok || pseudoCheck === 'ko';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (blocked) {
      setError(!validation.ok ? validation.message : pseudoCheckMessage || 'Ce pseudo est déjà pris.');
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
            {/* Format local : dès que la saisie est assez longue pour être
                jugée, même si le bouton, désactivé, ne permettrait jamais de
                le découvrir en soumettant. */}
            {pseudo.length > 0 && !validation.ok && (
              <p className="text-[12px] text-error mt-1 ml-1">{validation.message}</p>
            )}
            {validation.ok && pseudoCheck === 'checking' && (
              <p className="text-[12px] text-on-surface-variant mt-1 ml-1">Vérification du pseudo…</p>
            )}
            {validation.ok && pseudoCheck === 'ko' && (
              <p className="text-[12px] text-error mt-1 ml-1">{pseudoCheckMessage}</p>
            )}
          </div>

          {error && <p className="text-sm text-error text-center">{error}</p>}

          <button
            type="submit"
            disabled={busy || blocked}
            className="w-full bg-primary-container text-on-primary py-4 px-8 mt-4 hover:bg-primary transition-all duration-500 active:scale-[0.98] font-label-md text-label-md tracking-widest uppercase disabled:opacity-60"
          >
            Continuer
          </button>
        </form>
      </div>
    </>
  );
}
