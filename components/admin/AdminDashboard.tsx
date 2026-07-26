'use client';

// Tableau de bord admin (porté de admin.html) : stats, recettes en attente
// (approuver/supprimer), commentaires en attente (approuver/spam/supprimer).
// Mutations via useMutation (écriture navigateur + resynchro serveur).
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import type { AdminRecipeRow, PendingComment, AiCosts } from '@/lib/admin';

// Montants déjà convertis côté serveur (le taux €/$ est une variable
// d'environnement serveur) : ici, formatage seul.
function montant(usd: number, eur: number): string {
  const d = usd < 0.01 && usd > 0 ? `${(usd * 100).toFixed(2)} ¢` : `${usd.toFixed(2)} $`;
  const e = eur < 0.01 && eur > 0 ? `${(eur * 100).toFixed(2)} c€` : `${eur.toFixed(2)} €`;
  return `${d} · ${e}`;
}

export function AdminDashboard({
  stats,
  pending,
  comments,
  aiCosts,
}: {
  stats: { totalRecipes: number; pendingRecipes: number; pendingComments: number };
  pending: AdminRecipeRow[];
  comments: PendingComment[];
  aiCosts: AiCosts;
}) {
  const { mutate } = useMutation();
  const sb = () => createClient();

  const cards = [
    { icon: 'menu_book', label: 'Total Recettes', value: stats.totalRecipes.toLocaleString('fr-FR'), badge: '+12%', badgeCls: 'text-on-tertiary-container' },
    { icon: 'pending_actions', label: 'En Attente', value: String(stats.pendingRecipes), badge: 'Priorité', badgeCls: 'text-error' },
    { icon: 'chat_bubble', label: 'Nouveaux Commentaires', value: String(stats.pendingComments), badge: "Aujourd'hui", badgeCls: 'text-on-tertiary-container' },
    { icon: 'group', label: 'Utilisateurs Actifs', value: '8,5k', badge: 'Actifs', badgeCls: 'text-on-tertiary-container' },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-gutter lg:px-margin-desktop lg:py-12 bg-surface">
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter mb-12">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface-container-low border border-tertiary/10 p-8 rounded-xl">
            <div className="flex justify-between items-start mb-4">
              <span className="material-symbols-outlined text-primary-container p-2 bg-primary-fixed rounded-lg">{c.icon}</span>
              <span className={`text-xs font-label-md tracking-wider ${c.badgeCls}`}>{c.badge}</span>
            </div>
            <h3 className="font-label-md text-on-surface-variant uppercase tracking-widest text-xs mb-1">{c.label}</h3>
            <p className="font-headline-lg text-primary">{c.value}</p>
          </div>
        ))}
      </section>

      {/* Coûts IA — mesurés depuis la consommation réelle renvoyée par l'API. */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-6">
          <h2 className="font-headline-md text-primary flex items-center gap-3">
            <span className="material-symbols-outlined">payments</span> Coût des imports IA
          </h2>
          <span className="text-xs text-on-surface-variant">
            {aiCosts.modeles.length > 0 ? aiCosts.modeles.join(', ') : 'aucun import mesuré'}
            {' · '}1 crédit Anthropic = 1 $ · taux € indicatif ({aiCosts.tauxEur})
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
          {[
            { label: "Aujourd'hui", d: aiCosts.jour },
            { label: 'Ce mois-ci', d: aiCosts.mois },
            { label: 'Depuis le début', d: aiCosts.total },
          ].map(({ label, d }) => (
            <div key={label} className="bg-surface-container-low border border-tertiary/10 p-8 rounded-xl">
              <h3 className="font-label-md text-on-surface-variant uppercase tracking-widest text-xs mb-1">
                {label}
              </h3>
              <p className="font-headline-lg text-primary">{montant(d.usd, d.eur)}</p>
              <p className="text-xs text-on-surface-variant mt-2">
                {d.imports} import{d.imports > 1 ? 's' : ''}
                {d.imports > 0 && ` · ${montant(d.moyenneUsd, d.moyenneUsd * aiCosts.tauxEur)} en moyenne`}
              </p>
              <p className="text-xs text-on-surface-variant">
                {(d.inputTokens + d.outputTokens).toLocaleString('fr-FR')} tokens (
                {d.inputTokens.toLocaleString('fr-FR')} entrée / {d.outputTokens.toLocaleString('fr-FR')} sortie)
              </p>
              {d.importsSansCout > 0 && (
                <p className="text-xs text-on-surface-variant italic mt-2">
                  {d.importsSansCout} import{d.importsSansCout > 1 ? 's' : ''} sans coût mesuré (antérieur
                  {d.importsSansCout > 1 ? 's' : ''} à la mesure, ou modèle hors tarif)
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-headline-md text-primary">Recettes en attente de validation</h2>
          <Link href="/admin/recettes" className="text-primary font-label-md hover:underline decoration-1 flex items-center gap-1">
            Voir tout <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </Link>
        </div>
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
                          onClick={() => mutate(() => sb().from('recipes').update({ status: 'published' }).eq('id', r.id))}
                          className="p-2 text-primary hover:bg-primary-fixed rounded transition-colors"
                          title="Approuver"
                        >
                          <span className="material-symbols-outlined">check_circle</span>
                        </button>
                        <Link href={`/creer?id=${r.id}`} className="p-2 text-on-surface-variant hover:bg-surface-container-high rounded transition-colors" title="Modifier">
                          <span className="material-symbols-outlined">edit_square</span>
                        </Link>
                        <button
                          onClick={() => mutate(() => sb().from('recipes').delete().eq('id', r.id), { confirm: 'Supprimer cette recette ?' })}
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
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-headline-md text-primary">Commentaires en attente</h2>
          <div className="flex gap-2">
            <button className="bg-surface-container border border-outline-variant px-4 py-1.5 rounded-full text-xs font-label-md text-on-surface-variant hover:bg-outline-variant transition-colors">
              Filtrer par date
            </button>
            <button className="bg-surface-container border border-outline-variant px-4 py-1.5 rounded-full text-xs font-label-md text-on-surface-variant hover:bg-outline-variant transition-colors">
              Actions groupées
            </button>
          </div>
        </div>
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
                          onClick={() => mutate(() => sb().from('comments').update({ status: 'approved' }).eq('id', c.id))}
                          className="px-3 py-1 bg-primary text-surface-bright rounded text-xs font-label-md hover:bg-primary-container transition-colors"
                        >
                          Approuver
                        </button>
                        <button
                          onClick={() => mutate(() => sb().from('comments').update({ status: 'spam' }).eq('id', c.id))}
                          className="px-3 py-1 border border-outline text-xs font-label-md hover:bg-surface-container transition-colors"
                        >
                          Spam
                        </button>
                        <button
                          onClick={() => mutate(() => sb().from('comments').delete().eq('id', c.id), { confirm: 'Supprimer ?' })}
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

      <Link
        href="/admin/listes"
        className="fixed bottom-8 right-8 w-14 h-14 bg-primary-container text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all z-40 group"
      >
        <span className="material-symbols-outlined">add</span>
        <span className="absolute right-16 bg-primary-container text-white px-4 py-2 rounded-lg text-sm font-label-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Créer une entrée
        </span>
      </Link>
    </main>
  );
}
