'use client';

// Bloc « Modération » de la fiche membre (JEP-272, lot 1) : suspendre,
// désactiver, lever — puis le journal des actions passées.
//
// Toutes les écritures passent par `POST /api/admin/membres/[id]/moderation`,
// jamais par le navigateur : la route pose aussi le bannissement GoTrue, que
// seule la clé service_role peut écrire, et rejoue les garde-fous
// (`validerDemandeModeration`) que cet écran ne fait qu'anticiper.
import { useState } from 'react';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDateHeure } from '@/lib/format';
import { LIBELLE_ACTION_JOURNAL, MOTIF_MAX_LENGTH, type ActionModeration, type EtatModeration } from '@/lib/moderation';
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
  const [motif, setMotif] = useState('');
  const [fin, setFin] = useState('');

  const estAdmin = memberRole === 'admin';

  async function agir(action: ActionModeration) {
    const jusquAu = action === 'suspendre' ? versIso(fin) : null;
    const message =
      action === 'suspendre'
        ? `Suspendre « ${memberName} » ${jusquAu ? `jusqu'au ${formatDateHeure(jusquAu)}` : 'sans limite de durée'} ?\n\n` +
          'Il ne pourra plus se connecter, et toute écriture lui est refusée dès maintenant. Une session déjà ouverte ' +
          "est coupée au plus tard à l'expiration de son jeton."
        : action === 'desactiver'
          ? `Désactiver le compte de « ${memberName} » ?\n\n` +
            'Il ne pourra plus se connecter jusqu’à ce que vous leviez la désactivation.'
          : `Lever la ${etat.etat === 'desactive' ? 'désactivation' : 'suspension'} de « ${memberName} » ?\n\n` +
            'Il pourra de nouveau se connecter et utiliser le site.';

    const ok = await mutate(
      async () => {
        const res = await fetch(`/api/admin/membres/${memberId}/moderation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, motif, jusquAu }),
        });
        const data = await res.json().catch(() => ({}));
        return { error: res.ok ? null : { message: data?.erreur || 'Action impossible' } };
      },
      { confirm: message, errorLabel: 'Modération' },
    );
    if (ok) {
      setMotif('');
      setFin('');
    }
  }

  return (
    <>
      <LoadingOverlay visible={busy} />

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
                onClick={() => agir('suspendre')}
                disabled={busy || !motif.trim()}
                className={`${BTN} border-orange-700 text-orange-800 hover:bg-orange-50`}
              >
                {etat.etat === 'suspendu' ? 'Modifier la suspension' : 'Suspendre'}
              </button>
            )}
            {etat.etat !== 'desactive' && (
              <button
                type="button"
                onClick={() => agir('desactiver')}
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
          onClick={() => agir('lever')}
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
                  {formatDateHeure(e.createdAt)} · par {e.adminNom ?? 'administrateur supprimé'}
                </p>
                {e.motif && <p className="text-on-surface-variant italic whitespace-pre-line">« {e.motif} »</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
