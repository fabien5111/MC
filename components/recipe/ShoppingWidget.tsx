'use client';

// Génération de liste de courses depuis une recette (porté de mcShoppingOpen /
// mcShoppingValidate de recette.html) : sélection des ingrédients, ajout à une
// liste existante ou création d'une nouvelle, puis redirection vers la liste.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { translateQuotaError } from '@/lib/quota-message-client';
import type { MergedIngredient } from '@/lib/recipe-view';
import { ingredientConversionText, type ConversionRef, type UnitRef } from '@/lib/ingredient-conversions';
import { connexionHref } from '@/lib/nav';
import { trackEvent } from '@/lib/analytics';
import { findMergeTarget } from '@/lib/shopping-merge';

export function ShoppingWidget({
  recipeId,
  recipeTitle,
  ingredients,
  lists,
  isLoggedIn,
  conversions,
  units,
}: {
  recipeId: string;
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

  // Retour de `/connexion` (cf. le lien « Connectez-vous » plus bas) :
  // l'ancre seule ne suffit pas, ce panneau est un `<details>` replié par
  // défaut — y atterrir sans l'ouvrir montrerait juste son en-tête. On le
  // déplie ET on y défile, plutôt que de laisser la page remonter en haut
  // de la fiche comme avant ce correctif.
  //
  // `#courses-connexion`, et non `#sec-courses` : `BatchView.tsx` monte ce
  // même composant sur `/fournee/[id]` avec `id="sec-courses"` déjà posé sur
  // SA propre div englobante, pour son sommaire — deux éléments avec le même
  // id sur une même page est invalide (et casserait ce sommaire). Sans
  // conséquence ici : cette page est toujours authentifiée
  // (`requireUser()`), la branche « Connectez-vous » n'y est jamais rendue.
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (location.hash !== '#courses-connexion' || !detailsRef.current) return;
    detailsRef.current.open = true;
    detailsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Une seule fois, au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        router.push(connexionHref(location.pathname + location.search));
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

      // Chaque article rejoint, s'il y en a une, la ligne du MÊME ingrédient
      // (singulier/pluriel/ligature compris) déjà dans la liste : même unité,
      // ou autre unité reliée par une conversion — la quantité est alors
      // convertie dans l'unité de la ligne existante (JEP-249, comme le
      // récapitulatif d'une fiche recette). Le commentaire doit être identique :
      // une ligne commentée reste à part. Sans correspondance, nouvelle ligne.
      // `pool` porte les lignes déjà en base ET celles qu'on s'apprête à créer :
      // deux articles convertibles entre eux (100 g et 5 unité(s) du même jaune,
      // côté fournée) se regroupent donc aussi, et une ligne modifiée n'est
      // jamais relue périmée par l'article suivant.
      type Ligne = { id: number; name: string; quantity: string | null; unit: string | null; ref_id: number | null; comment: string | null; isNew: boolean; dirty: boolean };
      const pool: Ligne[] = [];
      if (choice !== '__new__') {
        const { data: existing, error: existingErr } = await supabase
          .from('shopping_list_items')
          .select('id, name, quantity, unit, comment, ref_id')
          .eq('list_id', listId);
        if (existingErr) throw existingErr;
        for (const e of existing || []) pool.push({ ...e, isNew: false, dirty: false });
      }
      for (const m of items) {
        const incoming = { name: m.name, unit: m.unit || null, quantity: m.qty || null, ref_id: m.ref_id, comment: m.comment || null };
        const hit = findMergeTarget(pool, incoming, conversions, units);
        if (hit) {
          hit.item.quantity = hit.quantity;
          hit.item.dirty = true;
        } else {
          pool.push({ id: -(pool.length + 1), name: m.name, quantity: incoming.quantity, unit: incoming.unit, ref_id: m.ref_id, comment: m.comment || null, isNew: true, dirty: true });
        }
      }
      for (const l of pool.filter((x) => !x.isNew && x.dirty)) {
        const { error: updErr } = await supabase.from('shopping_list_items').update({ quantity: l.quantity }).eq('id', l.id);
        if (updErr) throw updErr;
      }
      const rows = pool.filter((x) => x.isNew).map((l) => ({ list_id: listId, name: l.name, quantity: l.quantity, unit: l.unit, comment: l.comment, ref_id: l.ref_id }));
      if (rows.length) {
        const { error: itemsErr } = await supabase.from('shopping_list_items').insert(rows);
        if (itemsErr) throw itemsErr;
      }
      // Création seulement : ajouter à une liste existante n'est pas « générer ».
      if (choice === '__new__') trackEvent('generer_liste_courses');
      // Invalide le rendu serveur avant de naviguer : la liste de destination
      // peut déjà être en cache (articles manquants), et « Listes de courses »
      // du profil doit voir la liste créée.
      router.refresh();
      router.push(`/courses/${listId}`);
    } catch (e) {
      // Ce chemin n'appelle pas `useMutation` (il enchaîne plusieurs
      // requêtes), donc rien ne traduisait un refus de quota : la création
      // d'une liste au-delà du plafond affichait le message PostgreSQL brut
      // — « MC_QUOTA_EXCEEDED:listes_courses_max:3:3 ». Oubli du lot 5a,
      // relevé au passage de JEP-130 (§15, cinquième grammaire).
      const brut = (e as Error).message;
      const educatif = await translateQuotaError(brut);
      dialog.alert(educatif ?? 'Erreur : ' + brut);
      setBusy(false);
    }
  }

  return (
    <>
    <LoadingOverlay visible={busy} label="Ajout à la liste de courses…" />
    <details
      id="courses-connexion"
      ref={detailsRef}
      className="scroll-mt-28 group border border-secondary/40 rounded-xl mt-4 bg-surface-container-low"
    >
      <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
        <span className="font-label-md text-label-md text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span> Ajouter à une liste de
          courses
        </span>
        <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
      </summary>
      <div className="p-4 pt-0 flex flex-col gap-4">
        {isLoggedIn && (
          <p className="text-sm text-on-surface-variant italic -mt-2">
            Vous pourrez modifier et fusionner des ingrédients après création de la liste.
          </p>
        )}
        {!isLoggedIn ? (
          <p className="text-sm text-on-surface-variant">
            {/* Lien statique, à part du `router.push(connexionHref(...))` de
                `validate()` plus bas — même défaut que les boutons favori/vote
                (commits précédents) : un `href="/connexion"` nu renvoyait sur
                l'accueil après connexion plutôt que sur cette fiche.
                `#courses-connexion` fait de plus revenir sur CE panneau
                (déplié, cf. l'effet ci-dessus) plutôt qu'en haut de la fiche. */}
            <Link href={connexionHref(`/recette/${recipeId}#courses-connexion`)} className="text-primary underline">
              Connectez-vous
            </Link>{' '}
            pour créer une liste de courses.
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-[max-content_minmax(0,16rem)_max-content] gap-x-3 sm:gap-x-6">
              {ingredients.map((m, i) => (
                <li
                  key={i}
                  className="items-center py-1.5 border-b border-outline-variant/30"
                  style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}
                >
                  <input
                    type="checkbox"
                    checked={picked[i]}
                    onChange={() => toggle(i)}
                    className="w-4 h-4 rounded border-outline accent-primary focus:ring-primary cursor-pointer"
                  />
                  <span className="font-body-md text-body-md break-words">
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
