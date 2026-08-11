import Link from 'next/link';
import { MaryseIcon } from '@/components/MaryseIcon';
import { PlanningIcon, DISC } from '@/components/PlanningIcon';
import { INVITATION_CONTENT, type InvitationDestination } from '@/lib/invitation-content';

// Écran vu par un visiteur qui clique sur « Mon carnet » ou « En cuisine »
// (README « Écran 4 — Invitation »). Décision du handoff : on montre ce qu'il
// y a derrière, jamais un renvoi sec vers la connexion ni un cadenas — les
// deux destinations restent visibles et cliquables dans les deux chromes
// (cf. lib/nav.ts), c'est cet écran qu'elles atteignent sans session.
//
// L'aperçu est un vrai écran, estompé et **inerte** (`.invitation-peek`,
// app/globals.css) : on comprend l'intérêt sans pouvoir s'en servir. Son
// contenu est fictif et statique (aucune donnée de visiteur à montrer) —
// et délibérément aligné sur ce que l'écran réel affiche *aujourd'hui*,
// pas sur la maquette d'origine : celle-ci promettait un décompte
// (« dans 12 min ») que le produit ne sait pas encore tenir (aucun ancrage
// horaire par étape). Un aperçu qui promet ce qu'on n'obtient pas serait
// pire qu'un aperçu absent.
export function InvitationScreen({ destination }: { destination: InvitationDestination }) {
  const c = INVITATION_CONTENT[destination];

  return (
    <main className="mx-auto max-w-[1200px] px-margin-mobile pb-32 md:px-margin-desktop">
      {/* ── L'invitation ── */}
      <section className="mx-auto max-w-[64ch] pt-14 pb-10 text-center">
        <p className="mb-4 font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
          {c.kicker}
        </p>
        <h1 className="mb-5 font-headline-lg text-[32px] font-bold leading-tight text-primary md:text-[42px]">
          {c.title}
        </h1>
        <p className="mb-8 text-[16px] leading-relaxed text-on-surface-variant">{c.lead}</p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/connexion?inscription=1"
            className="rounded-pill bg-primary px-9 py-3.5 text-[12.5px] font-semibold uppercase tracking-[0.15em] text-on-primary transition-all hover:shadow-xl active:scale-95"
          >
            Créer un compte
          </Link>
          <Link href="/connexion" className="font-label-md text-[13px] font-semibold text-primary hover:underline">
            J&apos;ai déjà un compte
          </Link>
        </div>
        <p className="mt-5 text-[13px] text-on-surface-variant">
          Gratuit. Vos recettes restent privées tant que vous ne les publiez pas.
        </p>
      </section>

      {/* ── Ce qu'on y met ── */}
      <section className="grid grid-cols-1 gap-9 border-y border-outline-variant py-10 md:grid-cols-3">
        {c.points.map((p) => (
          <div key={p.title} className="px-2 text-center">
            <span className="material-symbols-outlined mb-3 text-[30px] text-primary">{p.icon}</span>
            <h3 className="mb-2 font-headline-md text-[19px] text-primary">{p.title}</h3>
            <p className="text-[14px] leading-relaxed text-on-surface-variant">{p.text}</p>
          </div>
        ))}
      </section>

      {/* ── L'aperçu ── */}
      <section className="pt-12">
        <p className="mb-7 text-center font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
          {c.peekLabel}
        </p>

        <div className="invitation-peek" aria-hidden="true">
          {destination === 'carnet' ? <CarnetPeek /> : <CuisinePeek />}
        </div>

        <div className="relative z-10 -mt-8 text-center">
          <Link
            href="/connexion?inscription=1"
            className="inline-block rounded-pill bg-primary px-9 py-3.5 text-[12.5px] font-semibold uppercase tracking-[0.15em] text-on-primary transition-all hover:shadow-xl active:scale-95"
          >
            Créer un compte
          </Link>
          <p className="mt-4 text-[13px] text-on-surface-variant">
            Ou{' '}
            <Link href="/recherche" className="font-semibold hover:underline">
              parcourez les recettes
            </Link>{' '}
            sans créer de compte.
          </p>
        </div>
      </section>
    </main>
  );
}

