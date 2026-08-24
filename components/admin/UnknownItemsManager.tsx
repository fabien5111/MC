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
import type { UnknownItem, IgnoredRef } from '@/lib/admin';
import { formatDate } from '@/lib/format';

type Kind = 'ingredient' | 'utensil';

const FIELD = 'w-full border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors';
const LABEL = 'text-xs font-semibold text-on-surface-variant uppercase tracking-wider';
const MAX_ALLERGENS = 3;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  pending: 'En attente',
  rejected: 'Refusée',
  published: 'Publiée',
};

// Statut + visibilité entre parenthèses : un ingrédient inconnu peut dormir
// dans un brouillon jamais publié — sans ça, rien ne distingue une correction
// urgente (recette publique déjà visible) d'une saisie encore en chantier.
function statusNote(status: string | null, isPublic: boolean | null): string | null {
  const parts = [status ? (STATUS_LABELS[status] ?? status) : null, isPublic == null ? null : isPublic ? 'publique' : 'privée'].filter(
    (p): p is string => !!p,
  );
  return parts.length ? parts.join(', ') : null;
}

function RecipeLinks({ recipes }: { recipes: UnknownItem['recipes'] }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {recipes.map((r, i) => {
        const note = statusNote(r.status, r.isPublic);
        return (
          <span key={`${r.id}:${r.step ?? ''}`} className="text-xs">
            <Link href={`/recette/${r.id}`} target="_blank" className="text-secondary hover:text-primary underline underline-offset-2">
              {r.title}
            </Link>
            {note && <span className="text-on-surface-variant"> ({note})</span>}
            {r.author ? (
              r.authorId ? (
                <>
                  {' — '}
                  <Link href={`/u/${r.authorId}`} target="_blank" className="text-secondary hover:text-primary underline underline-offset-2">
                    {r.author}
                  </Link>
                </>
              ) : (
                <span className="text-on-surface-variant"> — {r.author}</span>
              )
            ) : null}
            {r.step ? (
              r.stepAnchor ? (
                <>
                  {' '}
                  (
                  <Link href={`/recette/${r.id}#${r.stepAnchor}`} target="_blank" className="text-secondary hover:text-primary underline underline-offset-2">
                    étape « {r.step} »
                  </Link>
                  )
                </>
              ) : (
                <span className="text-on-surface-variant"> (étape « {r.step} »)</span>
              )
            ) : null}
            {i < recipes.length - 1 ? <span className="text-on-surface-variant">,</span> : null}
          </span>
        );
      })}
    </span>
  );
}

