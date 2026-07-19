'use client';

// Gestion des membres (porté de admin-membres.html) : stats, filtres, recherche,
// table (profils inscrits + invitations allowlist), édition (statut/rôle/plan/
// démo/notes), invitation, suppression. Mutations via le client navigateur.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Member } from '@/lib/admin';
import { formatDate } from '@/lib/format';

type Filter = 'all' | 'active' | 'pending' | 'disabled' | 'demo';

function inviteLinkFor(email: string): string {
  return `${window.location.origin}/connexion?invite=${encodeURIComponent(email)}`;
}

export function MembersManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);

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

  function copyInviteLinkFor(email: string) {
    navigator.clipboard.writeText(inviteLinkFor(email)).then(() => alert(`Lien d'invitation copié pour ${email}`));
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

      <InviteCard members={members} onInvited={() => router.refresh()} />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {chip('all', 'Tous')}
          {chip('active', 'Actifs')}
          {chip('pending', 'Invités')}
          {chip('disabled', 'Désactivés')}
          {chip('demo', 'Démo')}
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
        <table className="w-full text-left border-collapse min-w-[820px]">
          <thead className="bg-surface-container font-label-md text-on-surface-variant border-b border-outline-variant">
            <tr>
              {['Membre', 'Statut', 'Accès', 'Plan / Rôle', 'Recettes', 'Depuis', ''].map((h, i) => (
                <th key={i} className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-on-surface-variant text-sm">
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
                        {m.status === 'pending' && (
                          <button onClick={() => copyInviteLinkFor(m.email)} className="p-1.5 hover:bg-surface-container-high rounded text-on-surface-variant" title="Copier le lien d'invitation">
                            <span className="material-symbols-outlined text-lg">link</span>
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
        />
      )}
    </main>
  );
}

function InviteCard({ members, onInvited }: { members: Member[]; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [plan, setPlan] = useState('free');
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
    const { error } = await createClient()
      .from('allowlist')
      .insert({ email: e, role, plan, is_demo: isDemo, notes: notes.trim() || null, status: 'pending' });
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
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex flex-col gap-1" style={{ minWidth: '130px' }}>
            <label className={LABEL}>Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full border-b border-outline-variant bg-transparent py-2 text-sm focus:outline-none focus:border-primary">
              <option value="free">Free</option>
              <option value="paid">Payant</option>
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
}: {
  member: Member;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
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

  const initials = member.fullName
    ? member.fullName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : member.email[0]?.toUpperCase() || '?';

  return (
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
      {member.status === 'pending' && (
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Lien d&apos;invitation</span>
          <div className="flex gap-2">
            <input readOnly value={inviteLinkFor(member.email)} className="flex-1 border-b border-outline-variant bg-transparent py-1.5 text-xs text-on-surface-variant focus:outline-none" type="text" />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(inviteLinkFor(member.email)).then(() => alert('Lien copié dans le presse-papiers.'))}
              className="text-primary hover:opacity-70 text-sm flex items-center gap-1 shrink-0"
            >
              <span className="material-symbols-outlined text-lg">content_copy</span>
            </button>
          </div>
        </div>
      )}
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
                La suppression est irréversible. Les recettes du membre seront orphelinées.
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
