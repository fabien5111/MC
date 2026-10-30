'use client';

// Bloc « Modération » de la fiche membre (JEP-272) : suspendre, désactiver,
// lever — puis le journal des actions passées.
//
// Lot 2 : chaque action passe par une fenêtre de confirmation qui montre
// l'abonnement en cours (lu chez Stripe par `GET …/moderation`), propose les
// gestes possibles sur ses prélèvements, et porte la case « Prévenir le
// membre par e-mail ». Rien n'est fait sur l'abonnement sans choix explicite.
//
// Toutes les écritures passent par `POST /api/admin/membres/[id]/moderation`,
// jamais par le navigateur : la route pose aussi le bannissement GoTrue, que
// seule la clé service_role peut écrire, et rejoue les garde-fous
// (`validerDemandeModeration`) que cet écran ne fait qu'anticiper.
import { useState } from 'react';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { formatDate, formatDateHeure } from '@/lib/format';
import {
  actionAbonnementParDefaut,
  actionsAbonnementPossibles,
  emailObligatoire,
  LIBELLE_ACTION_ABONNEMENT,
  LIBELLE_ACTION_JOURNAL,
  MOTIF_MAX_LENGTH,
  type ActionAbonnement,
  type ActionModeration,
  type EtatAbonnement,
  type EtatModeration,
} from '@/lib/moderation';
import type { EvenementModeration } from '@/lib/moderation-data';

const FIELD = 'border border-outline-variant rounded px-3 py-2 bg-white text-sm w-full focus:outline-none focus:border-primary';
const LABEL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';
const BTN = 'border rounded py-2.5 px-5 text-sm font-semibold transition-colors disabled:opacity-50';

