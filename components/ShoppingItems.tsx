'use client';

// Liste d'articles cochables + ajout/édition (porté de profil.html, panneau
// « courses-detail » — plus complet que courses.html qui n'a que la coche).
// La coche est optimiste puis persistée via le client Supabase navigateur
// (RLS appliquée par la session partagée en cookies).
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import type { ShoppingItem } from '@/lib/shopping';
import type { Unit } from '@/lib/profile';
import { fixOeufLigature } from '@/lib/text';
import { findMergeTarget, joinComments, mergeCandidates, mergePreview, mergeResult } from '@/lib/shopping-merge';
import { ingredientConversionText, resolveIngredientRefId, type ConversionRef, type IngredientRefOption } from '@/lib/ingredient-conversions';

// Délai de regroupement des resynchronisations serveur (voir scheduleRefresh).
const REFRESH_DELAY = 2000;

// Garde-fou : si la resynchronisation flushée au clic sur le fil d'Ariane ne
// retombe jamais à `isPending = false` (cas limite non prévu), on ne laisse
// pas l'utilisateur bloqué sur la page — on navigue quand même.
const LEAVE_SAFETY_DELAY = 3000;

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

  // Fil d'Ariane : un clic normal (rien en attente) navigue tel quel. S'il
  // reste des coches non resynchronisées, on flush le refresh et on retarde la
  // navigation jusqu'à sa fin — le fouet de NavigationSpinner, déjà armé au
  // clic, reste alors affiché tout du long, sans overlay superposé. Garde-fou
  // (LEAVE_SAFETY_DELAY) : on ne laisse jamais l'utilisateur bloqué si le
  // passage de isRefreshPending à false devait tarder.
  const [isRefreshPending, startTransition] = useTransition();
  const leaving = useRef(false);

  function goToList(e: React.MouseEvent<HTMLAnchorElement>) {
    if (leaving.current) {
      e.preventDefault();
      return;
    }
    if (!pending.current) return;
    e.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    pending.current = false;
    leaving.current = true;
    startTransition(() => router.refresh());
  }

  useEffect(() => {
    if (!leaving.current) return;
    if (!isRefreshPending) {
      leaving.current = false;
      router.push('/en-cuisine');
      return;
    }
    const safety = setTimeout(() => {
      leaving.current = false;
      router.push('/en-cuisine');
    }, LEAVE_SAFETY_DELAY);
    return () => clearTimeout(safety);
  }, [isRefreshPending, router]);

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

  async function applyEdit(id: number, name: string, quantity: string, unit: string, comment: string) {
    if (!name.trim()) {
      dialog.alert('Indiquez un libellé.');
      return;
    }
    name = fixOeufLigature(name); // « oeufs » → « œufs » (JEP-249)
    const ref_id = resolveIngredientRefId(name, ingredientRefs);
    const ok = await mutate(
      () =>
        createClient()
          .from('shopping_list_items')
          .update({ name: name.trim(), quantity: quantity.trim() || null, unit: unit || null, comment: comment.trim() || null, ref_id })
          .eq('id', id),
      { refresh: false },
    );
    if (!ok) return;
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, name: name.trim(), quantity: quantity.trim() || null, unit: unit || null, comment: comment.trim() || null, ref_id } : i)),
    );
    setEditingId(null);
    scheduleRefresh();
  }

  // Fusion manuelle de deux lignes (picto à côté du crayon) : la quantité de
  // l'article choisi s'ajoute à celle de l'article courant, qui est ensuite
  // supprimé. Même unité, ou même ingrédient dans une autre unité que la table
  // de conversions relie (JEP-249) : la quantité de l'article choisi est alors
  // convertie dans l'unité de l'article courant — jamais d'addition sans
  // conversion connue (cf. `mergeCandidates`).
  async function mergeItems(targetId: number, sourceId: number) {
    const target = items.find((i) => i.id === targetId);
    const source = items.find((i) => i.id === sourceId);
    if (!target || !source) return;
    const newQty = mergeResult(target, source, conversions, units).quantity;
    const newComment = joinComments(target.comment, source.comment);
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        const { error } = await supabase.from('shopping_list_items').update({ quantity: newQty, comment: newComment }).eq('id', targetId);
        if (error) return { error };
        return supabase.from('shopping_list_items').delete().eq('id', sourceId);
      },
      { errorLabel: 'Fusion impossible', refresh: false },
    );
    if (!ok) return;
    setItems((prev) => prev.filter((i) => i.id !== sourceId).map((i) => (i.id === targetId ? { ...i, quantity: newQty, comment: newComment } : i)));
    setMergingId(null);
    scheduleRefresh();
  }

  // Non passé par useMutation : la ligne insérée est nécessaire (son id) pour
  // compléter l'état local sans attendre la resynchronisation.
  async function addItem(name: string, quantity: string, unit: string, comment: string) {
    if (!name.trim()) {
      dialog.alert('Indiquez un libellé.');
      return;
    }
    name = fixOeufLigature(name); // « oeufs » → « œufs » (JEP-249)
    const supabase = createClient();

    // Même ingrédient (singulier/pluriel/ligature compris) déjà dans la liste :
    // la quantité s'y ajoute plutôt que d'ouvrir une seconde ligne, après
    // conversion si l'unité diffère mais qu'une conversion les relie — comme le
    // récapitulatif d'une fiche recette (JEP-249).
    const refId = resolveIngredientRefId(name, ingredientRefs);
    // Le commentaire doit être identique : une ligne commentée reste à part.
    const hit = findMergeTarget(items, { name, unit: unit || null, quantity: quantity.trim() || null, ref_id: refId, comment: comment.trim() || null }, conversions, units);
    if (hit) {
      const existing = hit.item;
      const newQty = hit.quantity;
      const { error: updErr } = await supabase.from('shopping_list_items').update({ quantity: newQty }).eq('id', existing.id);
      if (updErr) {
        dialog.alert('Erreur : ' + updErr.message);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === existing.id ? { ...i, quantity: newQty } : i)));
      setAdding(false);
      scheduleRefresh();
      return;
    }

    const { data, error } = await supabase
      .from('shopping_list_items')
      .insert({
        list_id: listId,
        name: name.trim(),
        quantity: quantity.trim() || null,
        unit: unit || null,
        comment: comment.trim() || null,
        checked: false,
        ref_id: refId,
      })
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
      <nav className="flex items-center gap-2 text-on-surface-variant font-label-md text-[12px] mb-8">
        <Link className="hover:text-primary" href="/en-cuisine" onClick={goToList}>
          Mes listes de courses
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-primary">{listName}</span>
      </nav>

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
                  <span className={`font-body-md text-body-md flex-1 ${struck}`}>
                    {i.name}
                    {i.comment && <span className="text-on-surface-variant italic"> — {i.comment}</span>}
                  </span>
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
                {editingId === i.id && <EditItemRow item={i} units={units} onApply={(n, q, u, c) => applyEdit(i.id, n, q, u, c)} onCancel={() => setEditingId(null)} />}
                {mergingId === i.id && (
                  <MergeItemRow
                    target={i}
                    candidates={mergeCandidates(items, i, conversions, units)}
                    conversions={conversions}
                    units={units}
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

function EditItemRow({
  item,
  units,
  onApply,
  onCancel,
}: {
  item: ShoppingItem;
  units: Unit[];
  onApply: (name: string, qty: string, unit: string, comment: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name || '');
  const [qty, setQty] = useState(item.quantity || '');
  const [unit, setUnit] = useState(item.unit || '');
  const [comment, setComment] = useState(item.comment || '');
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
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Commentaire" className={FIELD} style={{ width: '13rem' }} />
        <button type="button" onClick={() => onApply(name, qty, unit, comment)} className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px]">
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
  target,
  candidates,
  conversions,
  units,
  onMerge,
  onCancel,
}: {
  target: ShoppingItem;
  candidates: ShoppingItem[];
  conversions: ConversionRef[];
  units: Unit[];
  onMerge: (sourceId: number) => void;
  onCancel: () => void;
}) {
  const [sourceId, setSourceId] = useState(candidates[0]?.id ?? -1);
  const picked = candidates.find((c) => c.id === sourceId);
  // Unités différentes : le calcul de conversion est montré avant validation.
  const preview = picked ? mergePreview(target, picked, conversions, units) : null;
  if (candidates.length === 0) {
    return (
      <div className="py-3 border-b border-outline-variant/30 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant italic">Aucun autre article à fusionner (même unité, ou même ingrédient avec une conversion connue).</p>
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
      {preview && <p className="basis-full text-xs text-on-surface-variant italic">{preview}</p>}
      <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
        Annuler
      </button>
    </div>
  );
}

function AddItemRow({
  units,
  onAdd,
  onCancel,
}: {
  units: Unit[];
  onAdd: (name: string, qty: string, unit: string, comment: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [comment, setComment] = useState('');
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
      <label className="flex flex-col gap-1">
        <span className={LBL}>Commentaire</span>
        <input value={comment} onChange={(e) => setComment(e.target.value)} className={FIELD} style={{ width: '13rem' }} />
      </label>
      <button type="button" onClick={() => onAdd(name, qty, unit, comment)} className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px] flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]">add_circle</span> Ajouter
      </button>
      <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
        Annuler
      </button>
    </div>
  );
}
