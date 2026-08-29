'use client';

// Gestion des membres (porté de admin-membres.html) : stats, filtres, recherche,
// table (profils inscrits + invitations allowlist), édition (statut/rôle/
// démo/notes), invitation, suppression. Mutations via le client navigateur.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import type { Member, AiUsageOverview, AppelIaDetail } from '@/lib/admin';
import { formatDate } from '@/lib/format';
import { formatUsd } from '@/lib/ai/cost';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { withImpersonationSchema, type ImpersonationMode } from '@/lib/impersonation-types';
import { useImpersonateLink, ImpersonationLinkPanel } from '@/components/admin/ImpersonateButton';
import { MemberSubscriptionPanel } from '@/components/admin/MemberSubscriptionPanel';

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
  const [editing, setEditing] = useState<Member | null>(null);
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
                  <tr key={m.id} className="hover:bg-surface-container-low transition-colors">
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
                    <td className="px-6 py-4">
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
                            <span className="material-symbols-outlined text-lg">switch_account</span>
                          </button>
                        )}
                        <button onClick={() => setEditing(m)} className="p-1.5 hover:bg-surface-container-high rounded text-on-surface-variant" title="Modifier">
                          <span className="material-symbols-outlined text-lg">edit_note</span>
                        </button>
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

      {editing && (
        <EditPanel
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
          onDelete={() => { const m = editing; setEditing(null); del(m); }}
          onImpersonate={() => { const m = editing; setEditing(null); connecterEnTantQue(m); }}
        />
      )}

      {impersonation && <ImpersonationLinkPanel link={impersonation} onClose={clearImpersonation} />}
      <LoadingOverlay visible={impBusy} />
    </main>
  );
}

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

const FIELD = 'border border-outline-variant rounded px-3 py-2 bg-white text-sm w-full focus:outline-none focus:border-primary';
const LABEL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