// `datetime-local` rend une heure locale sans fuseau : `new Date()` la lit
// dans le fuseau du navigateur de l'admin, ce qui est bien l'intention.
function versIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function MemberModerationPanel({
  memberId,
  memberName,
  memberRole,
  etat,
  journal,
}: {
  memberId: string;
  memberName: string;
  memberRole: string;
  etat: EtatModeration;
  journal: EvenementModeration[];
}) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();
  const [motif, setMotif] = useState('');
  const [fin, setFin] = useState('');
  const [lecture, setLecture] = useState(false);
  // Fenêtre de confirmation ouverte : l'action, et l'abonnement lu au moment
  // de l'ouverture (`undefined` : lecture impossible).
  const [fenetre, setFenetre] = useState<{ action: ActionModeration; abonnement: EtatAbonnement | null | undefined } | null>(null);

  const estAdmin = memberRole === 'admin';

  async function ouvrir(action: ActionModeration) {
    setLecture(true);
    let abonnement: EtatAbonnement | null | undefined;
    try {
      const res = await fetch(`/api/admin/membres/${memberId}/moderation`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      abonnement = res.ok ? ((data?.abonnement as EtatAbonnement | null) ?? null) : undefined;
    } catch {
      abonnement = undefined;
    } finally {
      setLecture(false);
    }
    setFenetre({ action, abonnement });
  }

  async function confirmer(action: ActionModeration, choixAbonnement: ActionAbonnement, prevenir: boolean) {
    const jusquAu = action === 'suspendre' ? versIso(fin) : null;
    let reponse: ReponseModeration | null = null;
    setFenetre(null);
    const ok = await mutate(
      async () => {
        const res = await fetch(`/api/admin/membres/${memberId}/moderation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, motif, jusquAu, abonnement: choixAbonnement, prevenir }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) reponse = data as ReponseModeration;
        return { error: res.ok ? null : { message: data?.erreur || 'Action impossible' } };
      },
      { errorLabel: 'Modération' },
    );
    if (ok) {
      setMotif('');
      setFin('');
      if (reponse) dialog.alert(recapitulatif(action, reponse));
    }
  }

  return (
    <>
      <LoadingOverlay visible={busy || lecture} />

      {etat.etat !== 'actif' && (
        <div className="rounded-lg border border-error/40 bg-error-container px-4 py-3 text-sm text-on-error-container space-y-1">
          <p className="font-semibold">
            {etat.etat === 'suspendu'
              ? etat.jusquAu
                ? `Suspendu jusqu'au ${formatDateHeure(etat.jusquAu)}`
                : 'Suspendu sans limite de durée'
              : 'Compte désactivé'}
          </p>
          {etat.motif && <p className="whitespace-pre-line">Motif : {etat.motif}</p>}
        </div>
      )}

      {estAdmin ? (
        <p className="text-xs text-on-surface-variant">Un administrateur ne peut être ni suspendu ni désactivé.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className={LABEL}>Motif (obligatoire pour une suspension, montré au membre)</span>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={3}
              maxLength={MOTIF_MAX_LENGTH}
              className={FIELD}
            />
          </div>
          {etat.etat !== 'desactive' && (
            <div className="flex flex-col gap-1">
              <span className={LABEL}>Fin de la suspension (vide = sans limite)</span>
              <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className={FIELD} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {etat.etat !== 'desactive' && (
              <button
                type="button"
                onClick={() => ouvrir('suspendre')}
                disabled={busy || lecture || !motif.trim()}
                className={`${BTN} border-orange-700 text-orange-800 hover:bg-orange-50`}
              >
                {etat.etat === 'suspendu' ? 'Modifier la suspension' : 'Suspendre'}
              </button>
            )}
            {etat.etat !== 'desactive' && (
              <button
                type="button"
                onClick={() => ouvrir('desactiver')}
                disabled={busy}
                className={`${BTN} border-error text-error hover:bg-error/5`}
              >
                Désactiver le compte
              </button>
            )}
          </div>
        </>
      )}

      {etat.etat !== 'actif' && (
        <button
          type="button"
          onClick={() => ouvrir('lever')}
          disabled={busy}
          className={`${BTN} border-outline-variant hover:bg-surface-container-high`}
        >
          {etat.etat === 'desactive' ? 'Lever la désactivation' : 'Lever la suspension'}
        </button>
      )}

      <div>
        <h4 className="mb-2 font-label-md text-[13px] text-primary">Journal</h4>
        {journal.length === 0 ? (
          <p className="text-xs text-on-surface-variant">Aucune action de modération.</p>
        ) : (
          <ul className="space-y-1.5">
            {journal.map((e) => (
              <li key={e.id} className="text-xs border border-outline-variant rounded p-2.5">
                <p className="text-on-surface">
                  <strong>{LIBELLE_ACTION_JOURNAL[e.action] ?? e.action}</strong>
                  {e.action === 'suspension' && (e.jusquAu ? ` jusqu'au ${formatDateHeure(e.jusquAu)}` : ' sans limite')}
                </p>
                <p className="text-on-surface-variant">
                  {formatDateHeure(e.createdAt)} · par {e.parLeMembre ? 'le membre' : (e.adminNom ?? 'administrateur supprimé')}
                </p>
                {e.motif && <p className="text-on-surface-variant italic whitespace-pre-line">« {e.motif} »</p>}
                {(e.notifie != null || e.abonnement) && (
                  <p className="text-on-surface-variant">
                    {e.notifie != null && (e.notifie ? 'Membre prévenu par e-mail' : 'Membre non prévenu')}
                    {e.notifie != null && e.abonnement && ' · '}
                    {e.abonnement && libelleJournalAbonnement(e.abonnement)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {fenetre && (
        <FenetreConfirmation
          action={fenetre.action}
          abonnement={fenetre.abonnement}
          memberName={memberName}
          etat={etat}
          jusquAu={fenetre.action === 'suspendre' ? versIso(fin) : null}
          onAnnuler={() => setFenetre(null)}
          onConfirmer={(choix, prevenir) => confirmer(fenetre.action, choix, prevenir)}
        />
      )}
    </>
  );
}

// ── Fenêtre de confirmation ─────────────────────────────────────────────

type ReponseModeration = {
  email: 'envoye' | 'echec' | 'file' | 'non_demande';
  abonnement: { action: ActionAbonnement; ok: boolean; message?: string };
  notesRecalculees: number;
};

const NOM_ACTION: Record<ActionModeration, string> = {
  suspendre: 'Suspension',
  desactiver: 'Désactivation',
  lever: 'Levée',
};

/** Ce qui a été fait, et ce qui a échoué, après une action réussie. */
function recapitulatif(action: ActionModeration, r: ReponseModeration): string {
  const lignes = [`${NOM_ACTION[action]} enregistrée.`];
  if (r.email === 'envoye') lignes.push('Le membre a été prévenu par e-mail.');
  else if (r.email === 'file') lignes.push('E-mail mis en file : quota du jour atteint, il partira au prochain envoi.');
  else if (r.email === 'echec') lignes.push('L’e-mail au membre n’a pas pu partir.');
  else lignes.push('Le membre n’a pas été prévenu.');
  if (r.abonnement.action !== 'aucune') {
    lignes.push(
      r.abonnement.ok
        ? `Abonnement : ${LIBELLE_ACTION_ABONNEMENT[r.abonnement.action].toLowerCase()}, fait chez Stripe.`
        : `Abonnement : « ${LIBELLE_ACTION_ABONNEMENT[r.abonnement.action]} » a échoué chez Stripe (${r.abonnement.message ?? 'erreur inconnue'}). À refaire depuis le Dashboard Stripe.`,
    );
  }
  if (r.notesRecalculees > 0) lignes.push(`Note moyenne recalculée sur ${r.notesRecalculees} recette(s).`);
  return lignes.join('\n');
}

function libelleJournalAbonnement(code: string): string {
  const [geste, echec] = code.split(':');
  const libelle = LIBELLE_ACTION_ABONNEMENT[geste as ActionAbonnement] ?? geste;
  return echec ? `${libelle} : échec chez Stripe` : libelle;
}

function FenetreConfirmation({
  action,
  abonnement,
  memberName,
  etat,
  jusquAu,
  onAnnuler,
  onConfirmer,
}: {
  action: ActionModeration;
  /** `undefined` : l'abonnement n'a pas pu être lu. */
  abonnement: EtatAbonnement | null | undefined;
  memberName: string;
  etat: EtatModeration;
  jusquAu: string | null;
  onAnnuler: () => void;
  onConfirmer: (choix: ActionAbonnement, prevenir: boolean) => void;
}) {
  const possibles = actionsAbonnementPossibles(action, abonnement ?? null);
  const [choix, setChoix] = useState<ActionAbonnement>(actionAbonnementParDefaut(action, abonnement ?? null));
  const [prevenir, setPrevenir] = useState(true);
  const prevenirImpose = emailObligatoire(choix);

  const titre =
    action === 'suspendre'
      ? `Suspendre « ${memberName} » ${jusquAu ? `jusqu’au ${formatDateHeure(jusquAu)}` : 'sans limite de durée'} ?`
      : action === 'desactiver'
        ? `Désactiver le compte de « ${memberName} » ?`
        : `Lever la ${etat.etat === 'desactive' ? 'désactivation' : 'suspension'} de « ${memberName} » ?`;
  const explication =
    action === 'suspendre'
      ? 'Il ne pourra plus se connecter, et toute écriture lui est refusée dès maintenant. Une session déjà ouverte est coupée au plus tard à l’expiration de son jeton.'
      : action === 'desactiver'
        ? 'Il ne pourra plus se connecter jusqu’à ce que vous leviez la désactivation. Ses recettes, avis, idées et son profil public ne seront plus visibles (ils sont conservés).'
        : 'Il pourra de nouveau se connecter et utiliser le site.' +
          (etat.etat === 'desactive' ? ' Ses contenus publiés redeviennent visibles.' : '');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="moderation-titre"
      className="fixed inset-0 z-[95] flex items-start justify-center bg-background/60 backdrop-blur-[2px] p-4 overflow-y-auto"
    >
      <div className="w-full max-w-lg my-8 bg-surface-container-low border border-outline-variant rounded-xl shadow-lg p-6 space-y-5">
        <div className="space-y-2">
          <h3 id="moderation-titre" className="font-headline-md text-lg font-semibold">{titre}</h3>
          <p className="text-sm text-on-surface-variant">{explication}</p>
        </div>

        <BlocAbonnement action={action} abonnement={abonnement} possibles={possibles} choix={choix} setChoix={setChoix} />

        <div className="space-y-1">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              id="moderation-prevenir"
              className="mt-1"
              checked={prevenir || prevenirImpose}
              disabled={prevenirImpose}
              onChange={(e) => setPrevenir(e.target.checked)}
            />
            <span>Prévenir le membre par e-mail</span>
          </label>
          <p className="text-xs text-on-surface-variant pl-6">
            {prevenirImpose
              ? 'Obligatoire : la résiliation de son abonnement doit lui être notifiée.'
              : action === 'lever'
                ? 'Il apprend que son compte est rétabli.'
                : 'Il reçoit la décision, le motif, la date de fin éventuelle et le lien vers la page Contact.'}
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onAnnuler} className={`${BTN} border-outline-variant hover:bg-surface-container-high`}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirmer(choix, prevenir || prevenirImpose)}
            className={`${BTN} ${action === 'lever' ? 'border-primary bg-primary text-on-primary' : 'border-error bg-error text-on-error'} hover:opacity-90`}
          >
            {action === 'suspendre' ? 'Suspendre' : action === 'desactiver' ? 'Désactiver' : 'Lever'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BlocAbonnement({
  action,
  abonnement,
  possibles,
  choix,
  setChoix,
}: {
  action: ActionModeration;
  abonnement: EtatAbonnement | null | undefined;
  possibles: ActionAbonnement[];
  choix: ActionAbonnement;
  setChoix: (c: ActionAbonnement) => void;
}) {
  if (abonnement === null) return null;
  const cadre = 'rounded-lg border px-4 py-3 text-sm space-y-2';

  if (abonnement === undefined) {
    return (
      <div className={`${cadre} border-outline-variant`}>
        L’abonnement du membre n’a pas pu être lu. Vérifiez dans le Dashboard Stripe qu’il n’est pas prélevé.
      </div>
    );
  }

  const echeance = abonnement.finPeriode ? ` · échéance le ${formatDate(abonnement.finPeriode)}` : '';
  if (!abonnement.stripe) {
    return (
      <div className={`${cadre} border-outline-variant`}>
        Abonnement en cours : <strong>{abonnement.libelle}</strong> ({abonnement.type}){echeance}. Il n’est pas prélevé par
        Stripe : rien à arrêter.
      </div>
    );
  }
  if (abonnement.lectureStripe !== 'ok') {
    return (
      <div className={`${cadre} border-error/50 bg-error-container text-on-error-container`}>
        Abonnement payant : <strong>{abonnement.libelle}</strong>{echeance}. Son état chez Stripe n’a pas pu être lu :
        aucun geste n’est proposé ici, vérifiez les prélèvements dans le Dashboard Stripe.
      </div>
    );
  }

  const etatStripe = abonnement.resiliationProgrammee
    ? 'Résiliation déjà programmée à l’échéance.'
    : abonnement.enPause
      ? 'Prélèvements actuellement en pause.'
      : 'Il est prélevé normalement.';
  const alerte = action !== 'lever' && !abonnement.enPause && !abonnement.resiliationProgrammee;

  return (
    <div className={`${cadre} ${alerte ? 'border-error/50 bg-error-container text-on-error-container' : 'border-outline-variant'}`}>
      <p>
        Abonnement payant : <strong>{abonnement.libelle}</strong>
        {echeance}. {etatStripe}
        {alerte && ' Si vous ne faites rien, il continuera d’être prélevé pendant le blocage.'}
      </p>
      {possibles.length > 1 && (
        <fieldset className="space-y-1">
          <legend className="sr-only">Que faire de l’abonnement ?</legend>
          {possibles.map((p) => (
            <label key={p} className="flex items-center gap-2">
              <input
                type="radio"
                id={`moderation-abonnement-${p}`}
                name="moderation-abonnement"
                checked={choix === p}
                onChange={() => setChoix(p)}
              />
              <span>{LIBELLE_ACTION_ABONNEMENT[p]}</span>
            </label>
          ))}
          {choix === 'resilier' && (
            <p className="text-xs pl-6">Aucun remboursement automatique : un remboursement se fait à la main dans le Dashboard Stripe.</p>
          )}
          {choix === 'pause' && (
            <p className="text-xs pl-6">Rien n’est facturé pendant la pause ; elle est proposée à la reprise quand vous levez le blocage.</p>
          )}
        </fieldset>
      )}
    </div>
  );
}
