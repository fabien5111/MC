'use client';

// Gestion des membres (porté de admin-membres.html) : stats, filtres, recherche,
// table (profils inscrits + invitations allowlist), édition (statut/rôle/plan/
// démo/notes), invitation, suppression. Mutations via le client navigateur.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Member } from '@/lib/admin';

type Filter = 'all' | 'active' | 'pending' | 'disabled' | 'demo';

export function MembersManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const stats = useMemo(
    () => ({
      total: members.length,
      active: members.filter((m) => m.status === 'active').length,
      pending: members.filter((m) => m.status === 'pending').length,
      disabled: members.filter((m) => m.status === 'disabled').length,
    }),
    [members],
  );

  const filtered = useMemo(
    () =>
      members
        .filter((m) => {
          if (filter === 'demo') return m.is_demo;
          if (filter === 'all') return true;
          return m.status === filter;
        })
        .filter((m) => {
          const q = query.toLowerCase();
          return !q || [m.email, m.fullName || '', m.notes || ''].some((v) => v.toLowerCase().includes(q));
        }),
    [members, filter, query],
  );

  async function del(m: Member) {
    if (!confirm(`Supprimer « ${m.fullName || m.email} » ?`)) return;
    const supabase = createClient();
    if (m.allowlistId) await supabase.from('allowlist').delete().eq('id', m.allowlistId);
    if (m.profileId) await supabase.from('profiles').delete().eq('id', m.profileId);
    router.refresh();
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

  return (
    <main className="flex-1 p-margin-mobile md:p-margin-desktop max-w-[1400px] w-full">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {chip('all', 'Tous')}
          {chip('active', 'Actifs')}
          {chip('pending', 'Invités')}
          {chip('disabled', 'Désactivés')}
          {chip('demo', 'Démo')}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          className="border border-outline-variant rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-primary"
        />
        <button onClick={() => setInviteOpen(true)} className="ml-auto flex items-center gap-2 bg-primary text-on-primary px-5 py-2 rounded-full text-sm font-medium hover:opacity-90">
          <span className="material-symbols-outlined text-lg">person_add</span> Inviter
        </button>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[820px]">
          <thead className="bg-surface-container font-label-md text-on-surface-variant border-b border-outline-variant">
            <tr>
              {['Membre', 'Statut', 'Plan / Rôle', 'Recettes', 'Depuis', ''].map((h, i) => (
                <th key={i} className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant text-sm">
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
                        <div className="w-9 h-9 rounded-full bg-primary-fixed-dim flex items-center justify-center text-on-primary-fixed text-xs font-bold">
                          {initials}
                        </div>
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
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        {m.plan === 'paid' ? badge('bg-secondary-container text-on-secondary-container', 'Payant') : badge('bg-outline-variant text-on-surface-variant', 'Free')}
                        {m.role === 'admin' ? badge('bg-primary-fixed text-on-primary-fixed', 'Admin') : badge('bg-surface-container text-on-surface-variant', 'Membre')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-medium text-on-surface">{m.profileId ? m.recipeCount : '—'}</td>
                    <td className="px-6 py-4 text-xs text-on-surface-variant">
                      {m.invited_at ? new Date(m.invited_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end items-center gap-1">
                        {m.notes && (
                          <span className="material-symbols-outlined text-base text-on-surface-variant" title={m.notes}>
                            sticky_note_2
                          </span>
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

      {editing && <EditPanel member={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
      {inviteOpen && <InvitePanel onClose={() => setInviteOpen(false)} onSaved={() => { setInviteOpen(false); router.refresh(); }} />}
    </main>
  );
}

const FIELD = 'border border-outline-variant rounded px-3 py-2 bg-white text-sm w-full focus:outline-none focus:border-primary';
const LABEL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

function EditPanel({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(member.status);
  const [role, setRole] = useState(member.role);
  const [plan, setPlan] = useState(member.plan);
  const [isDemo, setIsDemo] = useState(member.is_demo);
  const [notes, setNotes] = useState(member.notes || '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const supabase = createClient();
    const fields = { status, role, plan, is_demo: isDemo, notes: notes.trim() || null };
    const { error } = member.allowlistId
      ? await supabase.from('allowlist').update(fields).eq('id', member.allowlistId)
      : member.profileId
        ? await supabase.from('profiles').update(fields).eq('id', member.profileId)
        : { error: new Error('Membre introuvable') };
    if (error) {
      alert('Erreur : ' + (error as { message: string }).message);
      setBusy(false);
      return;
    }
    onSaved();
  }

  return (
    <Panel title={`Modifier — ${member.fullName || member.email}`} onClose={onClose} onSave={save} busy={busy}>
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
          <option value="admin">Admin</option>
        </select>
      </Row>
      <Row label="Plan">
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className={FIELD}>
          <option value="free">Free</option>
          <option value="paid">Payant</option>
        </select>
      </Row>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} /> Compte de démonstration
      </label>
      <Row label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={FIELD} />
      </Row>
    </Panel>
  );
}

function InvitePanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [plan, setPlan] = useState('free');
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    const e = email.trim().toLowerCase();
    if (!e) return;
    setBusy(true);
    const { error } = await createClient().from('allowlist').insert({ email: e, role, plan, is_demo: isDemo, status: 'pending' });
    if (error) {
      alert('Erreur : ' + error.message);
      setBusy(false);
      return;
    }
    onSaved();
  }

  return (
    <Panel title="Inviter un membre" onClose={onClose} onSave={save} busy={busy} saveLabel="Inviter">
      <Row label="E-mail">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="membre@exemple.com" className={FIELD} />
      </Row>
      <Row label="Rôle">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={FIELD}>
          <option value="member">Membre</option>
          <option value="admin">Admin</option>
        </select>
      </Row>
      <Row label="Plan">
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className={FIELD}>
          <option value="free">Free</option>
          <option value="paid">Payant</option>
        </select>
      </Row>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} /> Compte de démonstration
      </label>
    </Panel>
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
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  busy: boolean;
  saveLabel?: string;
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
        <div className="px-8 py-6 border-t border-outline-variant flex gap-3">
          <button onClick={onSave} disabled={busy} className="flex-1 bg-primary text-on-primary py-3 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            {busy ? 'Enregistrement…' : saveLabel}
          </button>
          <button onClick={onClose} className="px-6 py-3 border border-outline-variant rounded text-sm font-medium hover:bg-surface-container-high">
            Annuler
          </button>
        </div>
      </aside>
    </>
  );
}
