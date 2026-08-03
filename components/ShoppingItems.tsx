'use client';

// Liste d'articles cochables + ajout/édition (porté de profil.html, panneau
// « courses-detail » — plus complet que courses.html qui n'a que la coche).
// La coche est optimiste puis persistée via le client Supabase navigateur
// (RLS appliquée par la session partagée en cookies).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import type { ShoppingItem } from '@/lib/shopping';
import type { Unit } from '@/lib/profile';
import { ingredientConversionText, resolveIngredientRefId, type ConversionRef, type IngredientRefOption } from '@/lib/ingredient-conversions';

// Délai de regroupement des resynchronisations serveur (voir scheduleRefresh).
const REFRESH_DELAY = 2000;

const sameUnit = (a: string | null, b: string | null) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

export function ShoppingItems({
  listId,
  listName,
  initialItems,
  units,
  conversions,
  ingredientRefs,
}: {
  listId: number;
  listName: string;
  initialItems: ShoppingItem[];
  units: Unit[];
  conversions: ConversionRef[];
  ingredientRefs: IngredientRefOption[];
}) {
  const router = useRouter();
  const dialog = useDialog();
  const { mutate } = useMutation();
  const [items, setItems] = useState(() => [...initialItems].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mergingId, setMergingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [hideChecked, setHideChecked] = useState(false);

  const total = items.length;
  const done = items.filter((i) => i.checked).length;

  // Les compteurs « Articles / Cochés » du profil sont rendus côté serveur :
  // ils doivent être resynchronisés après les écritures. Un router.refresh()
  // par case cochée ferait un aller-retour serveur à chaque clic (usage en
  // cuisine, réseau parfois médiocre) : on regroupe les écritures et on ne
  // resynchronise qu'à l'arrêt des clics — ou aussitôt en quittant la liste
  // (cf. l'effet de démontage ci-dessous). L'affichage local, lui, est déjà à
  // jour : le refresh ne sert qu'aux vues serveur voisines.
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    pending.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      pending.current = false;
      router.refresh();
    }, REFRESH_DELAY);
  }, [router]);

  // Sortie de la liste avant l'échéance : on resynchronise sans attendre, sinon
  // les compteurs du profil resteraient figés.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) router.refresh();
    },
    [router],
  );

  async function toggle(id: number, checked: boolean) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked } : i))); // optimiste
    const ok = await mutate(() => createClient().from('shopping_list_items').update({ checked }).eq('id', id), {
      errorLabel: 'Coche non enregistrée',
      refresh: false,
    });
    if (!ok) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !checked } : i))); // rollback
      return;
    }
    scheduleRefresh();
  }

  async function applyEdit(id: number, name: string, quantity: string, unit: string) {
    if (!name.trim()) {
      dialog.alert('Indiquez un libellé.');
      return;
    }
    const ref_id = resolveIngredientRefId(name, ingredientRefs);
    const ok = await mutate(
      () =>
        createClient()
          .from('shopping_list_items')
          .update({ name: name.trim(), quantity: quantity.trim() || null, unit: unit || null, ref_id })
          .eq('id', id),
      { refresh: false },
    );
    if (!ok) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name: name.trim(), quantity: quantity.trim() || null, unit: unit || null, ref_id } : i)));
    setEditingId(null);
    scheduleRefresh();
  }

  // Fusion manuelle de deux lignes (picto à côté du crayon) : la quantité de
  // l'article choisi s'ajoute à celle de l'article courant, qui est ensuite
  // supprimé. Restreint aux articles de même unité — additionner des
  // quantités d'unités différentes n'aurait pas de sens.
  async function mergeItems(targetId: number, sourceId: number) {
    const target = items.find((i) => i.id === targetId);
    const source = items.find((i) => i.id === sourceId);
    if (!target || !source) return;
    const a = parseFloat(String(target.quantity || '').replace(',', '.'));
    const b = parseFloat(String(source.quantity || '').replace(',', '.'));
    const newQty = !isNaN(a) && !isNaN(b) ? String(+(a + b).toFixed(2)) : [target.quantity, source.quantity].filter(Boolean).join(' + ');
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        const { error } = await supabase.from('shopping_list_items').update({ quantity: newQty }).eq('id', targetId);
        if (error) return { error };
        return supabase.from('shopping_list_items').delete().eq('id', sourceId);
      },
      { errorLabel: 'Fusion impossible', refresh: false },
    );
    if (!ok) return;
    setItems((prev) => prev.filter((i) => i.id !== sourceId).map((i) => (i.id === targetId ? { ...i, quantity: newQty } : i)));
    setMergingId(null);
    scheduleRefresh();
  }

  // Non passé par useMutation : la ligne insérée est nécessaire (son id) pour
  // compléter l'état local sans attendre la resynchronisation.
  async function addItem(name: string, quantity: string, unit: string) {
    if (!name.trim()) {
      dialog.alert('Indiquez un libellé.');
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from('shopping_list_items')
      .insert({ list_id: listId, name: name.trim(), quantity: quantity.trim() || null, unit: unit || null, checked: false, ref_id: resolveIngredientRefId(name, ingredientRefs) })
      .select()
      .single();
    if (error) {
      dialog.alert('Erreur : ' + error.message);
      return;
    }
    setItems((prev) => [...prev, data].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')));
    setAdding(false);
    scheduleRefresh();
  }

  return (
    <>
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-8 border-b border-outline-variant pb-4">
        <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary flex items-center gap-3">
          <span className="material-symbols-outlined text-[32px]">shopping_bag</span>
          <span>{listName}</span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="font-label-md text-label-md text-on-surface-variant">
            {total} article{total > 1 ? 's' : ''}
            {done ? ` · ${done} coché${done > 1 ? 's' : ''}` : ''}
          </span>
          {done > 0 && (
            <label className="flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant cursor-pointer">
              <input
                type="checkbox"
                checked={hideChecked}
                onChange={(e) => setHideChecked(e.target.checked)}
                className="w-4 h-4 rounded border-outline accent-primary focus:ring-primary cursor-pointer"
              />
              Masquer les cochés
            </label>
          )}
        </div>
      </div>

      {total === 0 ? (
        <p className="text-on-surface-variant italic">Cette liste est vide.</p>
      ) : (
        <ul className="flex flex-col max-w-2xl">
          {items.filter((i) => !hideChecked || !i.checked).map((i) => {
            const qty = [i.quantity, i.unit].filter(Boolean).join(' ');
            const conv = ingredientConversionText(conversions, units, i.ref_id, i.unit, i.quantity);
            const struck = i.checked ? 'line-through opacity-50' : '';
            return (
              <li key={i.id}>
                <div className="flex items-center gap-4 py-3 border-b border-outline-variant/30">
                  <input
                    type="checkbox"
                    checked={i.checked ?? false}
                    onChange={(e) => toggle(i.id, e.target.checked)}
                    className="w-5 h-5 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0"
                  />
                  <span className={`font-body-md text-body-md flex-1 ${struck}`}>{i.name}</span>
                  <span className={`font-label-md text-label-md text-primary whitespace-nowrap ${struck}`}>
                    {qty}
                    {conv && <span className="text-on-surface-variant font-body-md text-[12px]"> ({conv})</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingId(editingId === i.id ? null : i.id)}
                    title="Modifier cet article"
                    className="text-primary hover:opacity-70 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMergingId(mergingId === i.id ? null : i.id)}
                    title="Fusionner avec un autre article"
                    className="text-primary hover:opacity-70 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">call_merge</span>
                  </button>
                </div>
                {editingId === i.id && <EditItemRow item={i} units={units} onApply={(n, q, u) => applyEdit(i.id, n, q, u)} onCancel={() => setEditingId(null)} />}
                {mergingId === i.id && (
                  <MergeItemRow
                    candidates={items.filter((o) => o.id !== i.id && sameUnit(o.unit, i.unit))}
                    onMerge={(sourceId) => mergeItems(i.id, sourceId)}
                    onCancel={() => setMergingId(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <datalist id="dl-shopping-ingredients">
        {ingredientRefs.map((r) => (
          <option key={r.id} value={r.name} />
        ))}
      </datalist>

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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ingrédient" list="dl-shopping-ingredients" className={FIELD} style={{ width: '13rem' }} autoFocus />
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

function MergeItemRow({
  candidates,
  onMerge,
  onCancel,
}: {
  candidates: ShoppingItem[];
  onMerge: (sourceId: number) => void;
  onCancel: () => void;
}) {
  const [sourceId, setSourceId] = useState(candidates[0]?.id ?? -1);
  if (candidates.length === 0) {
    return (
      <div className="py-3 border-b border-outline-variant/30 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant italic">Aucun autre article avec la même unité à fusionner.</p>
        <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
          Fermer
        </button>
      </div>
    );
  }
  return (
    <div className="py-3 border-b border-outline-variant/30 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className={LBL}>Fusionner avec</span>
        <select value={sourceId} onChange={(e) => setSourceId(Number(e.target.value))} className={`${FIELD} bg-white`} style={{ width: '16rem' }}>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.quantity ? ` — ${c.quantity}${c.unit ? ' ' + c.unit : ''}` : ''}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => onMerge(sourceId)} className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px]">
        Fusionner
      </button>
      <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
        Annuler
      </button>
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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex : Beurre" list="dl-shopping-ingredients" className={FIELD} style={{ width: '13rem' }} autoFocus />
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
