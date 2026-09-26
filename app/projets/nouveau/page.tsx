import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import { canAccess } from '@/lib/entitlements';
import { getEntitlements, checkQuota } from '@/lib/entitlements-data';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { NewProjectStart } from '@/components/projets/NewProjectStart';

export const metadata: Metadata = { title: 'Nouveau projet | Je pâtisse !' };
export const dynamic = 'force-dynamic';

// Étape 1 d'un nouveau projet (JEP-254, point 1) : cette page n'écrit RIEN.
// Le projet n'est créé qu'au passage à l'étape 2 (cf. NewProjectStart), si
// bien qu'ouvrir le mode projet puis renoncer ne laisse plus de projet vide
// dans le carnet.
export default async function NouveauProjetPage() {
  const user = await requireUser('/projets/nouveau');
  // Même garde que /projets/[id] : un projet s'écrit à chaque geste, une
  // session « en tant que » en lecture seule n'y entre pas.
  await requireWritableSession();

  const droits = await getEntitlements(user.id);
  const peutProjet = canAccess(droits, 'mode_projet');
  const peutGenererIA = peutProjet && canAccess(droits, 'mode_projet_ia_mensuel');
  const quotaProjetIA = peutGenererIA ? await checkQuota(user.id, 'mode_projet_ia_mensuel') : null;

  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[900px] px-margin-mobile py-12 md:px-margin-desktop">
        <p className="font-label-md text-label-md uppercase tracking-widest text-secondary">Mode projet</p>
        <h1 className="mb-8 font-headline-lg text-[26px] font-bold leading-tight text-primary md:text-[34px]">
          Nouveau projet
        </h1>
        {peutProjet ? (
          <NewProjectStart peutGenererIA={peutGenererIA} quotaProjetIA={quotaProjetIA} />
        ) : (
          // La route /api/projet refuserait de toute façon (`verifierAcces`) :
          // on le dit avant la saisie plutôt qu'après.
          <p className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
            Le mode projet n’est pas inclus dans votre formule.{' '}
            <Link href="/plans" className="font-semibold text-primary underline">
              Voir les formules
            </Link>
          </p>
        )}
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
