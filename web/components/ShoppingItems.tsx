'use client';

// Liste d'articles cochables + ajout/édition (porté de profil.html, panneau
// « courses-detail » — plus complet que courses.html qui n'a que la coche).
// La coche est optimiste puis persistée via le client Supabase navigateur
// (RLS appliquée par la session partagée en cookies).
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ShoppingItem } from '@/lib/shopping';
import type { Unit } from '@/lib/profile';

export function ShoppingItems({
  listId,
  listName,
  initialItems,
  units,
}: {
  listId: number;
  listName: string;
  initialItems: ShoppingItem[];
  units: Unit[];
}) {
  const [items, setItems] = useState(() => [...initialItems].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const total = items.length;
  const done = items.filter((i) => i.checked).length;

  async function toggle(id: number, checked: boolean) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked } : i)));
    const supabase = createClient();
    const { error } = await supabase.from('shopping_list_items').update({ checked }).eq('id', id);
    if (error) {
      // Rollback si l'enregistrement échoue.
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !checked } : i)));
      alert('Coche non enregistrée : ' + error.message);
    }
  }

  async function applyEdit(id: number, name: string, quantity: string, unit: string) {
    if (!name.trim()) {
      alert('Indiquez un libellé.');
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from('shopping_list_items')
      .update({ name: name.trim(), quantity: quantity.trim() || null, unit: unit || null })
      .eq('id', id);
    if (error) {
      alert('Erreur : ' + error.message);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name: name.trim(), quantity: quantity.trim() || null, unit: unit || null } : i)));
    setEditingId(null);
  }

  async function addItem(name: string, quantity: string, unit: string) {
    if (!name.trim()) {
      alert('Indiquez un libellé.');
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from('shopping_list_items')
      .insert({ list_id: listId, name: name.trim(), quantity: quantity.trim() || null, unit: unit || null, checked: false })
      .select()
      .single();
    if (error) {
      alert('Erreur : ' + error.message);
      return;
    }
    setItems((prev) => [...prev, data].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')));
    setAdding(false);
  }

  return (
    <>
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-8 border-b border-outline-variant pb-4">
        <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary flex items-center gap-3">
          <span className="material-symbols-outlined text-[32px]">shopping_bag</span>
          <span>{listName}</span>
        </h1>
        <span className="font-label-md text-label-md text-on-surface-variant">
          {total} article{total > 1 ? 's' : ''}
          {done ? ` · ${done} coché${done > 1 ? 's' : ''}` : ''}
        </span>
      </div>

      {total === 0 ? (
        <p className="text-on-surface-variant italic">Cette liste est vide.</p>
      ) : (
        <ul className="flex flex-col max-w-2xl">
          {items.map((i) => {
            const qty = [i.quantity, i.unit].filter(Boolean).join(' ');
            const struck = i.checked ? 'line-through opacity-50' : '';
            return (
              <li key={i.id}>
                <div className="flex items-center gap-4 py-3 border-b border-outline-variant/30">
                  <input
                    type="checkbox"
                    checked={i.checked ?? false}
                    onChange={(e) => toggle(i.id, e.target.checked)}
                    className="w-5 h-5 rounded border-outline text-primary focus:ring-primary cursor-pointer shrink-0"
                  />
                  <span className={`font-body-md text-body-md flex-1 ${struck}`}>{i.name}</span>
                  <span className={`font-label-md text-label-md text-primary whitespace-nowrap ${struck}`}>{qty}</span>
                  <button
                    type="button"
                    onClick={() => setEditingId(editingId === i.id ? null : i.id)}
                    title="Modifier cet article"
                    className="text-primary hover:opacity-70 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                </div>
                {editingId === i.id && <EditItemRow item={i} units={units} onApply={(n, q, u) => applyEdit(i.id, n, q, u)} onCancel={() => setEditingId(null)} />}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <AddItemRow units={units} onAdd={addItem} onCancel={() => setAdding(false)} />
      ) : (
        <div className="flex flex-wrap items-end gap-3 mt-8 pt-6 border-t border-outline-variant/50 max-w-2xl">
          <button type="button" onClick={() => setAdding(true)} className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px] flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">add_circle</span> Ajouter
          </button>
        </div>
      )}
    </>
  );
}

const FIELD = 'border border-outline-variant rounded px-3 py-1.5 font-body-md text-sm';
const LBL = 'font-label-md text-[10px] uppercase text-on-surface-variant';

function EditItemRow({ item, units, onApply, onCancel }: { item: ShoppingItem; units: Unit[]; onApply: (name: string, qty: string, unit: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(item.name || '');
  const [qty, setQty] = useState(item.quantity || '');
  const [unit, setUnit] = useState(item.unit || '');
  return (
    <div className="py-3 border-b border-outline-variant/30">
      <div className="flex flex-wrap items-end gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ingrédient" className={FIELD} style={{ width: '13rem' }} autoFocus />
        <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min={0} step="any" placeholder="Quantité" className={FIELD} style={{ width: '6rem' }} />
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
    </div>
  );
}

function AddItemRow({ units, onAdd, onCancel }: { units: Unit[]; onAdd: (name: string, qty: string, unit: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  return (
    <div className="flex flex-wrap items-end gap-3 mt-8 pt-6 border-t border-outline-variant/50 max-w-2xl">
      <label className="flex flex-col gap-1">
        <span className={LBL}>Ingrédient</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex : Beurre" className={FIELD} style={{ width: '13rem' }} autoFocus />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LBL}>Quantité</span>
        <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min={0} step="any" className={FIELD} style={{ width: '6rem' }} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LBL}>Unité</span>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${FIELD} bg-white`} style={{ width: '8rem' }}>
          <option value="">— Unité —</option>
          {units.map((u) => (
            <option key={u.id} value={u.name}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => onAdd(name, qty, unit)} className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px] flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]">add_circle</span> Ajouter
      </button>
      <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
        Annuler
      </button>
    </div>
  );
}
