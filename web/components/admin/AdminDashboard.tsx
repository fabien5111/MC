'use client';

// Tableau de bord admin (porté de admin.html) : stats, recettes en attente
// (approuver/supprimer), commentaires en attente (approuver/spam/supprimer).
// Mutations via le client Supabase navigateur puis router.refresh().
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { AdminRecipeRow, PendingComment } from '@/lib/admin';

export function AdminDashboard({
  stats,
  pending,
  comments,
}: {
  stats: { totalRecipes: number; pendingRecipes: number; pendingComments: number };
  pending: AdminRecipeRow[];
  comments: PendingComment[];
}) {
  const router = useRouter();

  async function run(action: PromiseLike<{ error: unknown }>) {
    const { error } = await action;
    if (error) return void alert('Erreur : ' + (error as { message?: string }).message);
    router.refresh();
  }
  const sb = () => createClient();

  const cards = [
    { icon: 'menu_book', label: 'Total Recettes', value: stats.totalRecipes.toLocaleString('fr-FR') },
    { icon: 'pending_actions', label: 'En Attente', value: String(stats.pendingRecipes) },
    { icon: 'chat_bubble', label: 'Commentaires en attente', value: String(stats.pendingComments) },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-gutter lg:px-margin-desktop lg:py-12 bg-surface">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-12">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface-container-low border border-tertiary/10 p-8 rounded-xl">
            <span className="material-symbols-outlined text-primary-container p-2 bg-primary-fixed rounded-lg mb-4 inline-block">
              {c.icon}
            </span>
            <h3 className="font-label-md text-on-surface-variant uppercase tracking-widest text-xs mb-1">{c.label}</h3>
            <p className="font-headline-lg text-primary">{c.value}</p>
          </div>
        ))}
      </section>

      <section className="mb-12">
        <h2 className="font-headline-md text-primary mb-6">Recettes en attente de validation</h2>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead className="bg-surface-container font-label-md text-on-surface-variant border-b border-outline-variant">
              <tr>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs">Titre</th>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs">Auteur</th>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs">Date</th>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant font-body-md text-on-surface">
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-8 py-10 text-center text-on-surface-variant">
                    Aucune recette en attente.
                  </td>
                </tr>
              ) : (
                pending.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded bg-surface-container overflow-hidden flex items-center justify-center shrink-0">
                          {r.hero_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- data-URL
                            <img src={r.hero_image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="material-symbols-outlined text-on-surface-variant">image</span>
                          )}
                        </div>
                        <Link href={`/recette/${r.id}`} className="font-medium hover:text-primary">
                          {r.title}
                        </Link>
                      </div>
                    </td>
                    <td className="px-8 py-5">{r.profiles?.full_name || '—'}</td>
                    <td className="px-8 py-5 text-on-surface-variant">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => run(sb().from('recipes').update({ status: 'published' }).eq('id', r.id))}
                          className="p-2 text-primary hover:bg-primary-fixed rounded transition-colors"
                          title="Approuver"
                        >
                          <span className="material-symbols-outlined">check_circle</span>
                        </button>
                        <Link href={`/creer?id=${r.id}`} className="p-2 text-on-surface-variant hover:bg-surface-container-high rounded transition-colors" title="Modifier">
                          <span className="material-symbols-outlined">edit_square</span>
                        </Link>
                        <button
                          onClick={() => confirm('Supprimer cette recette ?') && run(sb().from('recipes').delete().eq('id', r.id))}
                          className="p-2 text-error hover:bg-error-container rounded transition-colors"
                          title="Supprimer"
                        >
                          <span className="material-symbols-outlined">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section id="comments">
        <h2 className="font-headline-md text-primary mb-6">Commentaires en attente</h2>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead className="bg-surface-container font-label-md text-on-surface-variant border-b border-outline-variant">
              <tr>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs">Recette</th>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs">Utilisateur</th>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs">Aperçu</th>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant font-body-md text-on-surface">
              {comments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-8 py-10 text-center text-on-surface-variant">
                    Aucun commentaire en attente.
                  </td>
                </tr>
              ) : (
                comments.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-8 py-5 font-medium text-primary">
                      {c.recipe_id ? (
                        <Link href={`/recette/${c.recipe_id}`} className="hover:underline">
                          {c.recipes?.title || '—'}
                        </Link>
                      ) : (
                        c.recipes?.title || '—'
                      )}
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-secondary-container text-[10px] flex items-center justify-center font-bold">
                          {(c.profiles?.full_name || 'U').charAt(0)}
                        </div>
                        <span>{c.profiles?.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 italic text-on-surface-variant">&quot;{c.content.substring(0, 80)}…&quot;</td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => run(sb().from('comments').update({ status: 'approved' }).eq('id', c.id))}
                          className="px-3 py-1 bg-primary text-surface-bright rounded text-xs font-label-md hover:bg-primary-container transition-colors"
                        >
                          Approuver
                        </button>
                        <button
                          onClick={() => run(sb().from('comments').update({ status: 'spam' }).eq('id', c.id))}
                          className="px-3 py-1 border border-outline text-xs font-label-md hover:bg-surface-container transition-colors"
                        >
                          Spam
                        </button>
                        <button
                          onClick={() => confirm('Supprimer ?') && run(sb().from('comments').delete().eq('id', c.id))}
                          className="px-3 py-1 border border-error text-error text-xs font-label-md hover:bg-error-container transition-colors"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