function EditPanel({
  member,
  onClose,
  onSaved,
  onDelete,
  onImpersonate,
}: {
  member: Member;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
  onImpersonate: () => void;
}) {
  const [status, setStatus] = useState(member.status);
  const [role, setRole] = useState(member.role);
  const [isDemo, setIsDemo] = useState(member.is_demo);
  const [abonnementOuvert, setAbonnementOuvert] = useState(false);
  const [notes, setNotes] = useState(member.notes || '');
  const [impAccess, setImpAccess] = useState<ImpersonationMode>(member.impersonationAccess);
  const [busy, setBusy] = useState(false);
  const dialog = useDialog();

  async function save() {
    setBusy(true);
    const supabase = createClient();
    const fields = { status, role, is_demo: isDemo, notes: notes.trim() || null };
    // Les deux lignes sont mises à jour quand elles existent toutes les deux.
    // La fiche affiche en priorité le rôle de l'allowlist (`getAllowlistMembers`)
    // alors que les droits réels se lisent dans `profiles.role` (`lib/auth.ts`) :
    // n'écrire que dans l'allowlist changeait le badge d'un membre déjà inscrit
    // sans rien changer à ses droits.
    // `impersonation_access` n'existe que sur les profils (pas sur l'allowlist) :
    // il ne se règle donc que pour un membre déjà inscrit.
    let error: { message: string } | null = null;
    if (member.allowlistId) {
      ({ error } = await supabase.from('allowlist').update(fields).eq('id', member.allowlistId));
    }
    if (!error && member.profileId) {
      ({ error } = await withImpersonationSchema(supabase)
        .from('profiles')
        .update({ ...fields, impersonation_access: impAccess })
        .eq('id', member.profileId));
    }
    if (!member.allowlistId && !member.profileId) error = { message: 'Membre introuvable' };
    if (error) {
      dialog.alert('Erreur : ' + error.message);
      setBusy(false);
      return;
    }
    onSaved();
  }

  const initials = member.fullName
    ? member.fullName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : member.email[0]?.toUpperCase() || '?';

  return (
    <>
    <Panel title={`Modifier — ${member.fullName || member.email}`} onClose={onClose} onSave={save} busy={busy} onDelete={onDelete}>
      <div className="flex items-center gap-4">
        {member.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
          <img src={member.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-primary-fixed-dim flex items-center justify-center text-on-primary-fixed font-headline-md text-xl font-bold shrink-0">
            {initials}
          </div>
        )}
        <div className="text-sm text-on-surface-variant space-y-0.5">
          <p>
            <span className="font-semibold text-on-surface">{member.profileId ? member.recipeCount : 0}</span> recette
            {(member.profileId ? member.recipeCount : 0) !== 1 ? 's' : ''}
          </p>
          <p>
            Invité le <span className="font-semibold text-on-surface">{formatDate(member.invited_at) || '—'}</span>
          </p>
          <p>
            {member.registeredAt ? (
              <>
                Inscrit le <span className="font-semibold text-on-surface">{formatDate(member.registeredAt)}</span>
              </>
            ) : (
              'Jamais connecté'
            )}
          </p>
        </div>
      </div>
      {member.profileId && (member.coutIaMois != null || member.coutIaTotal != null) && (
        <AiUsageDetail userId={member.profileId} coutMois={member.coutIaMois ?? 0} coutTotal={member.coutIaTotal ?? 0} />
      )}
      <Row label="Statut">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={FIELD}>
          <option value="active">Actif</option>
          <option value="pending">Invité</option>
          <option value="disabled">Désactivé</option>
        </select>
      </Row>
      <Row label="Rôle">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={FIELD}>
          <option value="member">Membre</option>
          <option value="gestionnaire">Gestionnaire</option>
          <option value="admin">Admin</option>
        </select>
        {role === 'gestionnaire' && (
          <span className="text-[11px] text-on-surface-variant mt-1 block">
            Accès restreint au back-office : modération des recettes et rédaction du blog.
            Ni membres, ni référentiels, ni paramètres du site.
          </span>
        )}
      </Row>
      {member.profileId && (
        <Row label="Abonnement">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-on-surface-variant">
              {member.subscription
                ? `${member.subscription.planLabel}${member.subscription.type === 'TRIAL' ? ' (essai)' : ''}`
                : 'Gratuit (par défaut)'}
            </span>
            <button
              type="button"
              onClick={() => setAbonnementOuvert(true)}
              className="rounded-pill border border-outline-variant px-3 py-1.5 text-[12px] font-semibold text-primary hover:bg-surface-container"
            >
              Gérer
            </button>
          </div>
        </Row>
      )}
      {role === 'admin' && member.profileId && (
        <Row label="Droits en « connecté en tant que »">
          <select value={impAccess} onChange={(e) => setImpAccess(e.target.value as ImpersonationMode)} className={FIELD}>
            <option value="read_only">Lecture seule</option>
            <option value="write">Modification</option>
          </select>
          <span className="text-[11px] text-on-surface-variant mt-1 block">
            Niveau hérité par toutes les sessions que cet administrateur ouvrira sur le compte d&apos;un membre.
          </span>
        </Row>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} /> Compte de démonstration
      </label>
      {member.profileId && (
        <button
          type="button"
          onClick={onImpersonate}
          className="w-full flex items-center justify-center gap-2 border border-outline-variant rounded py-2.5 text-sm font-semibold hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-lg">switch_account</span> Connecter en tant que
        </button>
      )}
      <Row label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={FIELD} />
      </Row>
      {member.status === 'pending' && (
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Lien d&apos;invitation</span>
          <div className="flex gap-2">
            <input readOnly value={inviteLinkFor(member.email)} className="flex-1 border-b border-outline-variant bg-transparent py-1.5 text-xs text-on-surface-variant focus:outline-none" type="text" />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(inviteLinkFor(member.email)).then(() => dialog.alert('Lien copié dans le presse-papiers.'))}
              className="text-primary hover:opacity-70 text-sm flex items-center gap-1 shrink-0"
            >
              <span className="material-symbols-outlined text-lg">content_copy</span>
            </button>
          </div>
        </div>
      )}
    </Panel>
    {abonnementOuvert && member.profileId && (
      <MemberSubscriptionPanel
        memberId={member.profileId}
        memberLabel={member.fullName || member.email}
        onClose={() => setAbonnementOuvert(false)}
      />
    )}
    </>
  );
}

