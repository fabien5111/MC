// Aperçu restreint d'un carnet partagé par lien (JEP-21).
//
// Ce que voit quiconque ouvre le lien public d'un carnet : le nom de son
// propriétaire, le nombre de recettes qu'il ouvrira, une mosaïque floutée —
// et un panneau central qui impose la connexion ou la création d'un compte
// pour « déverrouiller » le carnet. Motif du profil Instagram privé.
//
// Le déverrouillage lui-même vit dans `./deverrouiller` : c'est la
// destination `next` passée à `/connexion`, que le parcours d'inscription
// transporte déjà de bout en bout (confirmation par e-mail, Google,
// `/choix-pseudo`) — le jeton n'a donc besoin d'aucun stockage à lui pour
// survivre à une inscription confirmée plusieurs jours plus tard.
//
// Rien de privé n'est rendu ici (cf. `lib/book-link-data.ts`) : le flou est
// un décor posé sur des photos déjà publiques.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { proprietaireDuJeton } from '@/lib/book-link';
import { aDejaAccesAuCarnet, getApercuCarnet, MOSAIQUE_TAILLE } from '@/lib/book-link-data';
import { getRecipeDefaultPhoto } from '@/lib/site';
import { connexionHref } from '@/lib/nav';
import { MESSAGE_PARTAGE_CARNET } from '@/lib/social-share';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { MemberAvatar } from '@/components/share/MemberPicker';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ jeton: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { jeton } = await params;
  const ownerId = proprietaireDuJeton(jeton);
  const apercu = ownerId ? await getApercuCarnet(ownerId) : null;
  if (!apercu) return { title: 'Carnet introuvable | Je pâtisse !', robots: { index: false } };
  const description = `${apercu.nom} vous ouvre son carnet de ${libelleRecettes(apercu.nbRecettes)} sur Je pâtisse !`;
  return {
    title: `Carnet de ${apercu.nom} | Je pâtisse !`,
    description,
    // Un lien de partage n'a rien à faire dans un moteur de recherche.
    robots: { index: false, follow: false },
    openGraph: { title: MESSAGE_PARTAGE_CARNET, description, type: 'website', siteName: 'Je pâtisse !', locale: 'fr_FR' },
    twitter: { card: 'summary_large_image', title: MESSAGE_PARTAGE_CARNET, description },
  };
}

function libelleRecettes(n: number): string {
  return `${n} recette${n > 1 ? 's' : ''}`;
}

export default async function CarnetPartagePage({ params }: Props) {
  const { jeton } = await params;
  const ownerId = proprietaireDuJeton(jeton);
  if (!ownerId) notFound();
  const [apercu, user, photoDefaut] = await Promise.all([getApercuCarnet(ownerId), getCurrentUser(), getRecipeDefaultPhoto()]);
  if (!apercu) notFound();

  const estProprietaire = user?.id === ownerId;
  // Déjà déverrouillé (ou partage nominatif préexistant) : l'aperçu n'a plus
  // rien à apprendre au membre, on l'amène directement aux recettes.
  if (user && !estProprietaire && (await aDejaAccesAuCarnet(ownerId, user.id))) redirect('/carnet?scope=shared');

  const destination = `/carnet/partage/${jeton}/deverrouiller`;
  // Mosaïque de fond : les photos publiques du carnet, répétées pour remplir
  // la grille, sinon la photo par défaut du site, sinon des tuiles unies.
  const sources = apercu.photos.length ? apercu.photos : photoDefaut ? [photoDefaut] : [];
  const tuiles = Array.from({ length: MOSAIQUE_TAILLE * 2 }, (_, i) => (sources.length ? sources[i % sources.length] : null));

  return (
    <>
      <Header />
      <main className="relative mx-auto mb-24 max-w-[1200px] overflow-hidden px-margin-mobile md:px-margin-desktop">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid select-none grid-cols-3 gap-3 p-4 md:grid-cols-4">
          {tuiles.map((src, i) =>
            src ? (
              // eslint-disable-next-line @next/next/no-img-element -- photos Swift, hors optimiseur Next
              <img key={i} src={src} alt="" className="aspect-[4/5] w-full rounded-xl object-cover blur-md" />
            ) : (
              <div key={i} className="aspect-[4/5] w-full rounded-xl bg-surface-container-high blur-sm" />
            ),
          )}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-background/55" />

        <section className="relative mx-auto flex min-h-[70vh] max-w-md items-center py-16">
          <div className="flex w-full flex-col items-center gap-5 rounded-2xl border border-outline-variant bg-surface-container-low/95 p-8 text-center shadow-xl backdrop-blur">
            <MemberAvatar member={{ full_name: apercu.nom, avatar_url: apercu.avatarUrl }} size={72} />
            <div className="flex flex-col gap-1">
              <p className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">Carnet partagé</p>
              <h1 className="font-headline-lg text-[26px] font-bold leading-tight text-primary">Carnet de {apercu.nom}</h1>
              <p className="font-body-md text-sm text-on-surface-variant">{libelleRecettes(apercu.nbRecettes)}</p>
            </div>
            <p className="font-body-md text-[15px] italic text-on-surface">« {MESSAGE_PARTAGE_CARNET} »</p>
            <span className="material-symbols-outlined text-[32px] text-primary">lock</span>

            {estProprietaire ? (
              <>
                <p className="font-body-md text-sm text-on-surface-variant">
                  C’est votre carnet : voici ce que voient les personnes à qui vous envoyez ce lien.
                </p>
                <Link href="/carnet" className="rounded-pill border border-outline-variant px-6 py-3 text-[13px] font-semibold text-primary hover:bg-surface-container">
                  Retour à mon carnet
                </Link>
              </>
            ) : user ? (
              <Link
                href={destination}
                prefetch={false}
                className="flex items-center gap-2 rounded-pill bg-primary px-7 py-3.5 text-[13px] font-semibold text-on-primary transition-all hover:shadow-xl active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">lock_open</span> Déverrouiller le carnet
              </Link>
            ) : (
              <>
                <p className="font-body-md text-sm text-on-surface-variant">
                  Créez votre compte gratuit ou connectez-vous pour déverrouiller le carnet : il vous attendra dans « Mon carnet ».
                </p>
                <div className="flex w-full flex-col gap-3">
                  <Link
                    href={`${connexionHref(destination)}&inscription=1`}
                    className="rounded-pill bg-primary px-7 py-3.5 text-[12.5px] font-semibold uppercase tracking-[0.15em] text-on-primary transition-all hover:shadow-xl active:scale-95"
                  >
                    Créer un compte
                  </Link>
                  <Link
                    href={connexionHref(destination)}
                    className="rounded-pill border border-outline-variant px-7 py-3 text-[13px] font-semibold text-primary hover:bg-surface-container"
                  >
                    J’ai déjà un compte
                  </Link>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
