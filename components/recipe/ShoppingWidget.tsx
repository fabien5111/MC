'use client';

// Génération de liste de courses depuis une recette (porté de mcShoppingOpen /
// mcShoppingValidate de recette.html) : sélection des ingrédients, ajout à une
// liste existante ou création d'une nouvelle, puis redirection vers la liste.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import type { MergedIngredient } from '@/lib/recipe-view';
import { ingredientConversionText, type ConversionRef, type UnitRef } from '@/lib/ingredient-conversions';

export function ShoppingWidget({
  recipeTitle,
  ingredients,
  lists,
  isLoggedIn,
  conversions,
  units,
}: {
  recipeTitle: string;
  ingredients: MergedIngredient[];
  lists: { id: number; name: string }[];
  isLoggedIn: boolean;
  conversions: ConversionRef[];
  units: UnitRef[];
}) {
  const router = useRouter();
  const dialog = useDialog();
  const writeGuard = useWriteGuard();
  const [picked, setPicked] = useState<boolean[]>(() => ingredients.map(() => true));
  const [choice, setChoice] = useState<string>('__new__');
  const [name, setName] = useState(`Courses — ${recipeTitle}`);
  const [busy, setBusy] = useState(false);

  function toggle(i: number) {
    setPicked((p) => p.map((v, k) => (k === i ? !v : v)));
  }

  async function validate() {
    if (!writeGuard('Ajout à une liste de courses')) return;
    const items = ingredients.filter((_, k) => picked[k]);
    if (!items.length) {
      dialog.alert('Sélectionnez au moins un ingrédient.');
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
          dialog.alert('Donnez un nom à la liste.');
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

      // Liste existante : fusionne la quantité des articles dont le libellé
      // ET l'unité sont identiques à un article déjà présent — une unité
      // différente reste une ligne à part (pas de fusion).
      let toInsert = items;
      if (choice !== '__new__') {
        const { data: existing, error: existingErr } = await supabase
          .from('shopping_list_items')
          .select('id, name, quantity, unit, comment')
          .eq('list_id', listId);
        if (existingErr) throw existingErr;
        const key = (n: string, u: string | null) => n.trim().toLowerCase() + '|' + (u || '').trim().toLowerCase();
        const byKey = new Map((existing || []).map((e) => [key(e.name, e.unit), e]));
        toInsert = [];
        for (const m of items) {
          const match = byKey.get(key(m.name, m.unit));
          if (!match) {
            toInsert.push(m);
            continue;
          }
          const a = parseFloat(String(match.quantity || '').replace(',', '.'));
          const b = parseFloat(String(m.qty || '').replace(',', '.'));
          const newQty = !isNaN(a) && !isNaN(b) ? String(+(a + b).toFixed(2)) : [match.quantity, m.qty].filter(Boolean).join(' + ');
          const newComment = m.comment && m.comment !== match.comment ? [match.comment, m.comment].filter(Boolean).join(' ; ') : match.comment;
          const { error: updErr } = await supabase.from('shopping_list_items').update({ quantity: newQty, comment: newComment }).eq('id', match.id);
          if (updErr) throw updErr;
        }
      }

      if (toInsert.length) {
        const rows = toInsert.map((m) => ({
          list_id: listId,
          name: m.name,
          quantity: String(m.qty || '') || null,
          unit: m.unit || null,
          comment: m.comment || null,
          ref_id: m.ref_id,
        }));
        const { error: itemsErr } = await supabase.from('shopping_list_items').insert(rows);
        if (itemsErr) throw itemsErr;
      }
      // Invalide le rendu serveur avant de naviguer : la liste de destination
      // peut déjà être en cache (articles manquants), et « Listes de courses »
      // du profil doit voir la liste créée.
      router.refresh();
      router.push(`/courses/${listId}`);
    } catch (e) {
      dialog.alert('Erreur : ' + (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
    <LoadingOverlay visible={busy} label="Ajout à la liste de courses…" />
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
                  <span className="font-body-md text-body-md flex-1 min-w-0 max-w-[16rem]">
                    {m.name}
                    {m.comment && <span className="text-on-surface-variant italic"> — {m.comment}</span>}
                  </span>
                  <span className="font-label-md text-label-md text-primary whitespace-nowrap">
                    {[m.qty, m.unit].filter(Boolean).join(' ')}
                    {(() => {
                      const conv = ingredientConversionText(conversions, units, m.ref_id, m.unit, m.qty);
                      return conv ? <span className="text-on-surface-variant font-body-md text-[12px]"> ({conv})</span> : null;
                    })()}
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
                Valider
              </button>
            </div>
          </>
        )}
      </div>
    </details>
    </>
  );
}
