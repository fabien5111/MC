'use client';

// Génération de liste de courses depuis une recette (porté de mcShoppingOpen /
// mcShoppingValidate de recette.html) : sélection des ingrédients, ajout à une
// liste existante ou création d'une nouvelle, puis redirection vers la liste.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { MergedIngredient } from '@/lib/recipe-view';

export function ShoppingWidget({
  recipeTitle,
  ingredients,
  lists,
  isLoggedIn,
}: {
  recipeTitle: string;
  ingredients: MergedIngredient[];
  lists: { id: number; name: string }[];
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<boolean[]>(() => ingredients.map(() => true));
  const [choice, setChoice] = useState<string>('__new__');
  const [name, setName] = useState(`Courses — ${recipeTitle}`);
  const [busy, setBusy] = useState(false);

  function toggle(i: number) {
    setPicked((p) => p.map((v, k) => (k === i ? !v : v)));
  }

  async function validate() {
    const items = ingredients.filter((_, k) => picked[k]);
    if (!items.length) {
      alert('Sélectionnez au moins un ingrédient.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/connexion');
        return;
      }
      let listId: number;
      if (choice === '__new__') {
        const listName = name.trim();
        if (!listName) {
          alert('Donnez un nom à la liste.');
          setBusy(false);
          return;
        }
        const { data, error } = await supabase
          .from('shopping_lists')
          .insert({ user_id: user.id, name: listName })
          .select('id')
          .single();
        if (error || !data) throw error || new Error('Création refusée');
        listId = data.id;
      } else {
        listId = Number(choice);
      }
      const rows = items.map((m) => ({
        list_id: listId,
        name: m.name,
        quantity: String(m.qty || '') || null,
        unit: m.unit || null,
      }));
      const { error: itemsErr } = await supabase.from('shopping_list_items').insert(rows);
      if (itemsErr) throw itemsErr;
      router.push(`/courses/${listId}`);
    } catch (e) {
      alert('Erreur : ' + (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <details className="group border border-secondary/40 rounded-xl mt-4 bg-surface-container-low">
      <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
        <span className="font-label-md text-label-md text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span> Ajouter à une liste de
          courses
        </span>
        <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
      </summary>
      <div className="p-4 pt-0 flex flex-col gap-4">
        {!isLoggedIn ? (
          <p className="text-sm text-on-surface-variant">
            <Link href="/connexion" className="text-primary underline">
              Connectez-vous
            </Link>{' '}
            pour créer une liste de courses.
          </p>
        ) : (
          <>
            <ul className="flex flex-col">
              {ingredients.map((m, i) => (
                <li key={i} className="flex items-center gap-3 py-1.5 border-b border-outline-variant/30">
                  <input
                    type="checkbox"
                    checked={picked[i]}
                    onChange={() => toggle(i)}
                    className="w-4 h-4 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0"
                  />
                  <span className="font-body-md text-body-md flex-1">{m.name}</span>
                  <span className="font-label-md text-label-md text-primary whitespace-nowrap">
                    {[m.qty, m.unit].filter(Boolean).join(' ')}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-label-md text-[10px] uppercase text-on-surface-variant">Liste de courses</span>
                <select
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                  className="border border-outline-variant rounded px-3 py-2 font-body-md text-sm bg-white"
                  style={{ minWidth: '14rem' }}
                >
                  <option value="__new__">➕ Nouvelle liste…</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              {choice === '__new__' && (
                <label className="flex flex-col gap-1">
                  <span className="font-label-md text-[10px] uppercase text-on-surface-variant">
                    Nom de la nouvelle liste
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="border border-outline-variant rounded px-3 py-2 font-body-md text-sm"
                    style={{ minWidth: '16rem' }}
                  />
                </label>
              )}
              <button
                type="button"
                onClick={validate}
                disabled={busy}
                className="bg-primary text-on-primary px-6 py-2 rounded-full font-label-md text-[12px] disabled:opacity-60"
              >
                {busy ? 'Ajout…' : 'Valider'}
              </button>
            </div>
          </>
        )}
      </div>
    </details>
  );
}
