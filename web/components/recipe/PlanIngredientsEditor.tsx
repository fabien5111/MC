'use client';

// Ingrédients en mode planifié (porté de recette.html) : colonnes Coef. /
// Quantité ajustée / Quantité d'origine, lignes barrées (retirées) / modifiées
// (orange) / ajoutées (vert) / déjà en possession (vert barré), édition en
// ligne (crayon), ajout d'un ingrédient par groupe. Persiste dans
// `planning.overrides` à chaque modification (client Supabase navigateur).
import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { RecipeFull } from '@/lib/recipes';
import type { PlanningEntry } from '@/lib/profile';
import type { Unit } from '@/lib/profile';
import type { Json } from '@/lib/database.types';
import { normalizeOverrides, buildGroupRows, ownedGroupOrders, fmtNum, type PlanOverrides, type PlanRow } from '@/lib/recipe-plan';

type EditKey = string | null; // `${groupId}:${rowId}`

export function PlanIngredientsEditor({
  groups,
  steps,
  plan,
  units,
  unitTips,
}: {
  groups: RecipeFull['ingredient_groups'];
  steps: RecipeFull['recipe_steps'];
  plan: PlanningEntry;
  units: Unit[];
  unitTips: Record<string, string>;
}) {
  const router = useRouter();
  const overrides = normalizeOverrides(plan.overrides);
  const [editing, setEditing] = useState<EditKey>(null);
  const [addingGroup, setAddingGroup] = useState<number | null>(null);

  const owned = ownedGroupOrders(overrides, steps);

  // Persiste puis rafraîchit le Server Component parent : la liste complète,
  // la liste de courses et l'ajusteur de quantités dérivent tous des mêmes
  // overrides côté serveur et doivent rester en phase avec cet éditeur.
  async function persist(next: PlanOverrides) {
    const { error } = await createClient()
      .from('planning')
      .update({ overrides: next as unknown as Json })
      .eq('id', plan.id);
    if (error) {
      alert('Modification non enregistrée : ' + error.message);
      return;
    }
    router.refresh();
  }

  function applyEdit(row: PlanRow, qty: string, coef: string) {
    const qv = qty.trim() === '' ? null : parseFloat(qty.replace(',', '.'));
    const cv = coef.trim() === '' ? null : parseFloat(coef.replace(',', '.'));
    const mods = { ...overrides.mods };
    const key = row.id;
    if (qv != null && !isNaN(qv) && qv !== row.adjQty) {
      mods[key] = { qty: qv };
    } else if (cv != null && !isNaN(cv) && cv > 0 && cv !== row.coef) {
      mods[key] = { coef: cv };
    } else {
      setEditing(null);
      return;
    }
    setEditing(null);
    persist({ ...overrides, mods });
  }

  function toggleRemove(row: PlanRow) {
    const mods = { ...overrides.mods };
    mods[row.id] = { ...mods[row.id], removed: !mods[row.id]?.removed };
    persist({ ...overrides, mods });
  }

  function removeAdded(idx: number) {
    const added = overrides.added.filter((_, i) => i !== idx);
    persist({ ...overrides, added });
  }

  function applyEditAdded(idx: number, name: string, qty: string, unit: string) {
    if (!name.trim()) {
      alert("Indiquez un nom d'ingrédient.");
      return;
    }
    const added = overrides.added.map((a, i) => (i === idx ? { ...a, name: name.trim(), qty: qty.trim(), unit: unit.trim() } : a));
    setEditing(null);
    persist({ ...overrides, added });
  }

  function addIng(groupId: number, name: string, qty: string, unit: string) {
    if (!name.trim()) {
      alert("Indiquez un nom d'ingrédient.");
      return;
    }
    const added = [...overrides.added, { group: String(groupId), name: name.trim(), qty: qty.trim(), unit: unit.trim() }];
    setAddingGroup(null);
    persist({ ...overrides, added });
  }

  const LBL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant text-center';
  const gridStyle = { display: 'grid', gridTemplateColumns: 'max-content max-content max-content max-content max-content', columnGap: 32 } as const;
  const rowStyle = { display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1', alignItems: 'center' } as const;

  const withUnit = (text: string, unit: string | null) => {
    const tip = unit ? unitTips[unit.toLowerCase().trim()] : undefined;
    return (
      <>
        {text}
        {text && unit ? ' ' : ''}
        {unit ? (
          tip ? (
            <span className="unit-tip" title={tip}>
              {unit}
            </span>
          ) : (
            unit
          )
        ) : null}
      </>
    );
  };

  return (
    <div className="space-y-10">
      {groups.map((g) => {
        const rows = buildGroupRows(g, plan, overrides, owned.has(g.order_index || 0));
        return (
          <div key={g.id}>
            <h4 className="font-label-md text-label-md text-secondary border-b border-outline-variant pb-2 mb-4">{g.name || ''}</h4>
            <ul style={gridStyle}>
              <li className="pb-1" style={rowStyle}>
                <span />
                <span className={LBL}>Coef.</span>
                <span className={`${LBL} text-primary`}>Quantité ajustée</span>
                <span className={LBL}>Quantité d&apos;origine</span>
                <span />
              </li>
              {rows.map((row) => {
                const key = `${g.id}:${row.id}`;
                const tone = row.removed
                  ? 'text-error line-through'
                  : row.owned
                    ? 'text-green-700 line-through opacity-70'
                    : row.addedIdx != null
                      ? 'text-green-700'
                      : row.modified
                        ? 'text-orange-600'
                        : '';
                const adjText = row.adjQty != null ? fmtNum(row.adjQty) : row.quantity || '';
                const origText = row.addedIdx != null ? '—' : row.quantity || '';
                return (
                  <Fragment key={row.id}>
                    <li className="border-b border-outline-variant/30 py-2" style={rowStyle}>
                      <span className={`font-body-md text-body-md${tone ? ' ' + tone : ''}`}>
                        {row.url ? (
                          <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-secondary">
                            {row.name}
                          </a>
                        ) : (
                          row.name
                        )}
                        {row.comment && <span className="text-on-surface-variant text-sm italic"> — {row.comment}</span>}
                      </span>
                      <span className={`font-label-md text-label-md text-center ${tone || 'text-on-surface-variant'}`}>
                        {row.coef != null ? `× ${fmtNum(row.coef)}` : '—'}
                      </span>
                      <span className={`font-label-md text-label-md text-center ${tone || 'text-primary'}`}>{withUnit(adjText, row.unit)}</span>
                      <span className={`font-label-md text-label-md text-center ${tone || 'text-on-surface-variant'}`}>
                        {row.addedIdx != null ? '—' : withUnit(origText, row.unit)}
                      </span>
                      <span className="flex items-center gap-1 justify-self-center">
                        <button
                          type="button"
                          onClick={() => setEditing(editing === key ? null : key)}
                          title={row.addedIdx != null ? 'Modifier cet ajout' : 'Modifier la quantité ou le coefficient'}
                          className="text-primary hover:opacity-70"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        {row.addedIdx != null ? (
                          <button type="button" onClick={() => removeAdded(row.addedIdx!)} title="Retirer cet ajout" className="text-error hover:opacity-70">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleRemove(row)}
                            title={row.removed ? "Rétablir l'ingrédient" : "Supprimer (barrer) l'ingrédient"}
                            className={row.removed ? 'text-primary hover:opacity-70' : 'text-error hover:opacity-70'}
                          >
                            <span className="material-symbols-outlined text-[18px]">{row.removed ? 'undo' : 'delete'}</span>
                          </button>
                        )}
                      </span>
                    </li>
                    {editing === key &&
                      (row.addedIdx != null ? (
                        <AddedEditForm key={key + '-form'} row={row} units={units} onApply={(n, q, u) => applyEditAdded(row.addedIdx!, n, q, u)} onCancel={() => setEditing(null)} />
                      ) : (
                        <LineEditForm key={key + '-form'} row={row} onApply={(q, c) => applyEdit(row, q, c)} onCancel={() => setEditing(null)} />
                      ))}
                  </Fragment>
                );
              })}
            </ul>
            {addingGroup === g.id ? (
              <AddForm units={units} onAdd={(n, q, u) => addIng(g.id, n, q, u)} onCancel={() => setAddingGroup(null)} />
            ) : (
              <button type="button" onClick={() => setAddingGroup(g.id)} className="mt-3 flex items-center gap-1 text-primary font-label-md text-[12px] hover:underline">
                <span className="material-symbols-outlined text-[16px]">add_circle</span> Ajouter un ingrédient
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const FIELD = 'border border-outline-variant rounded px-3 py-1.5 font-body-md text-sm';

function LineEditForm({ row, onApply, onCancel }: { row: PlanRow; onApply: (qty: string, coef: string) => void; onCancel: () => void }) {
  const [coef, setCoef] = useState(row.coef != null ? fmtNum(row.coef) : '');
  const [qty, setQty] = useState(row.adjQty != null ? fmtNum(row.adjQty) : '');
  return (
    <li style={{ gridColumn: '1/-1' }} className="py-3">
      <div className="flex flex-wrap items-end gap-3">
        <span className="font-body-md text-sm text-on-surface-variant pb-2">{row.name} :</span>
        <label className="flex flex-col gap-1">
          <span className="font-label-md text-[10px] uppercase text-on-surface-variant">Coefficient</span>
          <input type="number" min={0} step="any" value={coef} onChange={(e) => setCoef(e.target.value)} className={FIELD} style={{ width: '6rem' }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-label-md text-[10px] uppercase text-on-surface-variant">ou quantité ajustée{row.unit ? ` (${row.unit})` : ''}</span>
          <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={FIELD} style={{ width: '7rem' }} />
        </label>
        <button type="button" onClick={() => onApply(qty, coef)} className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px]">
          OK
        </button>
        <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
          Annuler
        </button>
      </div>
    </li>
  );
}

function AddedEditForm({ row, units, onApply, onCancel }: { row: PlanRow; units: Unit[]; onApply: (name: string, qty: string, unit: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(row.name);
  const [qty, setQty] = useState(row.quantity || '');
  const [unit, setUnit] = useState(row.unit || '');
  return (
    <li style={{ gridColumn: '1/-1' }} className="py-3">
      <div className="flex flex-wrap items-end gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ingrédient" className={FIELD} style={{ width: '12rem' }} />
        <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantité" type="number" min={0} step="any" className={FIELD} style={{ width: '6rem' }} />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${FIELD} bg-white`} style={{ width: '8rem' }}>
          <option value="">— Unité —</option>
          {units.map((u) => (
            <option key={u.id} value={u.name}>
              {u.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => onApply(name, qty, unit)} className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px]">
          OK
        </button>
        <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
          Annuler
        </button>
      </div>
    </li>
  );
}

function AddForm({ units, onAdd, onCancel }: { units: Unit[]; onAdd: (name: string, qty: string, unit: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  return (
    <div className="flex flex-wrap items-end gap-3 mt-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ingrédient" className={FIELD} style={{ width: '12rem' }} autoFocus />
      <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantité" type="number" min={0} step="any" className={FIELD} style={{ width: '6rem' }} />
      <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${FIELD} bg-white`} style={{ width: '8rem' }}>
        <option value="">— Unité —</option>
        {units.map((u) => (
          <option key={u.id} value={u.name}>
            {u.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => onAdd(name, qty, unit)} className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px]">
        Ajouter
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant"
      >
        Annuler
      </button>
    </div>
  );
}
