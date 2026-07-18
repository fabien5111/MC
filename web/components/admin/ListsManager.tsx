'use client';

// Gestion des listes / taxonomies (porté de admin-listes.html) : CRUD générique
// sur recipe_types, tags, mold_types, difficultés, unités, ingrédients et
// ustensiles de référence. La table étant dynamique, les écritures passent par
// un client Supabase non typé (cast local assumé).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Field = { key: string; label: string; type?: 'text' | 'number' | 'select'; options?: string[]; required?: boolean };
type Section = { table: string; label: string; fields: Field[] };

const TOOLTIP: Field = { key: 'tooltip', label: 'Infobulle' };
export const SECTIONS: Section[] = [
  { table: 'recipe_types', label: 'Types de recettes', fields: [{ key: 'name', label: 'Nom', required: true }, TOOLTIP] },
  { table: 'tags', label: 'Tags', fields: [{ key: 'name', label: 'Nom', required: true }, { key: 'slug', label: 'Slug' }, TOOLTIP] },
  {
    table: 'mold_types',
    label: 'Types de moules',
    fields: [{ key: 'name', label: 'Nom', required: true }, { key: 'forme', label: 'Forme', type: 'select', options: ['cylindre', 'rectangulaire', 'demi-cylindre', 'oblong'] }, TOOLTIP],
  },
  { table: 'difficulties', label: 'Difficultés', fields: [{ key: 'name', label: 'Nom', required: true }, { key: 'level', label: 'Niveau (1–5)', type: 'number', required: true }, TOOLTIP] },
  { table: 'units', label: 'Unités', fields: [{ key: 'name', label: 'Nom', required: true }, TOOLTIP] },
  { table: 'ingredient_refs', label: 'Ingrédients', fields: [{ key: 'name', label: 'Libellé', required: true }, { key: 'url', label: 'URL' }, TOOLTIP] },
  { table: 'utensils', label: 'Ustensiles', fields: [{ key: 'name', label: 'Nom', required: true }, { key: 'comment', label: 'Commentaire' }, { key: 'url', label: 'URL' }, TOOLTIP] },
];

type Entry = Record<string, unknown>;

export function ListsManager({ data }: { data: Record<string, Entry[]> }) {
  const router = useRouter();
  const [active, setActive] = useState(SECTIONS[0].table);
  const [editing, setEditing] = useState<Entry | null | undefined>(undefined); // undefined = fermé
  const section = SECTIONS.find((s) => s.table === active)!;
  const rows = data[active] || [];

  async function del(id: unknown) {
    if (!confirm('Supprimer cette entrée ?')) return;
    // Table dynamique : client non typé pour l'opération générique.
    const q = createClient().from(active as never) as unknown as {
      delete: () => { eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }> };
    };
    const { error } = await q.delete().eq('id', id);
    if (error) return void alert('Erreur : ' + error.message);
    router.refresh();
  }

  return (
    <main className="flex-1 flex min-h-0">
      <nav className="w-56 border-r border-outline-variant p-4 space-y-1 shrink-0">
        {SECTIONS.map((s) => (
          <button
            key={s.table}
            onClick={() => setActive(s.table)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              active === s.table ? 'bg-primary-container text-on-primary-container font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {s.label} <span className="text-xs opacity-60">({(data[s.table] || []).length})</span>
          </button>
        ))}
        <a href="/admin/moules" className="block px-3 py-2 rounded text-sm text-on-surface-variant hover:bg-surface-container-high">
          Moules →
        </a>
      </nav>

      <div className="flex-1 p-margin-mobile md:p-margin-desktop min-w-0">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline-md text-primary">{section.label}</h2>
          <button onClick={() => setEditing(null)} className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2 rounded text-sm font-medium hover:opacity-90">
            <span className="material-symbols-outlined text-lg">add</span> Ajouter
          </button>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {section.fields.map((f) => (
                  <th key={f.key} className="px-6 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                    {f.label}
                  </th>
                ))}
                <th className="px-6 py-3 text-right text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={section.fields.length + 1} className="px-6 py-12 text-center text-on-surface-variant">
                    Aucune entrée.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={String(r.id)} className="hover:bg-surface-container-low transition-colors">
                    {section.fields.map((f) => (
                      <td key={f.key} className="px-6 py-3 text-sm text-on-surface">
                        {r[f.key] != null && r[f.key] !== '' ? String(r[f.key]) : <span className="text-on-surface-variant text-xs">—</span>}
                      </td>
                    ))}
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditing(r)} className="p-1.5 hover:bg-surface-container-high rounded text-on-surface-variant" title="Modifier">
                          <span className="material-symbols-outlined text-lg">edit_note</span>
                        </button>
                        <button onClick={() => del(r.id)} className="p-1.5 hover:bg-error/10 rounded text-on-surface-variant hover:text-error" title="Supprimer">
                          <span className="material-symbols-outlined text-lg">delete</span>
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

      {editing !== undefined && (
        <EntryForm
          table={active}
          section={section}
          entry={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function EntryForm({
  table,
  section,
  entry,
  onClose,
  onSaved,
}: {
  table: string;
  section: Section;
  entry: Entry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of section.fields) v[f.key] = entry?.[f.key] != null ? String(entry[f.key]) : '';
    return v;
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    const required = section.fields.find((f) => f.required && !values[f.key].trim());
    if (required) {
      alert(`Champ obligatoire : ${required.label}`);
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {};
    for (const f of section.fields) {
      const raw = values[f.key].trim();
      payload[f.key] = raw === '' ? null : f.type === 'number' ? Number(raw) : raw;
    }
    // Table dynamique : client non typé pour l'opération générique.
    const q = createClient().from(table as never) as unknown as {
      insert: (v: unknown) => Promise<{ error: { message: string } | null }>;
      update: (v: unknown) => { eq: (c: string, val: unknown) => Promise<{ error: { message: string } | null }> };
    };
    const { error } = entry?.id != null ? await q.update(payload).eq('id', entry.id) : await q.insert(payload);
    if (error) {
      alert('Erreur : ' + error.message);
      setBusy(false);
      return;
    }
    onSaved();
  }

  const FIELD = 'border border-outline-variant rounded px-3 py-2 bg-white text-sm w-full focus:outline-none focus:border-primary';

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-bright border-l border-outline-variant z-50 flex flex-col">
        <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant">
          <h3 className="font-headline-md text-xl font-semibold">
            {entry ? 'Modifier' : 'Ajouter'} — {section.label}
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          {section.fields.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">
                {f.label}
                {f.required ? ' *' : ''}
              </span>
              {f.type === 'select' ? (
                <select value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={FIELD}>
                  <option value="">—</option>
                  {(f.options || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className={FIELD}
                />
              )}
            </label>
          ))}
        </div>
        <div className="px-8 py-6 border-t border-outline-variant flex gap-3">
          <button onClick={save} disabled={busy} className="flex-1 bg-primary text-on-primary py-3 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={onClose} className="px-6 py-3 border border-outline-variant rounded text-sm font-medium hover:bg-surface-container-high">
            Annuler
          </button>
        </div>
      </aside>
    </>
  );
}