// Vignette placeholder — jamais d'image hotlinkée depuis un outil de design
// tiers : même principe que les recettes réelles sans `hero_image_url`.
function PeekThumb({ className = 'aspect-[4/3]' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded bg-surface-container ${className}`}>
      <span className="material-symbols-outlined text-4xl text-on-surface-variant">cake</span>
    </div>
  );
}

const PEEK_CARDS = [
  { badge: 'Publiée', badgeCls: 'bg-green-700', title: 'Tartelette Framboise & Verveine', type: 'Tartes', d: 3, time: '1 h 15' },
  { badge: 'Brouillon', badgeCls: 'bg-secondary', title: 'Entremets Chocolat Noir 70 %', type: 'Entremets', d: 5, time: '4 h' },
  { badge: 'Publiée', badgeCls: 'bg-green-700', title: 'Tartelettes Miroir au Chocolat', type: 'Tartes', d: 4, time: '2 h' },
] as const;

function CarnetPeek() {
  return (
    <>
      <div className="mb-8 border-y border-outline-variant py-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="whitespace-nowrap rounded-pill bg-primary px-4 py-1.5 text-[12.5px] font-semibold text-on-primary">
              Tout <span className="opacity-60">11</span>
            </span>
            {['Mes créations 5', 'Importées 1', 'Favoris 2', 'Mes abonnements 3'].map((t) => {
              const [label, n] = [t.slice(0, t.lastIndexOf(' ')), t.slice(t.lastIndexOf(' ') + 1)];
              return (
                <span
                  key={t}
                  className="whitespace-nowrap rounded-pill border border-outline-variant px-4 py-1.5 text-[12.5px] font-semibold text-on-surface-variant"
                >
                  {label} <span className="opacity-60">{n}</span>
                </span>
              );
            })}
          </div>
          <div className="relative ml-auto">
            <span className="block w-52 rounded-pill bg-surface-container-low py-2 pl-4 pr-10 text-[13px] text-on-surface-variant/60 md:w-64">
              Chercher dans mon carnet…
            </span>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">
              search
            </span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {PEEK_CARDS.map((r) => (
          <article key={r.title} className="border border-outline-variant bg-white">
            <div className="relative">
              <PeekThumb />
              <span className={`absolute left-3 top-3 rounded px-2 py-1 text-[10px] font-semibold text-white ${r.badgeCls}`}>
                {r.badge}
              </span>
            </div>
            <div className="p-6">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex shrink-0 items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <MaryseIcon key={i} size={13} className={i <= r.d ? 'text-primary' : 'text-outline-variant'} />
                    ))}
                  </span>
                  <span className="truncate text-[12px] font-semibold uppercase tracking-widest text-secondary">
                    {r.type}
                  </span>
                </div>
                <span className="shrink-0 text-[12px] text-on-surface-variant">{r.time}</span>
              </div>
              <h3 className="font-headline-md text-[20px] text-on-surface">{r.title}</h3>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

const PEEK_SESSIONS = [
  { title: 'Le Saint-Honoré Traditionnel', step: 'Étape 2 sur 3 · Crème Chiboust', done: 2, total: 3 },
  { title: 'Pain au levain', step: 'Étape 1 sur 4 · Autolyse', done: 1, total: 4 },
] as const;

const PEEK_PLAN = [
  { title: 'Cake Citron Pavot', sub: 'Pâte et repos · J − 1 · 45 min · 2 × cercle 20 cm' },
  { title: 'Gaufres liégeoises', sub: 'Pâte levée, repos · J − 1 · 30 min · 20 unités' },
] as const;

const PEEK_COURSES = [
  { name: 'Courses du week-end', done: 6, total: 14 },
  { name: 'Saint-Honoré — 20 oct.', done: 0, total: 9 },
] as const;

function CuisinePeek() {
  return (
    <>
      <div className="mb-5 flex items-center gap-2.5 border-b border-outline-variant pb-3">
        <span className="font-headline-md text-[22px] font-bold text-primary">Sessions en cours</span>
        <span className="rounded-pill bg-primary px-2 py-0.5 text-[10.5px] font-semibold text-on-primary">2</span>
      </div>
      <div className="mb-10 space-y-4">
        {PEEK_SESSIONS.map((s) => (
          <article key={s.title} className="flex flex-col gap-4 rounded-xl border border-primary/35 bg-surface-container-low p-5 md:flex-row md:items-center">
            <PeekThumb className="h-11 w-11 shrink-0 md:h-20 md:w-20" />
            <div className="min-w-0 flex-1">
              <h4 className="mb-1 font-headline-md text-[20px] leading-tight text-primary">{s.title}</h4>
              <p className="mb-3 text-[12.5px] text-on-surface-variant">{s.step}</p>
              <div className="flex gap-1.5" style={{ maxWidth: 200 }}>
                {Array.from({ length: s.total }, (_, j) => (
                  <span key={j} className={`h-1.5 flex-1 rounded-pill ${j < s.done ? 'bg-primary' : 'bg-outline-variant'}`} />
                ))}
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-pill bg-primary px-5 py-2.5 text-[13px] font-semibold text-on-primary md:ml-auto">
              <span className="material-symbols-outlined text-[18px]">play_arrow</span> Reprendre
            </span>
          </article>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-x-14 gap-y-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h3 className="mb-5 flex items-center gap-2 border-b border-outline-variant pb-3 font-headline-md text-[22px] font-bold text-primary">
            <PlanningIcon size={22} discFill={DISC.surface} /> Planning
          </h3>
          <div className="space-y-3">
            {PEEK_PLAN.map((r) => (
              <article key={r.title} className="flex items-center gap-4 rounded-lg border border-outline-variant p-4">
                <PeekThumb className="h-14 w-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-primary">{r.title}</p>
                  <p className="text-[12.5px] text-on-surface-variant">{r.sub}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border border-outline-variant px-4 py-2 text-[12.5px] font-semibold text-primary">
                  <span className="material-symbols-outlined text-[17px]">play_arrow</span>
                  <span className="hidden sm:inline">Démarrer</span>
                </span>
              </article>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5">
          <h3 className="mb-5 flex items-center gap-2 border-b border-outline-variant pb-3 font-headline-md text-[22px] font-bold text-primary">
            <span className="material-symbols-outlined">shopping_bag</span> Listes de courses
          </h3>
          <div className="space-y-3">
            {PEEK_COURSES.map((l) => (
              <div key={l.name} className="rounded-lg border border-outline-variant p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <span className="text-[15px] font-semibold text-primary">{l.name}</span>
                  <span className="shrink-0 text-[12px] text-on-surface-variant">
                    {l.done} / {l.total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-pill bg-surface-container-highest">
                  <span
                    className="block h-full rounded-pill bg-primary"
                    style={{ width: `${l.total > 0 ? Math.round((l.done / l.total) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
