'use client';

// Gestion des membres (porté de admin-membres.html) : stats, filtres,
// recherche, table (profils inscrits + invitations allowlist), invitation,
// suppression. Cliquer sur une ligne navigue vers la fiche dédiée
// (`/admin/membres/[id]`, `components/admin/MemberDetail.tsx`) plutôt que
// d'ouvrir un panneau superposé — toutes les infos et actions d'un membre y
// sont regroupées. La cellule d'actions arrête la propagation du clic
// (`stopPropagation`) pour que ses propres boutons (copier le lien, connecter
// en tant que, supprimer) n'ouvrent pas la fiche en plus de leur action.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import type { Member, AiUsageOverview } from '@/lib/admin';
import { formatUsd } from '@/lib/ai/cost';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { useImpersonateLink, ImpersonationLinkPanel } from '@/components/admin/ImpersonateButton';

// 'trial' : essai en cours (§8.3, filtre par essai) — distinct de `demo`
// (compte de démonstration), qui n'a rien à voir avec l'abonnement.
type Filter = 'all' | 'active' | 'pending' | 'disabled' | 'demo' | 'trial';

function inviteLinkFor(email: string): string {
  return `${window.location.origin}/connexion?invite=${encodeURIComponent(email)}`;
}

export function MembersManager({ members, iaOverview }: { members: Member[]; iaOverview: AiUsageOverview }) {
  const router = useRouter();
  const dialog = useDialog();
  const { mutate } = useMutation();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  // Tri par coût IA décroissant par défaut : c'est le seul tri qui rend
  // cette colonne utile — repérer les quelques comptes qui pèsent le plus
  // sur la facture, pas parcourir la liste par ordre alphabétique.
  const [sortCout, setSortCout] = useState<'desc' | 'asc' | null>('desc');
  const { connect: connectImpersonation, busy: impBusy, link: impersonation, clear: clearImpersonation } = useImpersonateLink();
  // Copie locale des props serveur : permet de retirer une ligne supprimée en
  // même temps que le spinner, sans attendre la fin du router.refresh().
  const [rows, setRows] = useState(members);
  useEffect(() => setRows(members), [members]);

  // « Connecter en tant que » : aucun choix de niveau d'accès ici — il est
  // hérité du profil de l'admin (profiles.impersonation_access) et résolu par
  // la route serveur (POST /api/admin/impersonate, cf. useImpersonateLink).
  function connecterEnTantQue(m: Member) {
    if (!m.profileId) {
      dialog.alert("Ce membre n'a pas encore de compte : impossible d'ouvrir une session.");
      return;
    }
    connectImpersonation(m.profileId, m.fullName || m.email);
  }

  const stats = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((m) => m.status === 'active').length,
      pending: rows.filter((m) => m.status === 'pending').length,
      disabled: rows.filter((m) => m.status === 'disabled').length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const base = rows
      .filter((m) => {
        if (filter === 'demo') return m.is_demo;
        if (filter === 'trial') return m.subscription?.type === 'TRIAL';
        if (filter === 'all') return true;
        return m.status === filter;
      })
      .filter((m) => {
        const q = query.toLowerCase();
        return !q || [m.email, m.fullName || '', m.notes || ''].some((v) => v.toLowerCase().includes(q));
      });
    if (!sortCout) return base;
    // `null` (jamais d'appel IA) trié après les montants connus, quel que
    // soit le sens : un membre sans consommation n'est ni le plus ni le
    // moins coûteux, il est hors sujet pour ce tri.
    return [...base].sort((a, b) => {
      if (a.coutIaMois == null && b.coutIaMois == null) return 0;
      if (a.coutIaMois == null) return 1;
      if (b.coutIaMois == null) return -1;
      return sortCout === 'desc' ? b.coutIaMois - a.coutIaMois : a.coutIaMois - b.coutIaMois;
    });
  }, [rows, filter, query, sortCout]);

  // La suppression passe par une route serveur : effacer la seule ligne
  // `profiles` depuis le navigateur laissait le compte d'authentification
  // intact, donc toujours capable de se connecter (et de recréer son profil).
  async function del(m: Member) {
    const ok = await mutate(
      async () => {
        const res = await fetch('/api/admin/delete-member', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: m.profileId, allowlistId: m.allowlistId }),
        });
        const data = await res.json().catch(() => ({}));
        return { error: res.ok ? null : { message: data?.erreur || 'suppression impossible' } };
      },
      {
        confirm:
          `Supprimer « ${m.fullName || m.email} » ?\n\n` +
          'Le compte de connexion sera également supprimé : le membre ne pourra plus se connecter.',
        errorLabel: 'Suppression impossible',
      },
    );
    if (ok) setRows((prev) => prev.filter((r) => r.id !== m.id));
  }

  function copyInviteLinkFor(email: string) {
    navigator.clipboard.writeText(inviteLinkFor(email)).then(() => dialog.alert(`Lien d'invitation copié pour ${email}`));
  }

  const chip = (f: Filter, label: string) => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      className={`px-3 py-1 rounded-full text-xs font-semibold ${
        filter === f ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
      }`}
    >
      {label}
    </button>
  );
  const badge = (cls: string, text: string) => <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${cls}`}>{text}</span>;

  const accessCell = (m: Member) =>
    m.provider === 'google' ? (
      <span className="flex items-center gap-1 text-xs text-on-surface-variant">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Google
      </span>
    ) : m.provider === 'email' ? (
      <span className="flex items-center gap-1 text-xs text-on-surface-variant">
        <span className="material-symbols-outlined text-sm">mail</span> Email
      </span>
    ) : (
      <span className="text-xs text-on-surface-variant">—</span>
    );

  return (
    <main className="flex-1 p-margin-mobile md:p-margin-desktop max-w-[1400px] w-full">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {(
          [
            ['Total', stats.total],
            ['Actifs', stats.active],
            ['Invités', stats.pending],
            ['Désactivés', stats.disabled],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="bg-surface-container-low border border-outline-variant rounded-xl p-5">
            <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">{label}</p>
            <p className="font-headline-md text-[28px] text-primary">{v}</p>
          </div>
        ))}
      </div>

      {/* Coût IA des membres (import, ajustement, mode projet) — jamais la
          modération, qui n'est jamais imputée à un membre. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-5">
          <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Coût IA des membres — ce mois-ci</p>
          <p className="font-headline-md text-[28px] text-primary">{formatUsd(iaOverview.membreMoisCourant)}</p>
        </div>
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-5">
          <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Coût IA des membres — au total</p>
          <p className="font-headline-md text-[28px] text-primary">{formatUsd(iaOverview.membreTotal)}</p>
        </div>
      </div>

      <InviteCard members={rows} onInvited={() => router.refresh()} />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {chip('all', 'Tous')}
          {chip('active', 'Actifs')}
          {chip('pending', 'Invités')}
          {chip('disabled', 'Désactivés')}
          {chip('demo', 'Démo')}
          {chip('trial', 'Essai en cours')}
        </div>
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            className="pl-8 pr-3 py-1.5 border border-outline-variant rounded text-sm bg-white focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-x-auto">
        <div className="p-5 border-b border-outline-variant">
          <h3 className="font-headline-md text-base font-semibold">
            Tous les membres <span className="text-on-surface-variant font-body-md text-sm font-normal">({filtered.length})</span>
          </h3>
        </div>
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead className="bg-surface-container font-label-md text-on-surface-variant border-b border-outline-variant">
            <tr>
              {['Membre', 'Statut', 'Accès', 'Plan / Rôle', 'Recettes', 'Depuis'].map((h, i) => (
                <th key={i} className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">
                  {h}
                </th>
              ))}
              <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setSortCout((s) => (s === 'desc' ? 'asc' : 'desc'))}
                  className="flex items-center gap-0.5 hover:text-primary"
                  title="Trier par coût IA du mois"
                >
                  Coût IA (mois)
                  <span className="material-symbols-outlined text-sm">
                    {sortCout === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                </button>
              </th>
              <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider" />
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-on-surface-variant text-sm">
                  Aucun membre trouvé.
                </td>
              </tr>
            ) : (
              filtered.map((m) => {
                const initials = m.fullName
                  ? m.fullName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
                  : m.email[0]?.toUpperCase() || '?';
                return (
                  <tr
                    key={m.id}
                    onClick={() => router.push(`/admin/membres/${m.id}`)}
                    className="hover:bg-surface-container-low transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {m.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                          <img src={m.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-primary-fixed-dim flex items-center justify-center text-on-primary-fixed text-xs font-bold">
                            {initials}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-on-surface leading-tight">
                            {m.fullName || <span className="text-on-surface-variant font-normal italic">Pas encore inscrit</span>}
                          </p>
                          <p className="text-xs text-on-surface-variant">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {m.status === 'active'
                        ? badge('bg-green-100 text-green-800', 'Actif')
                        : m.status === 'pending'
                          ? badge('bg-surface-container text-on-surface-variant', 'Invité')
                          : badge('bg-error-container text-on-error-container', 'Désactivé')}
                      {m.is_demo && <span className="ml-1">{badge('bg-tertiary-fixed text-on-tertiary-fixed', 'Démo')}</span>}
                    </td>
                    <td className="px-6 py-4">{accessCell(m)}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        {m.subscription
                          ? badge('bg-secondary-container text-on-secondary-container', `${m.subscription.planLabel}${m.subscription.type === 'TRIAL' ? ' · essai' : ''}`)
                          : badge('bg-outline-variant text-on-surface-variant', m.profileId ? '—' : 'Non inscrit')}
                        {m.subscription?.trialConsumed && m.subscription.type !== 'TRIAL' && (
                          <span className="text-[10px] text-on-surface-variant">Essai déjà consommé</span>
                        )}
                        {m.role === 'admin'
                          ? badge('bg-primary-fixed text-on-primary-fixed', 'Admin')
                          : m.role === 'gestionnaire'
                            ? badge('bg-secondary-container text-on-secondary-container', 'Gestionnaire')
                            : badge('bg-surface-container text-on-surface-variant', 'Membre')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-medium text-on-surface">{m.profileId ? m.recipeCount : '—'}</td>
                    <td className="px-6 py-4 text-xs text-on-surface-variant">
                      {m.invited_at ? new Date(m.invited_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-on-surface">
                      {m.coutIaMois == null ? (
                        <span className="text-on-surface-variant">—</span>
                      ) : (
                        formatUsd(m.coutIaMois)
                      )}
                    </td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end items-center gap-1">
                        {m.notes && (
                          <span className="material-symbols-outlined text-base text-on-surface-variant" title={m.notes}>
                            sticky_note_2
                          </span>
                        )}
                        {m.status === 'pending' && (
                          <button onClick={() => copyInviteLinkFor(m.email)} className="p-1.5 hover:bg-surface-container-high rounded text-on-surface-variant" title="Copier le lien d'invitation">
                            <span className="material-symbols-outlined text-lg">link</span>
                          </button>
                        )}
                        {m.profileId && (
                          <button
                            onClick={() => connecterEnTantQue(m)}
                            disabled={impBusy}
                            className="p-1.5 hover:bg-surface-container-high rounded text-on-surface-variant disabled:opacity-50"
                            title="Connecter en tant que ce membre"
                          >
                            <span className="material-symbols-outlined text-lg">visibility</span>
                          </button>
                        )}
                        <button onClick={() => del(m)} className="p-1.5 hover:bg-error/10 rounded text-on-surface-variant hover:text-error" title="Supprimer">
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {impersonation && <ImpersonationLinkPanel link={impersonation} onClose={clearImpersonation} />}
      <LoadingOverlay visible={impBusy} />
    </main>
  );
}

const LABEL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

function InviteCard({ members, onInvited }: { members: Member[]; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [isDemo, setIsDemo] = useState(false);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite() {
    const e = email.trim();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setMsg({ type: 'error', text: 'Adresse e-mail invalide.' });
      return;
    }
    if (members.some((m) => m.email.toLowerCase() === e.toLowerCase())) {
      setMsg({ type: 'error', text: 'Cet e-mail est déjà dans la liste.' });
      return;
    }
    setBusy(true);
    // Pas de plan à l'invitation : l'abonnement d'un membre n'existe qu'à
    // partir de son inscription (trigger `mc_attach_default_plan`), un
    // invité n'a pas encore de profil pour en porter un.
    const { error } = await createClient()
      .from('allowlist')
      .insert({ email: e, role, is_demo: isDemo, notes: notes.trim() || null, status: 'pending' });
    setBusy(false);
    if (error) {
      setMsg({ type: 'error', text: 'Erreur : ' + error.message });
      return;
    }
    setEmail('');
    setNotes('');
    setIsDemo(false);
    setMsg({ type: 'success', text: `${e} ajouté avec succès.` });
    onInvited();
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden mb-8">
      <div className="p-5 border-b border-outline-variant">
        <h3 className="font-headline-md text-base font-semibold">Inviter un membre</h3>
      </div>
      <div className="p-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <label className={LABEL}>Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@exemple.com"
              onKeyDown={(e) => e.key === 'Enter' && invite()}
              className="border-b border-outline-variant bg-transparent py-2 text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1" style={{ minWidth: '130px' }}>
            <label className={LABEL}>Rôle</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border-b border-outline-variant bg-transparent py-2 text-sm focus:outline-none focus:border-primary">
              <option value="member">Membre</option>
              <option value="gestionnaire">Gestionnaire</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-center gap-3 pb-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} className="w-4 h-4 accent-secondary rounded cursor-pointer" />
              <span className="text-sm text-on-surface-variant">Démo</span>
            </label>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className={LABEL}>Note (optionnel)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex : testeuse CAP"
              className="border-b border-outline-variant bg-transparent py-2 text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={invite}
            disabled={busy}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded hover:opacity-90 transition-all disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-lg">person_add</span> {busy ? 'Envoi…' : 'Inviter'}
          </button>
        </div>
        {msg && <p className={`text-xs mt-3 ${msg.type === 'error' ? 'text-error' : 'text-green-700'}`}>{msg.text}</p>}
      </div>
    </div>
  );
}