// Bloc « Consommation IA » de la fiche membre : mois + total (déjà connus,
// venus de la liste), et les derniers appels — chargés à l'ouverture, RLS
// admin (`ai_usage_select_admin`), sans passer par une route dédiée.
function AiUsageDetail({ userId, coutMois, coutTotal }: { userId: string; coutMois: number; coutTotal: number }) {
  const [appels, setAppels] = useState<AppelIaDetail[] | null>(null);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!ouvert || appels !== null) return;
    let annule = false;
    // `ai_usage` n'est pas encore dans lib/database.types.ts tant que la
    // migration n'a pas été régénérée — cast local, même motif que
    // lib/admin.ts.
    (createClient() as any)
      .from('ai_usage')
      .select(
        'created_at, feature, model, status, input_tokens, cache_creation_tokens, cache_read_tokens, output_tokens, cost_usd, ai_features(label)',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
        if (annule) return;
        if (error) {
          console.error('AiUsageDetail:', error.message);
          setAppels([]);
          return;
        }
        type Row = {
          created_at: string;
          feature: string;
          model: string;
          status: string;
          input_tokens: number;
          cache_creation_tokens: number;
          cache_read_tokens: number;
          output_tokens: number;
          cost_usd: number | string | null;
          ai_features: { label: string } | { label: string }[] | null;
        };
        const rows = ((data as unknown as Row[]) ?? []).map((r) => ({
          created_at: r.created_at,
          feature: r.feature,
          feature_label: Array.isArray(r.ai_features) ? r.ai_features[0]?.label ?? r.feature : r.ai_features?.label ?? r.feature,
          model: r.model,
          tokens: r.input_tokens + r.cache_creation_tokens + r.cache_read_tokens + r.output_tokens,
          cout_usd: r.cost_usd == null ? null : Number(r.cost_usd),
          status: r.status,
        }));
        setAppels(rows);
      });
    return () => {
      annule = true;
    };
  }, [ouvert, appels, userId]);

  return (
    <div className="border border-outline-variant rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-container-low hover:bg-surface-container-high transition-colors text-left"
      >
        <span className="text-sm font-semibold text-on-surface">Consommation IA</span>
        <span className="text-xs text-on-surface-variant">
          {formatUsd(coutMois)} ce mois · {formatUsd(coutTotal)} au total
        </span>
      </button>
      {ouvert && (
        <div className="px-4 py-3 border-t border-outline-variant">
          {appels === null ? (
            <p className="text-xs text-on-surface-variant">Chargement…</p>
          ) : appels.length === 0 ? (
            <p className="text-xs text-on-surface-variant">Aucun appel IA enregistré.</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {appels.map((a, i) => (
                <li key={i} className="flex items-center justify-between text-xs gap-2">
                  <div className="min-w-0">
                    <p className="text-on-surface truncate">{a.feature_label}</p>
                    <p className="text-on-surface-variant">
                      {formatDate(a.created_at)} · {a.model} · {a.tokens.toLocaleString('fr-FR')} tokens
                      {a.status !== 'success' && <span className="text-error"> · échec</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-on-surface font-medium">
                    {a.cout_usd == null ? '—' : formatUsd(a.cout_usd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}

function Panel({
  title,
  onClose,
  onSave,
  busy,
  saveLabel = 'Enregistrer',
  onDelete,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  busy: boolean;
  saveLabel?: string;
  onDelete?: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-bright border-l border-outline-variant z-50 flex flex-col">
        <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant">
          <h3 className="font-headline-md text-xl font-semibold">{title}</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">{children}</div>
        <div className="px-8 py-6 border-t border-outline-variant space-y-3">
          <div className="flex gap-3">
            <button onClick={onSave} disabled={busy} className="flex-1 bg-primary text-on-primary py-3 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-60">
              {busy ? 'Enregistrement…' : saveLabel}
            </button>
            <button onClick={onClose} className="px-6 py-3 border border-outline-variant rounded text-sm font-medium hover:bg-surface-container-high">
              Annuler
            </button>
          </div>
          {onDelete && (
            <>
              <button onClick={onDelete} className="w-full border border-error text-error py-2.5 rounded text-sm font-semibold hover:bg-error/5 transition-colors">
                Supprimer définitivement
              </button>
              <p className="text-[10px] text-on-surface-variant text-center">
                La suppression est irréversible : le compte de connexion est supprimé et les recettes du membre
                seront orphelinées.
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
