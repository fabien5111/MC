'use client';

// Tableau de bord admin (porté de admin.html) : stats, coût IA, recettes en
// attente (approuver/supprimer). La modération des avis a son propre écran
// (/admin/commentaires, `CommentsManager`) — elle vivait ici en simple ancre
// `#comments`, invisible depuis la barre latérale une fois la file ouverte.
// Mutations via useMutation (écriture navigateur + resynchro serveur).
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import type { AdminRecipeRow, AiCosts, AiCostCategory, AiCostSummary } from '@/lib/admin';

// Montants déjà convertis côté serveur (le taux €/$ est une variable
// d'environnement serveur) : ici, formatage seul.
function montant(usd: number, eur: number): string {
  const d = usd < 0.01 && usd > 0 ? `${(usd * 100).toFixed(2)} ¢` : `${usd.toFixed(2)} $`;
  const e = eur < 0.01 && eur > 0 ? `${(eur * 100).toFixed(2)} c€` : `${eur.toFixed(2)} €`;
  return `${d} · ${e}`;
}

// Une cellule du tableau Coût IA : montant + nombre d'appels de la période.
function CoutCellule({ d }: { d: AiCostSummary }) {
  return (
    <div>
      <p className="font-medium text-on-surface">{montant(d.usd, d.eur)}</p>
      <p className="text-xs text-on-surface-variant">
        {d.appels} appel{d.appels > 1 ? 's' : ''}
        {d.appelsSansCout > 0 && ` (dont ${d.appelsSansCout} sans coût mesuré)`}
      </p>
    </div>
  );
}

export function AdminDashboard({
  stats,
  pending,
  aiCosts,
}: {
  stats: { totalRecipes: number; pendingRecipes: number; pendingComments: number };
  pending: AdminRecipeRow[];
  aiCosts: AiCosts;
}) {
  const { mutate } = useMutation();
  const sb = () => createClient();

  const cards = [
    { icon: 'menu_book', label: 'Total Recettes', value: stats.totalRecipes.toLocaleString('fr-FR'), badge: '+12%', badgeCls: 'text-on-tertiary-container', href: '/admin/recettes' },
    { icon: 'pending_actions', label: 'En Attente', value: String(stats.pendingRecipes), badge: 'Priorité', badgeCls: 'text-error', href: '/admin/recettes' },
    { icon: 'chat_bubble', label: 'Avis à modérer', value: String(stats.pendingComments), badge: 'À valider', badgeCls: 'text-on-tertiary-container', href: '/admin/commentaires' },
    { icon: 'group', label: 'Utilisateurs Actifs', value: '8,5k', badge: 'Actifs', badgeCls: 'text-on-tertiary-container', href: '/admin/membres' },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-gutter lg:px-margin-desktop lg:py-12 bg-surface">
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter mb-12">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="bg-surface-container-low border border-tertiary/10 p-8 rounded-xl block hover:border-primary/40 transition-colors"
          >
            <div className="flex justify-between items-start mb-4">
              <span className="material-symbols-outlined text-primary-container p-2 bg-primary-fixed rounded-lg">{c.icon}</span>
              <span className={`text-xs font-label-md tracking-wider ${c.badgeCls}`}>{c.badge}</span>
            </div>
            <h3 className="font-label-md text-on-surface-variant uppercase tracking-widest text-xs mb-1">{c.label}</h3>
            <p className="font-headline-lg text-primary">{c.value}</p>
          </Link>
        ))}
      </section>

      {/* Coût IA — mesuré depuis la consommation réelle renvoyée par l'API,
          par poste (import, vérification recettes, ajustement recette). */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-6">
          <h2 className="font-headline-md text-primary flex items-center gap-3">
            <span className="material-symbols-outlined">payments</span> Coût IA
          </h2>
          <span className="text-xs text-on-surface-variant">
            1 crédit Anthropic = 1 $ · taux € indicatif ({aiCosts.tauxEur})
          </span>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead className="bg-surface-container font-label-md text-on-surface-variant border-b border-outline-variant">
              <tr>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs">Poste</th>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs">Aujourd&apos;hui</th>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs">Ce mois-ci</th>
                <th className="px-8 py-4 font-semibold uppercase tracking-wider text-xs">Depuis le début</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant font-body-md text-on-surface">
              {(
                [
                  { label: 'Import IA', c: aiCosts.import },
                  { label: 'Vérification recettes', c: aiCosts.verification },
                  { label: 'Ajustement recette', c: aiCosts.ajustement },
                ] as { label: string; c: AiCostCategory }[]
              ).map(({ label, c }) => (
                <tr key={label} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-8 py-5">
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-on-surface-variant">
                      {c.modeles.length > 0 ? c.modeles.join(', ') : 'aucun appel mesuré'}
                    </p>
                  </td>
                  <td className="px-8 py-5"><CoutCellule d={c.jour} /></td>
                  <td className="px-8 py-5"><CoutCellule d={c.mois} /></td>
                  <td className="px-8 py-5"><CoutCellule d={c.total} /></td>
                </tr>
              ))}
              <tr className="bg-surface-container-low font-medium">
                <td className="px-8 py-5">Total</td>
                <td className="px-8 py-5"><CoutCellule d={aiCosts.ensemble.jour} /></td>
                <td className="px-8 py-5"><CoutCellule d={aiCosts.ensemble.mois} /></td>
                <td className="px-8 py-5"><CoutCellule d={aiCosts.ensemble.total} /></td>
              </tr>
            </tbody>
          </table>
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
                        {/* Panneau de contrôle (Admin → Recettes), pas la fiche
                            recette publique : c'est là que se joue la décision
                            (valider/refuser) et l'analyse IA. */}
                        <Link href={`/admin/recettes#recette-${r.id}`} className="font-medium hover:text-primary">
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
