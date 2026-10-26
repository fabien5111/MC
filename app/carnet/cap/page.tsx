import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { canAccess } from '@/lib/entitlements';
import { getEntitlements } from '@/lib/entitlements-data';
import { getCarnetData, applyCarnetFilters } from '@/lib/carnet';
import { EMPTY_CARNET_PARAMS } from '@/lib/carnet-params';
import { CAP_MAX_RECETTES, getFichesCapRecettes, getItemsCap } from '@/lib/carnet-cap-data';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { CapCarnet } from '@/components/cap/CapCarnet';
import { CapSelection, type CapChoix } from '@/components/cap/CapSelection';

// Carnet CAP de plusieurs recettes (JEP-6, lot 3) — droit `carnet_cap`
// (plan Pro). Deux temps : choisir les recettes, puis l'aperçu imprimable
// (sommaire, ordre alphabétique, une ou plusieurs recettes par page). Les
// fiches d'UNE recette ou d'UNE fournée restent gratuites.
//
// Deux listes à choisir : celles de la rubrique « Carnet CAP » du carnet
// (`?liste=cap`, la liste CAP remplie à la main — JEP-376 —, cochées d'office, la
// recherche de la rubrique est reprise par `?q=`) ou tout le carnet.
export const metadata: Metadata = { title: 'Carnet CAP | Je pâtisse !' };
export const dynamic = 'force-dynamic';

type SearchParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const liste = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

export default async function CarnetCapPage({ searchParams }: SearchParams) {
  const user = await requireUser('/carnet/cap');
  const sp = await searchParams;
  const ids = liste(sp.r);
  const choisir = sp.choisir === '1' || !ids.length;
  const listeCap = sp.liste === 'cap';
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? '';
  const droits = await getEntitlements(user.id);
  const autorise = canAccess(droits, 'carnet_cap');

  let contenu: React.ReactNode;
  if (!autorise) {
    contenu = (
      <div className="mx-auto max-w-[720px] px-margin-mobile py-16 text-center md:px-margin-desktop">
        <h1 className="mb-3 font-headline-lg text-[26px] font-bold text-primary">Carnet CAP complet</h1>
        <p className="mb-2 text-on-surface">
          Imprimer en une fois plusieurs recettes de votre carnet, avec sommaire, au format autorisé à l’examen du CAP
          Pâtissier est réservé à la formule Pro.
        </p>
        <p className="mb-6 text-[14px] text-on-surface-variant">
          La fiche CAP d’une recette ou d’une fournée reste disponible depuis le bouton Imprimer de chaque fiche.
        </p>
        <Link
          href="/plans"
          prefetch={false}
          className="inline-block rounded-pill bg-primary px-5 py-2.5 text-[13px] font-semibold text-on-primary hover:shadow-lg"
        >
          Voir les formules
        </Link>
      </div>
    );
  } else if (choisir) {
    const { items } = await getCarnetData(user.id);
    const source = listeCap ? (await getItemsCap(user.id, items)).items : items;
    const recettes: CapChoix[] = applyCarnetFilters(source, {
      ...EMPTY_CARNET_PARAMS,
      scope: listeCap ? 'cap' : 'all',
      tri: 'alpha',
      q: listeCap ? q : '',
    }).map((it) => ({
      id: it.recipe.id,
      titre: it.recipe.title,
      origine:
        it.kind === 'mine'
          ? it.recipe.status === 'published'
            ? 'Ma recette'
            : 'Mon brouillon'
          : it.shared
            ? 'Partagée avec moi'
            : it.favorite
              ? 'Favori'
              : it.subscription
                ? 'Abonnement'
                : 'Communauté',
    }));
    contenu = (
      <div className="mx-auto max-w-[900px] px-margin-mobile pb-24 pt-8 md:px-margin-desktop">
        <Link href="/carnet" prefetch={false} className="mb-4 inline-flex items-center gap-1 text-[13px] text-on-surface-variant hover:text-primary">
          <span className="material-symbols-outlined text-[18px]" aria-hidden>
            arrow_back
          </span>
          Mon carnet
        </Link>
        <h1 className="mb-2 font-headline-lg text-[26px] font-bold leading-tight text-primary md:text-[32px]">Carnet CAP</h1>
        <p className="mb-4 text-[14px] text-on-surface-variant">
          Choisissez les recettes à imprimer. Seuls leurs ingrédients et leurs quantités figureront sur les feuilles, comme
          l’exige l’examen du CAP Pâtissier.
        </p>
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Liste des recettes">
          {[
            { cap: true, label: 'Ma liste CAP', href: '/carnet/cap?choisir=1&liste=cap' },
            { cap: false, label: 'Tout mon carnet', href: '/carnet/cap?choisir=1' },
          ].map((o) => (
            <Link
              key={o.label}
              href={o.href}
              prefetch={false}
              aria-current={o.cap === listeCap ? 'true' : undefined}
              className={`whitespace-nowrap rounded-pill px-4 py-1.5 text-[12.5px] font-semibold transition-all ${
                o.cap === listeCap
                  ? 'bg-primary text-on-primary'
                  : 'border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
              }`}
            >
              {o.label}
            </Link>
          ))}
        </div>
        <CapSelection
          key={listeCap ? 'cap' : 'carnet'}
          recettes={recettes}
          coches={ids.length ? ids : listeCap ? recettes.map((r) => r.id) : []}
          max={CAP_MAX_RECETTES}
          liste={listeCap ? 'cap' : undefined}
        />
      </div>
    );
  } else {
    const fiches = await getFichesCapRecettes(ids);
    const retour = `/carnet/cap?choisir=1${listeCap ? '&liste=cap' : ''}&${ids.map((id) => `r=${encodeURIComponent(id)}`).join('&')}`;
    contenu = <CapCarnet fiches={fiches} carnet titreEcran="Carnet CAP" retour={{ href: retour, label: 'Modifier la sélection' }} />;
  }

  return (
    <>
      <Header current="carnet" className="no-print" />
      <main>{contenu}</main>
      <div className="no-print">
        <Footer />
        <MobileNav current="carnet" />
      </div>
    </>
  );
}
