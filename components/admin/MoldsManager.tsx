'use client';

// Gestion des moules (porté de admin-moules.html) : table filtrable/cherchable +
// panneau latéral d'ajout/édition + suppression. CRUD via le client Supabase
// navigateur puis router.refresh().
//
// NOTE : le champ « Nombre de personnes » de la maquette vanilla référence une
// colonne molds.servings ABSENTE de la base live (confirmé par gen:types) ; il
// est donc omis ici. À réintroduire une fois la colonne ajoutée en base.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Mold, MoldType } from '@/lib/admin';

export function MoldsManager({ molds, moldTypes }: { molds: Mold[]; moldTypes: MoldType[] }) {
  const router = useRouter();
  const [activeType, setActiveType] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Mold | null | undefined>(undefined); // undefined = fermé, null = création

  const filtered = useMemo(
    () =>
      molds.filter((m) => {
        const matchType = activeType === null || m.type_id === activeType;
        const matchSearch = !query || m.name.toLowerCase().includes(query.toLowerCase());
        return matchType && matchSearch;
      }),
    [molds, activeType, query],
  );

  const chip = (active: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
      active
        ? 'bg-primary text-on-primary'
        : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
    }`;

  async function remove(m: Mold) {
    if (!confirm(`Supprimer le moule « ${m.name} » ?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from('molds').delete().eq('id', m.id);
    if (error) return void alert('Erreur : ' + error.message);
    router.refresh();
  }

  return (
    <>
      <header className="h-20 border-b border-outline-variant bg-surface-bright flex items-center justify-between px-margin-desktop sticky top-0 z-10">
        <div>
          <h2 className="text-xl font-headline-md font-semibold text-on-surface">Gestion des Moules</h2>
          <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-0.5">
            <Link href="/admin" className="hover:text-primary transition-colors">Admin</Link>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <Link href="/admin/listes" className="hover:text-primary transition-colors">Listes</Link>
            <span className="material-symbols-outlined text-[10px]">chevron_right</span>
            <span>Moules</span>
          </div>
        </div>
        <button
          onClick={() => setEditing(null)}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-medium rounded hover:opacity-90 transition-all shadow-sm"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          <span>Ajouter un moule</span>
        </button>
      </header>

      <div className="p-margin-desktop flex flex-col gap-gutter">
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={() => setActiveType(null)} className={chip(activeType === null)}>
            Tous
          </button>
          {moldTypes.map((t) => (
            <button key={t.id} onClick={() => setActiveType(t.id)} className={chip(activeType === t.id)}>
              {t.name}
            </button>
          ))}
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex items-center justify-between gap-4">
            <h3 className="font-headline-md text-lg font-semibold">
              Moules <span className="text-on-surface-variant text-sm font-normal">({filtered.length})</span>
            </h3>
            <div className="relative max-w-xs w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                search
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-outline-variant rounded text-sm bg-surface-container-low focus:outline-none focus:border-primary"
                placeholder="Rechercher un moule…"
                type="text"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Libellé</th>
                  <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Type de moule</th>
                  <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Infobulle</th>
                  <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-on-surface-variant">
                      Aucun moule trouvé.
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => (
                    <tr key={m.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-6 py-4 text-sm font-semibold text-on-surface">{m.name}</td>
                      <td className="px-6 py-4">
                        {m.mold_types ? (
                          <span className="px-2.5 py-1 rounded-full bg-primary-fixed text-on-primary-fixed text-[11px] font-bold uppercase tracking-wider">
                            {m.mold_types.name}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant text-xs">—</span>
                        )}
                      </td>
                      <td
                        className="px-6 py-4 text-sm text-on-surface-variant italic max-w-[240px] truncate"
                        title={m.tooltip || undefined}
                      >
                        {m.tooltip || <span className="not-italic text-xs">—</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditing(m)}
                            className="p-2 hover:bg-surface-container-high rounded transition-colors text-on-surface-variant"
                            title="Modifier"
                          >
                            <span className="material-symbols-outlined text-xl">edit_note</span>
                          </button>
                          <button
                            onClick={() => remove(m)}
                            className="p-2 hover:bg-error/10 rounded transition-colors text-on-surface-variant hover:text-error"
                            title="Supprimer"
                          >
                            <span className="material-symbols-outlined text-xl">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing !== undefined && (
        <MoldForm
          mold={editing}
          moldTypes={moldTypes}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function MoldForm({
  mold,
  moldTypes,
  onClose,
  onSaved,
}: {
  mold: Mold | null;
  moldTypes: MoldType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(mold?.name ?? '');
  const [typeId, setTypeId] = useState<string>(mold?.type_id ? String(mold.type_id) : '');
  const [tooltip, setTooltip] = useState(mold?.tooltip ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const fields = {
      name: name.trim(),
      type_id: typeId ? Number(typeId) : null,
      tooltip: tooltip.trim() || null,
    };
    const { error } = mold
      ? await supabase.from('molds').update(fields).eq('id', mold.id)
      : await supabase.from('molds').insert(fields);
    if (error) {
      alert('Erreur : ' + error.message);
      setBusy(false);
      return;
    }
    onSaved();
  }

  const inputCls =
    'w-full border-b border-outline-variant bg-transparent py-2 text-on-surface focus:outline-none focus:border-primary transition-colors text-sm';
  const lblCls = 'text-xs font-semibold text-on-surface-variant uppercase tracking-wider';

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 animate-fade-in" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-bright border-l border-outline-variant z-50 flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant">
          <h3 className="font-headline-md text-xl font-semibold">
            {mold ? 'Modifier le moule' : 'Ajouter un moule'}
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div className="flex flex-col gap-2">
            <label className={lblCls}>Libellé du moule *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              type="text"
              placeholder="ex : Cercle inox Ø 20cm"
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className={lblCls}>Type de moule</label>
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={inputCls}>
              <option value="">— Sans type —</option>
              {moldTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className={lblCls}>Infobulle</label>
            <input
              value={tooltip}
              onChange={(e) => setTooltip(e.target.value)}
              type="text"
              placeholder="Texte d'aide affiché au survol"
              className={inputCls}
            />
          </div>
        </div>
        <div className="px-8 py-6 border-t border-outline-variant flex gap-3">
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 bg-primary text-on-primary py-3 rounded text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-60"
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 border border-outline-variant rounded text-sm font-medium hover:bg-surface-container-high transition-colors"
          >
            Annuler
          </button>
        </div>
      </aside>
    </>
  );
}
