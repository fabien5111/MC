'use client';

// Rédaction des textes d'une recette par IA (JEP-414) — composants communs aux
// trois éditeurs : `/creer`, relecture d'import, mode projet.
//
// - `RedactionIAProvider` : posé par l'éditeur, il porte le droit, le solde et
//   la recette telle qu'elle est à l'écran (`recette`, recalculée à chaque
//   rendu, lue au clic seulement). Sans fournisseur, aucun bouton n'apparaît.
// - `BoutonRedaction` : sous un champ ; propose un texte, que le membre relit
//   et modifie avant « Ajouter » (ligne vide entre l'existant et l'ajout) ou
//   « Remplacer ». Rien n'est enregistré : le formulaire l'est par son propre
//   bouton (ou l'enregistrement automatique du mode projet).
// - `FenetreCompletion` : « Compléter avec l'IA », tous les champs vides en un
//   appel, une case par proposition.
//
// Le texte ajouté devient celui de l'auteur, sans marque « IA » sur la fiche
// (arbitrage du 19/11/2026) : c'est pourquoi chaque proposition rappelle
// qu'elle peut contenir des erreurs (CGU § 6).
import { createContext, useCallback, useContext, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { LockedAction } from '@/components/LockedAction';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { useVoile } from '@/lib/use-voile';
import { regrowAll } from '@/lib/auto-grow';
import { creditsRestants, libelleCredits, soldeSuffisant, type EtatCredits } from '@/lib/credits-ia';
import {
  ajouterNoteAvance,
  ajouterTexte,
  champsVides,
  cleCible,
  COUT_REDACTION_CHAMP,
  coutCompletion,
  libelleCible,
  LONGUEUR_MAX,
  type CibleRedaction,
  type PropositionRedaction,
  type RecetteRedaction,
} from '@/lib/redaction-ia';

export const MESSAGE_VERROU_REDACTION =
  "La rédaction des descriptions et des conseils par l'IA n'est pas incluse dans votre formule.";
const AVERTISSEMENT = "Proposition générée par IA : elle peut contenir des erreurs. Relisez-la avant de l'ajouter.";
const AVERTISSEMENT_CONSERVATION =
  'Vérifiez les durées de conservation : elles dépendent de vos ingrédients et de votre matériel.';

type Contexte = {
  acces: boolean;
  credits: EtatCredits | null;
  lire: () => RecetteRedaction;
  /** Appelle la route, tient le solde local à jour. Rend `null` après une erreur affichée. */
  demander: (corps: { cible?: CibleRedaction; tout?: true }) => Promise<PropositionRedaction[] | null>;
  /** Un appel est en cours (un seul à la fois). */
  occupe: boolean;
};

const Ctx = createContext<Contexte | null>(null);

export function useRedactionIA(): Contexte | null {
  return useContext(Ctx);
}

export function RedactionIAProvider({
  acces,
  credits,
  recette,
  children,
}: {
  /** Droit `redaction_ia` de la formule. */
  acces: boolean;
  /** Solde lu par la page (`checkQuota`), `null` si inconnu. */
  credits: EtatCredits | null;
  /** La recette telle qu'elle est à l'écran, recalculée à chaque rendu. */
  recette: RecetteRedaction;
  children: ReactNode;
}) {
  const dialog = useDialog();
  const ref = useRef(recette);
  ref.current = recette;
  const [occupe, setOccupe] = useState(false);
  const [consommes, setConsommes] = useState(0);

  const lire = useCallback(() => ref.current, []);

  const demander = useCallback(
    async (corps: { cible?: CibleRedaction; tout?: true }) => {
      setOccupe(true);
      try {
        const res = await fetch('/api/recette/rediger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recette: ref.current, ...corps }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          await dialog.alert(typeof data?.erreur === 'string' ? data.erreur : 'La proposition a échoué, réessayez.');
          return null;
        }
        if (typeof data?.credits === 'number') setConsommes((n) => n + data.credits);
        return Array.isArray(data?.propositions) ? (data.propositions as PropositionRedaction[]) : [];
      } catch {
        await dialog.alert('La proposition a échoué (réseau), réessayez.');
        return null;
      } finally {
        setOccupe(false);
      }
    },
    [dialog],
  );

  const creditsAJour = useMemo<EtatCredits | null>(
    () => (credits && credits.utilises != null ? { ...credits, utilises: credits.utilises + consommes } : credits),
    [credits, consommes],
  );

  const valeur = useMemo(
    () => ({ acces, credits: creditsAJour, lire, demander, occupe }),
    [acces, creditsAJour, lire, demander, occupe],
  );
  return (
    <Ctx.Provider value={valeur}>
      {children}
      <LoadingOverlay visible={occupe} label="L'IA rédige une proposition…" />
    </Ctx.Provider>
  );
}

/** « · il vous reste 42 crédits IA », vide si le solde est inconnu. */
function texteSolde(credits: EtatCredits | null): string {
  const r = creditsRestants(credits);
  return r == null ? '' : `Il vous reste ${libelleCredits(r)} IA ce mois-ci.`;
}

// ── Un champ ────────────────────────────────────────────────

/**
 * Bouton « Proposer avec l'IA » et bloc de relecture de la proposition, rendus
 * à DEUX endroits : le bouton à côté du libellé du champ, le bloc sous le champ.
 * D'où une fonction-enfant `(bouton, panneau)` plutôt qu'un hook : elle porte
 * l'état et s'emploie aussi dans la boucle des étapes. Sans fournisseur, les
 * deux valent `null`.
 *
 * `valeur` : le texte actuel du champ (« Ajouter » seul, ou « Ajouter /
 * Remplacer »). Préparation à l'avance (`cible.champ === 'avance_etape'`) :
 * `onAppliquer` reçoit la note finale ; l'éditeur coche aussi la case.
 *
 * Bouton posé dans un `<summary>` : son clic n'ouvre ni ne ferme le volet, mais
 * le rouvre s'il était fermé, sans quoi la proposition y resterait cachée.
 */
export function ZoneRedaction({
  cible,
  valeur,
  onAppliquer,
  children,
}: {
  cible: CibleRedaction;
  valeur: string;
  onAppliquer: (texte: string) => void;
  children: (bouton: ReactNode, panneau: ReactNode) => ReactNode;
}) {
  const ctx = useRedactionIA();
  const [proposition, setProposition] = useState<PropositionRedaction | null>(null);
  const [texte, setTexte] = useState('');
  if (!ctx) return <>{children(null, null)}</>;

  const libelle = 'Proposer avec l’IA';
  if (!ctx.acces) {
    return (
      <>
        {children(
          <span className="no-print shrink-0 normal-case tracking-normal" onClick={(e) => e.stopPropagation()}>
            <LockedAction label={libelle} message={MESSAGE_VERROU_REDACTION}>
              {libelle}
            </LockedAction>
          </span>,
          null,
        )}
      </>
    );
  }

  const avance = cible.champ === 'avance_etape';
  const suffisant = soldeSuffisant(ctx.credits, COUT_REDACTION_CHAMP);

  async function proposer(e: MouseEvent<HTMLButtonElement>) {
    // Dans un <summary> : ne pas basculer le volet, mais l'ouvrir s'il est fermé.
    e.preventDefault();
    e.stopPropagation();
    const volet = e.currentTarget.closest('details');
    if (volet && !volet.open) volet.open = true;
    if (!ctx) return;
    const res = await ctx.demander({ cible });
    if (!res) return;
    const p = res[0];
    if (!p) return;
    setProposition(p);
    setTexte(p.texte);
  }

  function fermer() {
    setProposition(null);
    setTexte('');
  }

  function appliquer(mode: 'ajouter' | 'remplacer') {
    const t = texte.trim();
    if (!t) return;
    if (avance) onAppliquer(mode === 'remplacer' ? t : ajouterNoteAvance(valeur, t));
    else onAppliquer(mode === 'remplacer' ? t : ajouterTexte(valeur, t));
    regrowAll();
    fermer();
  }

  const aDeja = valeur.trim().length > 0;

  const bouton = (
    <button
      type="button"
      onClick={proposer}
      disabled={ctx.occupe || !suffisant || proposition != null}
      title={suffisant ? texteSolde(ctx.credits) || undefined : 'Crédits IA insuffisants ce mois-ci.'}
      className="no-print shrink-0 inline-flex items-center gap-1.5 rounded-full border border-primary/60 px-3 py-1 font-label-md text-[12px] normal-case tracking-normal text-primary hover:bg-primary/5 disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
        auto_awesome
      </span>
      {libelle} · {libelleCredits(COUT_REDACTION_CHAMP)} IA
    </button>
  );

  const panneau = proposition ? (
    <div className="no-print mt-2 rounded-lg border border-primary/40 bg-primary/5 p-3 flex flex-col gap-2">
      <p className="font-label-md text-[11px] uppercase tracking-widest text-primary flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
          auto_awesome
        </span>
        Proposition de l&apos;IA
      </p>
      {avance && proposition.possible === false ? (
        <p className="text-body-md text-on-surface">
          Selon l&apos;IA, cette étape ne se prête pas à une préparation à l&apos;avance (appareil à utiliser
          aussitôt).
        </p>
      ) : (
        <textarea
          value={texte}
          onChange={(e) => setTexte(avance ? e.target.value.replace(/\n/g, ' ') : e.target.value)}
          maxLength={LONGUEUR_MAX[cible.champ]}
          rows={avance ? 2 : Math.min(8, Math.max(3, Math.ceil(texte.length / 80)))}
          className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md"
          aria-label="Texte proposé, modifiable avant l’ajout"
        />
      )}
      <p className="text-[12px] italic text-on-surface-variant">
        {AVERTISSEMENT}
        {(avance || cible.champ === 'degustation') && ` ${AVERTISSEMENT_CONSERVATION}`}
      </p>
      {avance && proposition.possible !== false && aDeja && (
        <p className="text-[12px] text-on-surface-variant">
          « Ajouter » complète la note actuelle si l&apos;ensemble tient en 200 caractères, sinon la remplace.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={fermer} className="rounded-full px-4 py-1.5 font-label-md text-label-md text-on-surface-variant hover:bg-surface-container">
          {avance && proposition.possible === false ? 'Fermer' : 'Annuler'}
        </button>
        {!(avance && proposition.possible === false) && (
          <>
            {aDeja && (
              <button
                type="button"
                onClick={() => appliquer('remplacer')}
                disabled={!texte.trim()}
                className="rounded-full border border-primary px-4 py-1.5 font-label-md text-label-md text-primary hover:bg-primary/5 disabled:opacity-50"
              >
                Remplacer
              </button>
            )}
            <button
              type="button"
              onClick={() => appliquer('ajouter')}
              disabled={!texte.trim()}
              className="rounded-full bg-primary px-4 py-1.5 font-label-md text-label-md text-on-primary hover:opacity-90 disabled:opacity-50"
            >
              Ajouter
            </button>
          </>
        )}
      </div>
    </div>
  ) : null;

  return <>{children(bouton, panneau)}</>;
}

// ── Tous les champs vides ───────────────────────────────────

/** Libellé de l'action « Compléter avec l'IA » du rail. */
export function libelleCompletion(c: { nbChamps: number; cout: number } | null): string {
  if (!c || c.nbChamps === 0) return 'Compléter avec l’IA';
  return `Compléter avec l’IA (${c.nbChamps} champ${c.nbChamps > 1 ? 's' : ''} vide${c.nbChamps > 1 ? 's' : ''} · ${libelleCredits(c.cout)} IA)`;
}

type Ligne = PropositionRedaction & { coche: boolean };

/**
 * Fenêtre « Compléter avec l'IA ». Ouverte par l'éditeur (`ouvert`) ; elle
 * explique d'abord ce qui sera fait et ce que ça coûte, puis, après l'appel,
 * liste les propositions (une case chacune, cochée par défaut, texte
 * modifiable). `onAppliquer` reçoit les propositions retenues : l'éditeur les
 * écrit dans ses champs (tous vides : aucune fusion à faire).
 */
export function FenetreCompletion({
  ouvert,
  onFermer,
  onAppliquer,
}: {
  ouvert: boolean;
  onFermer: () => void;
  onAppliquer: (propositions: PropositionRedaction[]) => void;
}) {
  const ctx = useRedactionIA();
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const voile = useVoile(() => fermer(), ctx?.occupe ?? false);

  function fermer() {
    setLignes(null);
    onFermer();
  }

  if (!ouvert || !ctx || typeof document === 'undefined') return null;

  const recette = ctx.lire();
  const { cibles, etapesIgnorees } = champsVides(recette);
  const cout = coutCompletion(cibles.length);
  const suffisant = soldeSuffisant(ctx.credits, cout);

  async function lancer() {
    if (!ctx) return;
    const res = await ctx.demander({ tout: true });
    if (!res) return;
    setLignes(res.map((p) => ({ ...p, coche: !(p.champ === 'avance_etape' && p.possible === false) })));
  }

  function valider() {
    if (!lignes) return;
    onAppliquer(lignes.filter((l) => l.coche && l.texte.trim()).map(({ coche: _c, ...p }) => ({ ...p, texte: p.texte.trim() })));
    regrowAll();
    fermer();
  }

  const titreEtape = (i?: number) => (i == null ? undefined : recette.etapes[i]?.titre || undefined);
  const utiles = lignes?.filter((l) => !(l.champ === 'avance_etape' && l.possible === false)) ?? [];
  const sansAvance = lignes?.filter((l) => l.champ === 'avance_etape' && l.possible === false) ?? [];
  const nbCoches = utiles.filter((l) => l.coche && l.texte.trim()).length;

  return createPortal(
    <div className="fixed inset-0 z-[105] bg-black/40 flex items-center justify-center p-4" {...voile}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compléter avec l’IA"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-surface p-5 md:p-6 shadow-xl flex flex-col gap-4"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-headline-md text-[22px] text-primary flex items-center gap-2">
            <span className="material-symbols-outlined" aria-hidden="true">
              auto_awesome
            </span>
            Compléter avec l&apos;IA
          </h2>
          <button type="button" onClick={fermer} aria-label="Fermer" className="material-symbols-outlined text-on-surface-variant hover:text-primary">
            close
          </button>
        </div>

        {!ctx.acces ? (
          <>
            <p className="text-body-md">{MESSAGE_VERROU_REDACTION}</p>
            <div className="flex justify-end">
              <Link href="/plans" className="rounded-full bg-primary px-5 py-2 font-label-md text-label-md text-on-primary">
                Voir les formules
              </Link>
            </div>
          </>
        ) : !lignes ? (
          cibles.length === 0 ? (
            <p className="text-body-md">
              Tous les champs que l&apos;IA sait compléter sont déjà remplis. Pour en enrichir un, utilisez le bouton
              « Proposer avec l&apos;IA » sous le champ.
            </p>
          ) : (
            <>
              <p className="text-body-md">
                L&apos;IA lit le titre, les ingrédients et le déroulé de la recette, puis propose un texte pour chacun des{' '}
                <strong>
                  {cibles.length} champ{cibles.length > 1 ? 's' : ''} vide{cibles.length > 1 ? 's' : ''}
                </strong>{' '}
                ci-dessous. Vous relisez, modifiez et choisissez ce que vous ajoutez.
              </p>
              <ul className="list-disc pl-5 text-body-md text-on-surface-variant max-h-48 overflow-y-auto">
                {cibles.map((c) => (
                  <li key={cleCible(c)}>{libelleCible(c, titreEtape(c.etape))}</li>
                ))}
              </ul>
              {etapesIgnorees > 0 && (
                <p className="text-[13px] text-on-surface-variant">
                  {etapesIgnorees} étape{etapesIgnorees > 1 ? 's' : ''} au-delà de la 12ᵉ ne {etapesIgnorees > 1 ? 'sont' : 'est'} pas
                  traitée{etapesIgnorees > 1 ? 's' : ''} : relancez après avoir rempli les premières, ou utilisez le bouton sous le champ.
                </p>
              )}
              <p className="text-[13px] text-on-surface-variant">
                Coût : <strong>{libelleCredits(cout)} IA</strong> (1 crédit par tranche de 3 champs). {texteSolde(ctx.credits)}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={fermer} className="rounded-full px-5 py-2 font-label-md text-label-md text-on-surface-variant hover:bg-surface-container">
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={lancer}
                  disabled={ctx.occupe || !suffisant}
                  title={suffisant ? undefined : 'Crédits IA insuffisants ce mois-ci.'}
                  className="rounded-full bg-primary px-5 py-2 font-label-md text-label-md text-on-primary disabled:opacity-50"
                >
                  Lancer · {libelleCredits(cout)} IA
                </button>
              </div>
            </>
          )
        ) : (
          <>
            <p className="text-[13px] italic text-on-surface-variant">
              {AVERTISSEMENT} {AVERTISSEMENT_CONSERVATION}
            </p>
            <ul className="flex flex-col gap-3">
              {utiles.map((l) => {
                const cle = cleCible(l);
                return (
                  <li key={cle} className="rounded-lg border border-outline-variant p-3 flex flex-col gap-2">
                    <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface">
                      <input
                        type="checkbox"
                        checked={l.coche}
                        onChange={(e) => setLignes((ls) => ls?.map((x) => (cleCible(x) === cle ? { ...x, coche: e.target.checked } : x)) ?? null)}
                      />
                      {libelleCible(l, titreEtape(l.etape))}
                    </label>
                    <textarea
                      value={l.texte}
                      disabled={!l.coche}
                      onChange={(e) => {
                        const v = l.champ === 'avance_etape' ? e.target.value.replace(/\n/g, ' ') : e.target.value;
                        setLignes((ls) => ls?.map((x) => (cleCible(x) === cle ? { ...x, texte: v } : x)) ?? null);
                      }}
                      maxLength={LONGUEUR_MAX[l.champ]}
                      rows={l.champ === 'avance_etape' ? 2 : Math.min(6, Math.max(2, Math.ceil(l.texte.length / 80)))}
                      className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-md disabled:opacity-50"
                    />
                  </li>
                );
              })}
            </ul>
            {sansAvance.length > 0 && (
              <p className="text-[13px] text-on-surface-variant">
                {sansAvance.length} étape{sansAvance.length > 1 ? 's ne se prêtent' : ' ne se prête'} pas à une préparation à
                l&apos;avance selon l&apos;IA : {sansAvance.map((l) => `étape ${(l.etape ?? 0) + 1}`).join(', ')}.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={fermer} className="rounded-full px-5 py-2 font-label-md text-label-md text-on-surface-variant hover:bg-surface-container">
                Annuler
              </button>
              <button
                type="button"
                onClick={valider}
                disabled={nbCoches === 0}
                className="rounded-full bg-primary px-5 py-2 font-label-md text-label-md text-on-primary disabled:opacity-50"
              >
                Ajouter la sélection ({nbCoches})
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
