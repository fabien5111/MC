'use client';

// « Supprimer mon compte » (JEP-33) — dernier bloc de `/reglages`.
//
// Le contenu n'est monté qu'à l'ouverture du bloc (`SettingsCard`) : l'état de
// l'abonnement n'est donc lu que si le membre envisage réellement de partir.
// La confirmation se fait par saisie du pseudo, revérifiée par la route
// (`POST /api/compte/supprimer`), qui fait tout le travail : le navigateur
// n'écrit rien lui-même.
//
// Une fois le compte supprimé, la session n'existe plus : retour à l'accueil
// par un rechargement complet (`location.assign`), jamais par le routeur, qui
// garderait en mémoire des rendus d'un compte disparu.
import { useEffect, useState } from 'react';
import { SettingsCard } from '@/components/profile/SettingsCard';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { confirmationPseudoValide, MESSAGE_AVANT_SUPPRESSION } from '@/lib/anonymisation';

const FIELD =
  'w-full bg-transparent border-b border-outline-variant py-3 px-1 focus:outline-none focus:border-primary transition-all duration-300 font-body-md text-body-md placeholder:text-on-surface-variant/40';

type Abonnement = { libelle: string; stripe: boolean } | null;

function Contenu({ pseudo }: { pseudo: string }) {
  const dialog = useDialog();
  const [abonnement, setAbonnement] = useState<Abonnement | undefined>(undefined);
  const [saisie, setSaisie] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let actif = true;
    fetch('/api/compte/supprimer')
      .then((r) => (r.ok ? r.json() : { abonnement: null }))
      .then((d) => actif && setAbonnement((d?.abonnement as Abonnement) ?? null))
      .catch(() => actif && setAbonnement(null));
    return () => {
      actif = false;
    };
  }, []);

  const confirme = confirmationPseudoValide(saisie, pseudo);

  async function supprimer() {
    if (!confirme) return;
    setBusy(true);
    try {
      const res = await fetch('/api/compte/supprimer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo: saisie }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBusy(false);
        await dialog.alert(data?.erreur || 'Suppression impossible.');
        return;
      }
      window.location.assign('/');
    } catch (e) {
      setBusy(false);
      await dialog.alert('Erreur réseau : ' + ((e as Error).message || 'suppression impossible'));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <LoadingOverlay visible={busy} />
      <p className="font-body-md text-body-md text-on-surface">{MESSAGE_AVANT_SUPPRESSION}</p>
      <ul className="list-disc pl-5 text-sm text-on-surface-variant flex flex-col gap-1">
        <li>Vos fournées, listes de courses, listes de recettes, favoris, abonnements et partages sont supprimés.</li>
        <li>Vos idées de la boîte à idées restent en ligne, signées « Membre supprimé ».</li>
        <li>Vos demandes de contact sont effacées de vos données personnelles.</li>
        <li>
          Vous pourrez créer un nouveau compte avec la même adresse, mais vous ne retrouverez aucune de vos données : il
          repartira de zéro.
        </li>
        <li>La suppression est définitive.</li>
      </ul>
      {abonnement && (
        <p className="rounded border border-error/40 bg-error/5 px-4 py-3 text-sm text-on-surface">
          <strong>Votre abonnement « {abonnement.libelle} » sera résilié immédiatement</strong>
          {abonnement.stripe
            ? ', sans nouveau prélèvement ni remboursement automatique de la période en cours.'
            : '.'}
        </p>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm text-on-surface-variant">
          Pour confirmer, saisissez votre pseudo : <strong className="text-on-surface">{pseudo}</strong>
        </span>
        <input
          type="text"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          autoComplete="off"
          className={FIELD}
        />
      </label>
      <button
        type="button"
        onClick={supprimer}
        disabled={!confirme || busy || abonnement === undefined}
        className="self-start border border-error text-error py-2.5 px-6 rounded text-sm font-semibold hover:bg-error/5 transition-colors disabled:opacity-50"
      >
        Supprimer définitivement mon compte
      </button>
    </div>
  );
}

export function DeleteAccountCard({ pseudo }: { pseudo: string }) {
  return (
    <SettingsCard icon="person_remove" title="Supprimer mon compte" count={0} id="supprimer-compte">
      <Contenu pseudo={pseudo} />
    </SettingsCard>
  );
}