function Section({
  title,
  desc,
  items,
  onAdd,
  onExclude,
}: {
  title: string;
  desc: string;
  items: UnknownItem[];
  onAdd: (item: UnknownItem) => void;
  onExclude: (item: UnknownItem) => void;
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
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onExclude(it)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant text-on-surface-variant text-xs font-medium rounded hover:border-error hover:text-error transition-all"
                        title="Ne plus proposer ce nom au rattachement"
                      >
                        <span className="material-symbols-outlined text-sm">visibility_off</span>
                        Exclure
                      </button>
                      <button
                        onClick={() => onAdd(it)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary text-on-primary text-xs font-medium rounded hover:opacity-90 transition-all"
                      >
                        <span className="material-symbols-outlined text-sm">add</span>
                        Ajouter à la référence
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

// Ingrédients déjà référencés, saisis en volume (ml/cl/l) dans une recette
// publiée, mais sans masse volumique enregistrée pour eux dans le
// référentiel — cf. lib/admin.ts `getVolumeIngredientsMissingDensity`.
// Distinct de `Section` : l'ingrédient est déjà rattaché à la référence, il
// n'y a donc rien à « ajouter » ni à « exclure » ici, seulement un renvoi
// vers l'écran où renseigner la valeur manquante.
function VolumeDensitySection({ items }: { items: UnknownItem[] }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
      <div className="p-6 border-b border-outline-variant">
        <h3 className="font-headline-md text-lg font-semibold">
          Ingrédients en volume sans masse volumique{' '}
          <span className="text-on-surface-variant font-normal text-sm">({items.length})</span>
        </h3>
        <p className="text-xs text-on-surface-variant mt-0.5">
          Ingrédients déjà référencés, saisis en volume (ml/cl/l) dans une recette publiée (privée ou publique), sans masse
          volumique enregistrée pour eux — renseignez-la depuis{' '}
          <Link href="/admin/listes" className="text-secondary hover:text-primary underline underline-offset-2">
            Gestion des listes → Ingrédients
          </Link>{' '}
          pour qu&apos;ils comptent dans l&apos;estimation de poids au remplacement d&apos;une étape par une recette.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant">
              <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Ingrédient</th>
              <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Recettes concernées</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {items.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-6 py-10 text-center text-on-surface-variant text-sm">
                  Rien à signaler.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.name.toLowerCase()} className="hover:bg-surface-container-low transition-colors align-top">
                  <td className="px-6 py-4 text-sm font-semibold text-on-surface whitespace-nowrap">{it.name}</td>
                  <td className="px-6 py-4">
                    <RecipeLinks recipes={it.recipes} />
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

// Éléments exclus (repliable, replié par défaut) : rester visible plutôt que
// disparaître silencieusement — une exclusion se fait en un clic depuis les
// tableaux ci-dessus, elle doit pouvoir se défaire aussi facilement.
function IgnoredSection({ items, onRestore }: { items: IgnoredRef[]; onRestore: (ref: IgnoredRef) => void }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-surface-container-low transition-colors"
      >
        <div>
          <h3 className="font-headline-md text-lg font-semibold">
            Exclus <span className="text-on-surface-variant font-normal text-sm">({items.length})</span>
          </h3>
          <p className="text-xs text-on-surface-variant mt-0.5">Noms écartés du rattachement — à réintégrer si l&apos;exclusion était une erreur.</p>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-outline-variant">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Nom</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Exclu par</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-6 py-4 text-sm font-semibold text-on-surface">{r.name}</td>
                  <td className="px-6 py-4 text-sm text-on-surface-variant">{r.kind === 'ingredient' ? 'Ingrédient' : 'Ustensile'}</td>
                  <td className="px-6 py-4 text-sm text-on-surface-variant">
                    {r.createdByName || '—'} <span className="text-xs">· {formatDate(r.createdAt)}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => onRestore(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant text-on-surface-variant text-xs font-medium rounded hover:border-primary hover:text-primary transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      Réintégrer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function UnknownItemsManager({
  ingredients,
  utensils,
  volumeMissingDensity,
  ignored,
  allergens,
}: {
  ingredients: UnknownItem[];
  utensils: UnknownItem[];
  volumeMissingDensity: UnknownItem[];
  ignored: IgnoredRef[];
  allergens: { id: number; name: string }[];
}) {
  const { mutate } = useMutation();
  const [addingIngredient, setAddingIngredient] = useState<UnknownItem | null>(null);
  const [addingUtensil, setAddingUtensil] = useState<UnknownItem | null>(null);

  function exclude(kind: Kind, item: UnknownItem) {
    mutate(() => createClient().rpc('admin_ignore_ref' as never, { p_kind: kind, p_name: item.name } as never), {
      confirm: `Exclure « ${item.name} » de la liste des éléments inconnus ? Il ne sera plus proposé au rattachement tant que vous ne le réintégrerez pas depuis la section « Exclus ».`,
      errorLabel: 'Exclusion impossible',
    });
  }

  function restore(ref: IgnoredRef) {
    mutate(() => createClient().rpc('admin_unignore_ref' as never, { p_id: ref.id } as never), { errorLabel: 'Réintégration impossible' });
  }

  return (
    <div className="p-margin-desktop flex flex-col gap-gutter">
      <Section
        title="Ingrédients"
        desc="Noms saisis dans une recette sans correspondance dans la table de référence des ingrédients."
        items={ingredients}
        onAdd={setAddingIngredient}
        onExclude={(item) => exclude('ingredient', item)}
      />
      <Section
        title="Ustensiles"
        desc="Noms saisis dans une recette sans correspondance dans la table de référence des ustensiles."
        items={utensils}
        onAdd={setAddingUtensil}
        onExclude={(item) => exclude('utensil', item)}
      />
      <VolumeDensitySection items={volumeMissingDensity} />
      <IgnoredSection items={ignored} onRestore={restore} />
      {addingIngredient && <AddIngredientPanel item={addingIngredient} allergens={allergens} onClose={() => setAddingIngredient(null)} />}
      {addingUtensil && <AddUtensilPanel item={addingUtensil} onClose={() => setAddingUtensil(null)} />}
    </div>
  );
}
