'use client';

// Gestion des listes / taxonomies (porté de admin-listes.html) : vue d'ensemble
// en tableau (une ligne par liste, triée alphabétiquement) qui déroule un bloc
// unique de gestion (recherche, filtres par type pour les moules, tableau,
// panneau d'ajout/édition) au clic — reclique sur la ligne active pour
// refermer. CRUD générique sur recipe_types, tags, mold_types, moules,
// difficultés, unités, ingrédients et ustensiles de référence ; la table étant
// dynamique, les écritures passent par un client Supabase non typé (cast local
// assumé).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SECTIONS, SLUG_TABLES, type Section } from '@/lib/admin-lists-config';
import type { MoldType } from '@/lib/admin';
import { ImageSlot } from '@/components/ImageSlot';

type Entry = Record<string, unknown>;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function ListsManager({ data, moldTypes }: { data: Record<string, Entry[]>; moldTypes: MoldType[] }) {
  const router = useRouter();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [moldTypeFilter, setMoldTypeFilter] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Entry | null | undefined>(undefined); // undefined = fermé

  const summaryRows = useMemo(
    () =>
      [...SECTIONS].sort((a, b) => a.label.localeCompare(b.label, 'fr')).map((s) => ({ ...s, count: (data[s.table] || []).length })),
    [data],
  );

  const section = activeKey ? SECTIONS.find((s) => s.table === activeKey) : null;
  const isMolds = activeKey === 'molds';

  const rows = useMemo(() => {
    if (!activeKey || !section) return [];
    let entries = data[activeKey] || [];
    if (isMolds && moldTypeFilter !== null) entries = entries.filter((e) => e.type_id === moldTypeFilter);
    const q = search.toLowerCase();
    if (q) {
      entries = entries.filter((e) =>
        isMolds ? String(e.name || '').toLowerCase().includes(q) : section.fields.some((f) => String(e[f.key] || '').toLowerCase().includes(q)),
      );
    }
    return entries;
  }, [activeKey, section, isMolds, moldTypeFilter, search, data]);

  function selectList(key: string) {
    if (activeKey === key) {
      setActiveKey(null);
      return;
    }
    setActiveKey(key);
    setMoldTypeFilter(null);
    setSearch('');
  }

  async function del(table: string, id: unknown, label: string) {
    if (!confirm(`Supprimer « ${label} » ?`)) return;
    const q = createClient().from(table as never) as unknown as {
      delete: () => { eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }> };
    };
    const { error } = await q.delete().eq('id', id);
    if (error) return void alert('Erreur : ' + error.message);
    router.refresh();
  }

  return (
    <div className="p-margin-desktop flex flex-col gap-gutter">
      {/* Vue d'ensemble */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
        <div className="p-6 border-b border-outline-variant">
          <h3 className="font-headline-md text-lg font-semibold">Vue d&apos;ensemble</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Liste</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-center">Entrées</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {summaryRows.map((r) => {
                const active = activeKey === r.table;
                return (
                  <tr
                    key={r.table}
                    onClick={() => selectList(r.table)}
                    className={`cursor-pointer hover:bg-surface-container-low transition-colors ${active ? 'bg-primary-container/40' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-on-surface">{r.label}</span>
                        <span className="text-xs text-on-surface-variant">{r.desc}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full ${r.badge} text-[11px] font-bold uppercase tracking-wider`}>{r.type}</span>
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-medium">{r.count}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${active ? 'text-primary' : 'text-on-surface-variant'}`}>
                        <span className="material-symbols-outlined text-sm">{active ? 'expand_less' : 'edit_note'}</span>
                        {active ? 'Actif' : 'Gérer'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bloc unique de gestion */}
      {section && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex items-center justify-between gap-4">
            <div>
              <h3 className="font-headline-md text-lg font-semibold">{section.label}</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">{section.desc}</p>
            </div>
            <button
              onClick={() => setEditing(null)}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded hover:opacity-90 transition-all"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              <span>Ajouter</span>
            </button>
          </div>

          {isMolds && (
            <div className="px-6 py-3 border-b border-outline-variant flex flex-wrap gap-2 items-center">
              <button
                onClick={() => setMoldTypeFilter(null)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  moldTypeFilter === null ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                Tous
              </button>
              {moldTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setMoldTypeFilter(t.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    moldTypeFilter === t.id ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}

          <div className="px-6 py-3 border-b border-outline-variant">
            <div className="relative inline-block">
              <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="pl-8 pr-3 py-1.5 border border-outline-variant rounded text-sm bg-surface-container-low focus:outline-none focus:border-primary"
                type="text"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  {(isMolds ? ['Libellé', 'Type de moule', 'Infobulle'] : section.fields.map((f) => f.label)).map((h) => (
                    <th key={h} className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                  <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={(isMolds ? 3 : section.fields.length) + 1} className="px-6 py-10 text-center text-on-surface-variant text-sm">
                      Aucune entrée.
                    </td>
                  </tr>
                ) : (
                  rows.map((e) => (
                    <tr key={String(e.id)} className="hover:bg-surface-container-low transition-colors">
                      {isMolds ? (
                        <>
                          <td className="px-6 py-4 text-sm font-semibold text-on-surface">{String(e.name)}</td>
                          <td className="px-6 py-4">
                            {(e.mold_types as { name: string } | null)?.name ? (
                              <span className="px-2.5 py-1 rounded-full bg-primary-fixed text-on-primary-fixed text-[11px] font-bold uppercase tracking-wider">
                                {(e.mold_types as { name: string }).name}
                              </span>
                            ) : (
                              <span className="text-on-surface-variant text-xs">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-on-surface-variant italic max-w-[240px] truncate" title={(e.tooltip as string) || undefined}>
                            {(e.tooltip as string) || '—'}
                          </td>
                        </>
                      ) : (
                        section.fields.map((f) => {
                          const val = e[f.key];
                          if (f.refTable) {
                            const linked = (data[f.refTable] || []).find((x) => String(x.id) === String(val));
                            return (
                              <td key={f.key} className="px-6 py-4 text-sm">
                                {linked ? (
                                  <span className="px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-bold uppercase tracking-wider">
                                    {String(linked.name)}
                                  </span>
                                ) : (
                                  <span className="text-on-surface-variant text-xs">—</span>
                                )}
                              </td>
                            );
                          }
                          if (f.type === 'image') {
                            return (
                              <td key={f.key} className="px-6 py-4 text-sm">
                                {val ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- data-URL stockée en base
                                  <img
                                    src={String(val)}
                                    alt=""
                                    className="w-9 h-9 rounded object-contain bg-surface-container"
                                  />
                                ) : (
                                  <span className="text-on-surface-variant text-xs">—</span>
                                )}
                              </td>
                            );
                          }
                          if (f.key === 'url' && val) {
                            return (
                              <td key={f.key} className="px-6 py-4 text-sm">
                                {val ? (
                                  <a href={String(val)} target="_blank" rel="noopener noreferrer" className="text-secondary hover:text-primary underline underline-offset-2 break-all">
                                    {String(val)}
                                  </a>
                                ) : (
                                  <span className="text-on-surface-variant text-xs">—</span>
                                )}
                              </td>
                            );
                          }
                          if (f.key === 'tooltip') {
                            return (
                              <td key={f.key} className="px-6 py-4 text-sm text-on-surface-variant italic max-w-[240px] truncate" title={(val as string) || undefined}>
                                {(val as string) || '—'}
                              </td>
                            );
                          }
                          return (
                            <td key={f.key} className="px-6 py-4 text-sm text-on-surface">
                              {val != null && val !== '' ? String(val) : <span className="text-on-surface-variant text-xs">—</span>}
                            </td>
                          );
                        })
                      )}
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditing(e)} className="p-2 hover:bg-surface-container-high rounded text-on-surface-variant" title="Modifier">
                            <span className="material-symbols-outlined text-xl">edit_note</span>
                          </button>
                          <button
                            onClick={() => del(activeKey!, e.id, isMolds ? String(e.name) : String(e[section.fields[0].key]))}
                            className="p-2 hover:bg-error/10 rounded text-on-surface-variant hover:text-error"
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
      )}

      {section && editing !== undefined && (
        <EntryForm
          table={activeKey!}
          section={section}
          moldTypes={moldTypes}
          refData={data}
          entry={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const FIELD = 'w-full border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors';
const LABEL = 'text-xs font-semibold text-on-surface-variant uppercase tracking-wider';

function EntryForm({
  table,
  section,
  moldTypes,
  refData,
  entry,
  onClose,
  onSaved,
}: {
  table: string;
  section: Section;
  moldTypes: MoldType[];
  refData: Record<string, Entry[]>;
  entry: Entry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isMolds = table === 'molds';
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (isMolds) {
      return {
        name: entry?.name != null ? String(entry.name) : '',
        type_id: entry?.type_id != null ? String(entry.type_id) : '',
        tooltip: entry?.tooltip != null ? String(entry.tooltip) : '',
      };
    }
    const v: Record<string, string> = {};
    for (const f of section.fields) v[f.key] = entry?.[f.key] != null ? String(entry[f.key]) : '';
    return v;
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (isMolds && !values.name.trim()) return;
    if (!isMolds) {
      const required = section.fields.find((f) => f.required && !values[f.key].trim());
      if (required) {
        alert(`Champ obligatoire : ${required.label}`);
        return;
      }
    }
    setBusy(true);
    let payload: Record<string, unknown>;
    if (isMolds) {
      payload = {
        name: values.name.trim(),
        type_id: values.type_id ? Number(values.type_id) : null,
        tooltip: values.tooltip.trim() || null,
      };
    } else {
      payload = {};
      for (const f of section.fields) {
        const raw = values[f.key].trim();
        payload[f.key] = raw === '' ? null : f.type === 'number' || f.refTable ? Number(raw) : raw;
      }
      // Tables à colonne slug NOT NULL non exposée dans le formulaire.
      if (SLUG_TABLES.includes(table) && !payload.slug && typeof payload.name === 'string') {
        payload.slug = slugify(payload.name);
      }
    }
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

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-bright border-l border-outline-variant z-50 flex flex-col">
        <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant">
          <h3 className="font-headline-md text-xl font-semibold">
            {entry ? `Modifier ${isMolds ? 'le moule' : "l'entrée"}` : `Ajouter ${isMolds ? 'un moule' : 'une entrée'}`}
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {isMolds ? (
            <>
              <div className="flex flex-col gap-2">
                <label className={LABEL}>Libellé *</label>
                <input
                  value={values.name}
                  onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                  placeholder="ex : Cercle inox Ø 20cm"
                  className={FIELD}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className={LABEL}>Type de moule</label>
                <select value={values.type_id} onChange={(e) => setValues((v) => ({ ...v, type_id: e.target.value }))} className={FIELD}>
                  <option value="">— Sans type —</option>
                  {moldTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className={LABEL}>Infobulle</label>
                <input
                  value={values.tooltip}
                  onChange={(e) => setValues((v) => ({ ...v, tooltip: e.target.value }))}
                  placeholder="Texte d'aide affiché au survol"
                  className={FIELD}
                />
              </div>
            </>
          ) : (
            section.fields.map((f, i) => {
              // Champ image (ex. picto d'allergène) : hors d'un <label>, car
              // l'ImageSlot embarque son propre input fichier — l'enrober dans
              // un label déclencherait une double ouverture du sélecteur.
              if (f.type === 'image') {
                return (
                  <div key={f.key} className="flex flex-col gap-2">
                    <span className={LABEL}>
                      {f.label}
                      {f.required ? ' *' : ''}
                    </span>
                    <ImageSlot
                      src={values[f.key] || null}
                      onChange={(dataUrl) => setValues((v) => ({ ...v, [f.key]: dataUrl }))}
                      onClear={() => setValues((v) => ({ ...v, [f.key]: '' }))}
                      shape="rounded"
                      fit="contain"
                      maxWidth={256}
                      placeholder="Déposez un picto"
                      className="w-28 h-28"
                    />
                  </div>
                );
              }
              return (
              <label key={f.key} className="flex flex-col gap-2">
                <span className={LABEL}>
                  {f.label}
                  {f.required ? ' *' : ''}
                </span>
                {f.type === 'select' && f.refTable ? (
                  <select value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={FIELD}>
                    <option value="">— Aucun —</option>
                    {(refData[f.refTable] || []).map((o) => (
                      <option key={String(o.id)} value={String(o.id)}>
                        {String(o.name)}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'select' ? (
                  <select value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={FIELD}>
                    <option value="">— choisir —</option>
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
                    autoFocus={i === 0}
                  />
                )}
              </label>
              );
            })
          )}
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
