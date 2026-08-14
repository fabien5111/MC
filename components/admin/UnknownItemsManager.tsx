'use client';

// Ingrédients / ustensiles saisis dans une recette (création ou validation
// d'un import) sans correspondance dans la table de référence
// (`ingredient_refs` / `utensils`) — cf. lib/admin.ts `getUnknownIngredients` /
// `getUnknownUtensils` pour la définition exacte d'« inconnu ».
//
// « Ajouter à la référence » passe par une RPC dédiée (`admin_link_*_ref`,
// SECURITY DEFINER) plutôt qu'un simple insert : elle crée l'entrée de
// référence PUIS rattache en une seule opération toutes les lignes de recette
// déjà saisies sous ce nom (`ref_id`, et pour un ingrédient l'allergène texte
// affiché sur la fiche recette) — sans ça, seules les nouvelles saisies
// bénéficieraient du rattachement, les recettes existantes resteraient
// affichées comme avant.
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import type { UnknownItem } from '@/lib/admin';

const FIELD = 'w-full border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors';
const LABEL = 'text-xs font-semibold text-on-surface-variant uppercase tracking-wider';
const MAX_ALLERGENS = 3;

function RecipeLinks({ recipes }: { recipes: UnknownItem['recipes'] }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {recipes.map((r, i) => (
        <span key={r.id} className="text-xs">
          <Link href={`/recette/${r.id}`} target="_blank" className="text-secondary hover:text-primary underline underline-offset-2">
            {r.title}
          </Link>
          {i < recipes.length - 1 ? <span className="text-on-surface-variant">,</span> : null}
        </span>
      ))}
    </span>
  );
}

function Section({
  title,
  desc,
  items,
  onAdd,
}: {
  title: string;
  desc: string;
  items: UnknownItem[];
  onAdd: (item: UnknownItem) => void;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
      <div className="p-6 border-b border-outline-variant">
        <h3 className="font-headline-md text-lg font-semibold">
          {title} <span className="text-on-surface-variant font-normal text-sm">({items.length})</span>
        </h3>
        <p className="text-xs text-on-surface-variant mt-0.5">{desc}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant">
              <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Nom saisi</th>
              <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Recettes concernées</th>
              <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-10 text-center text-on-surface-variant text-sm">
                  Rien à rattacher.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.name.toLowerCase()} className="hover:bg-surface-container-low transition-colors align-top">
                  <td className="px-6 py-4 text-sm font-semibold text-on-surface whitespace-nowrap">{it.name}</td>
                  <td className="px-6 py-4">
                    <RecipeLinks recipes={it.recipes} />
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => onAdd(it)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary text-on-primary text-xs font-medium rounded hover:opacity-90 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      Ajouter à la référence
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddIngredientPanel({
  item,
  allergens,
  onClose,
}: {
  item: UnknownItem;
  allergens: { id: number; name: string }[];
  onClose: () => void;
}) {
  const { mutate, busy } = useMutation();
  const [selected, setSelected] = useState<string[]>([]);

  async function save() {
    const allergenCsv = selected.length ? selected.join(', ') : null;
    const ok = await mutate(
      () => createClient().rpc('admin_link_ingredient_ref' as never, { p_name: item.name, p_allergen: allergenCsv } as never),
      { errorLabel: 'Ajout impossible' },
    );
    if (ok) onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-bright border-l border-outline-variant z-50 flex flex-col">
        <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant">
          <h3 className="font-headline-md text-xl font-semibold">Ajouter un ingrédient</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Libellé</span>
            <span className="text-sm text-on-surface">{item.name}</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Allergènes</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {selected.map((a) => (
                <span key={a} className="inline-flex items-center gap-0.5 bg-secondary-container text-on-secondary-container rounded-full pl-2.5 pr-1 py-0.5 text-[13px]">
                  {a}
                  <button type="button" title="Retirer" onClick={() => setSelected((s) => s.filter((x) => x !== a))} className="hover:text-error transition-colors">
                    <span className="material-symbols-outlined text-[14px] align-middle">close</span>
                  </button>
                </span>
              ))}
              {selected.length < MAX_ALLERGENS && (
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v && !selected.includes(v)) setSelected((s) => [...s, v]);
                  }}
                  className={FIELD}
                  style={{ width: 'auto' }}
                >
                  <option value="">{selected.length ? '+ ajouter' : '— aucun —'}</option>
                  {allergens.filter((a) => !selected.includes(a.name)).map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <p className="text-xs text-on-surface-variant">
            Toutes les recettes utilisant déjà « {item.name} » seront rattachées à cette référence, et son allergène affiché s&apos;y mettra à jour.
          </p>
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

function AddUtensilPanel({ item, onClose }: { item: UnknownItem; onClose: () => void }) {
  const { mutate, busy } = useMutation();
  const [comment, setComment] = useState('');
  const [url, setUrl] = useState('');

  async function save() {
    const ok = await mutate(
      () =>
        createClient().rpc('admin_link_utensil_ref' as never, {
          p_name: item.name,
          p_comment: comment.trim() || null,
          p_url: url.trim() || null,
        } as never),
      { errorLabel: 'Ajout impossible' },
    );
    if (ok) onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-bright border-l border-outline-variant z-50 flex flex-col">
        <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant">
          <h3 className="font-headline-md text-xl font-semibold">Ajouter un ustensile</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Nom</span>
            <span className="text-sm text-on-surface">{item.name}</span>
          </div>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Commentaire</span>
            <input value={comment} onChange={(e) => setComment(e.target.value)} className={FIELD} autoFocus />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} className={FIELD} />
          </label>
          <p className="text-xs text-on-surface-variant">
            Toutes les recettes utilisant déjà « {item.name} » seront rattachées à cette référence.
          </p>
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

export function UnknownItemsManager({
  ingredients,
  utensils,
  allergens,
}: {
  ingredients: UnknownItem[];
  utensils: UnknownItem[];
  allergens: { id: number; name: string }[];
}) {
  const [addingIngredient, setAddingIngredient] = useState<UnknownItem | null>(null);
  const [addingUtensil, setAddingUtensil] = useState<UnknownItem | null>(null);

  return (
    <div className="p-margin-desktop flex flex-col gap-gutter">
      <Section
        title="Ingrédients"
        desc="Noms saisis dans une recette sans correspondance dans la table de référence des ingrédients."
        items={ingredients}
        onAdd={setAddingIngredient}
      />
      <Section
        title="Ustensiles"
        desc="Noms saisis dans une recette sans correspondance dans la table de référence des ustensiles."
        items={utensils}
        onAdd={setAddingUtensil}
      />
      {addingIngredient && <AddIngredientPanel item={addingIngredient} allergens={allergens} onClose={() => setAddingIngredient(null)} />}
      {addingUtensil && <AddUtensilPanel item={addingUtensil} onClose={() => setAddingUtensil(null)} />}
    </div>
  );
}
