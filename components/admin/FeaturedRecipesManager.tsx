'use client';

// Gestion de la recette mise en avant sur l'accueil (« Recette de la
// Semaine ») : programmation de plages de dates, une recette à la fois.
// Le chevauchement est bloqué ici côté formulaire (retour immédiat) et par
// une contrainte d'exclusion en base (cf. migration SQL) qui protège contre
// deux sessions admin concurrentes.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { formatDate } from '@/lib/format';
import type { FeaturedRecipeRow } from '@/lib/featured';

type RecipeOption = { id: string; title: string; hero_image_url: string | null };

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function rangeStatus(start: string, end: string): { label: string; cls: string } {
  const today = todayStr();
  if (today < start) return { label: 'À venir', cls: 'bg-secondary-container text-on-secondary-container' };
  if (today > end) return { label: 'Terminée', cls: 'bg-surface-container-highest text-on-surface-variant' };
  return { label: 'En cours', cls: 'bg-primary text-on-primary' };
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function FeaturedRecipesManager({ items }: { items: FeaturedRecipeRow[] }) {
  const router = useRouter();
  const { mutate } = useMutation();
  const [editing, setEditing] = useState<FeaturedRecipeRow | null | undefined>(undefined); // undefined = fermé

  async function del(row: FeaturedRecipeRow) {
    const q = createClient().from('featured_recipes' as never) as unknown as {
      delete: () => { eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }> };
    };
    await mutate(() => q.delete().eq('id', row.id), {
      confirm: `Retirer « ${row.recipes?.title ?? 'cette recette'} » de la mise en avant ?`,
    });
  }

  const sorted = useMemo(() => [...items].sort((a, b) => b.start_date.localeCompare(a.start_date)), [items]);

  return (
    <div className="p-margin-desktop flex flex-col gap-gutter">
      <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
        <div className="p-6 border-b border-outline-variant flex items-center justify-between gap-4">
          <div>
            <h3 className="font-headline-md text-lg font-semibold">Plages de mise en avant</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Une seule recette « à la une » à la fois — les plages ne peuvent pas se chevaucher.
            </p>
          </div>
          <button
            onClick={() => setEditing(null)}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded hover:opacity-90 transition-all"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            <span>Programmer une recette</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Recette</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Du</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Au</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Statut</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-on-surface-variant text-sm">
                    Aucune recette programmée.
                  </td>
                </tr>
              ) : (
                sorted.map((row) => {
                  const st = rangeStatus(row.start_date, row.end_date);
                  const unavailable = row.recipes && (row.recipes.status !== 'published' || !row.recipes.is_public);
                  return (
                    <tr key={row.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {row.recipes?.hero_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- data-URL stockée en base
                            <img src={row.recipes.hero_image_url} alt="" className="w-9 h-9 rounded object-cover bg-surface-container" />
                          ) : (
                            <div className="w-9 h-9 rounded bg-surface-container" />
                          )}
                          <span className="text-sm font-semibold text-on-surface">{row.recipes?.title ?? 'Recette supprimée'}</span>
                          {unavailable && (
                            <span
                              className="px-2 py-0.5 rounded-full bg-error/10 text-error text-[10px] font-bold uppercase tracking-wider"
                              title="N'est plus publique/publiée : ne sera pas affichée même sur sa plage"
                            >
                              Indisponible
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface">{formatDate(row.start_date)}</td>
                      <td className="px-6 py-4 text-sm text-on-surface">{formatDate(row.end_date)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full ${st.cls} text-[11px] font-bold uppercase tracking-wider`}>{st.label}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditing(row)} className="p-2 hover:bg-surface-container-high rounded text-on-surface-variant" title="Modifier">
                            <span className="material-symbols-outlined text-xl">edit_note</span>
                          </button>
                          <button onClick={() => del(row)} className="p-2 hover:bg-error/10 rounded text-on-surface-variant hover:text-error" title="Retirer">
                            <span className="material-symbols-outlined text-xl">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <FeaturedForm
          items={items}
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

function FeaturedForm({
  items,
  entry,
  onClose,
  onSaved,
}: {
  items: FeaturedRecipeRow[];
  entry: FeaturedRecipeRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();

  const [selected, setSelected] = useState<RecipeOption | null>(
    entry?.recipes ? { id: entry.recipe_id, title: entry.recipes.title, hero_image_url: entry.recipes.hero_image_url } : null,
  );
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<RecipeOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [startDate, setStartDate] = useState(entry?.start_date ?? '');
  const [endDate, setEndDate] = useState(entry?.end_date ?? '');

  // Recherche débouncée, limitée aux recettes publiques et publiées : ni
  // brouillon, ni en attente, ni privée ne doivent pouvoir être mises en avant.
  useEffect(() => {
    if (selected) return;
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data, error } = await createClient()
        .from('recipes')
        .select('id, title, hero_image_url')
        .eq('status', 'published')
        .eq('is_public', true)
        .ilike('title', `%${term.trim()}%`)
        .order('title', { ascending: true })
        .limit(20);
      if (!cancelled) {
        setResults(error ? [] : ((data as RecipeOption[] | null) ?? []));
        setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, selected]);

  // Chevauchement bloquant : toute plage existante (hors celle éditée) qui
  // intersecte [startDate, endDate]. Vérifié à chaque frappe, sans requête —
  // la liste complète est déjà chargée par la page.
  const conflict = useMemo(() => {
    if (!startDate || !endDate) return null;
    return items.find((it) => it.id !== entry?.id && overlaps(startDate, endDate, it.start_date, it.end_date)) ?? null;
  }, [items, startDate, endDate, entry?.id]);

  const datesInvalid = !!startDate && !!endDate && endDate < startDate;
  const canSave = !!selected && !!startDate && !!endDate && !datesInvalid && !conflict;

  async function save() {
    if (!selected) return dialog.alert('Choisissez une recette.');
    if (!startDate || !endDate) return dialog.alert('Renseignez les deux dates.');
    if (datesInvalid) return dialog.alert('La date de fin doit être postérieure ou égale à la date de début.');
    if (conflict) return; // message bloquant déjà affiché sous les champs

    const payload = { recipe_id: selected.id, start_date: startDate, end_date: endDate };
    const q = createClient().from('featured_recipes' as never) as unknown as {
      insert: (v: unknown) => Promise<{ error: { message: string } | null }>;
      update: (v: unknown) => { eq: (c: string, val: unknown) => Promise<{ error: { message: string } | null }> };
    };
    // `refresh: false` : la modale se démonte aussitôt onSaved() appelé, donc
    // c'est au parent (toujours monté) de porter la resynchronisation.
    const ok = await mutate(() => (entry ? q.update(payload).eq('id', entry.id) : q.insert(payload)), {
      refresh: false,
      errorLabel: 'Programmation impossible',
    });
    if (ok) onSaved();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-bright border-l border-outline-variant z-50 flex flex-col">
        <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant">
          <h3 className="font-headline-md text-xl font-semibold">{entry ? 'Modifier la programmation' : 'Programmer une recette'}</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div className="flex flex-col gap-2">
            <label className={LABEL}>Recette *</label>
            {selected ? (
              <div className="flex items-center gap-3 border border-outline-variant rounded px-3 py-2">
                {selected.hero_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data-URL stockée en base
                  <img src={selected.hero_image_url} alt="" className="w-9 h-9 rounded object-cover bg-surface-container" />
                ) : (
                  <div className="w-9 h-9 rounded bg-surface-container" />
                )}
                <span className="text-sm font-medium flex-1 truncate">{selected.title}</span>
                <button type="button" onClick={() => setSelected(null)} className="text-on-surface-variant hover:text-error" title="Changer de recette">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            ) : (
              <>
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Rechercher une recette publique…"
                  className={FIELD}
                  autoFocus
                />
                <div className="max-h-56 overflow-y-auto border border-outline-variant rounded divide-y divide-outline-variant">
                  {searching ? (
                    <p className="px-3 py-3 text-xs text-on-surface-variant">Recherche…</p>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-on-surface-variant">Aucune recette publique trouvée.</p>
                  ) : (
                    results.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelected(r)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-container-low text-left"
                      >
                        {r.hero_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- data-URL stockée en base
                          <img src={r.hero_image_url} alt="" className="w-8 h-8 rounded object-cover bg-surface-container" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-surface-container" />
                        )}
                        <span className="text-sm truncate">{r.title}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
            <p className="text-[11px] text-on-surface-variant">
              Seules les recettes publiques et publiées (ni brouillon, ni en attente) sont proposées.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Du *</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={FIELD} />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Au *</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={FIELD} />
            </label>
          </div>

          {datesInvalid && (
            <p className="text-xs text-error font-medium">La date de fin doit être postérieure ou égale à la date de début.</p>
          )}
          {!datesInvalid && conflict && (
            <p className="text-xs text-error font-medium">
              Chevauchement avec « {conflict.recipes?.title ?? 'une autre recette'} » du {formatDate(conflict.start_date)} au{' '}
              {formatDate(conflict.end_date)}. Modifiez les dates pour continuer.
            </p>
          )}
        </div>
        <div className="px-8 py-6 border-t border-outline-variant flex gap-3">
          <button
            onClick={save}
            disabled={busy || !canSave}
            className="flex-1 bg-primary text-on-primary py-3 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
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
