// Boîte à idées — vue création (+ prévention des doublons).
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import { Header } from '@/components/Header';
import { IdeaForm } from '@/components/ideas/IdeaForm';

export const metadata: Metadata = { title: 'Proposer une idée | Maryse Club' };

export default async function NouvelleIdeePage() {
  await requireUser('/idees/nouvelle');
  // Impersonation en lecture seule : la création crée une ligne → interdit,
  // même garde que /creer, /importer, /relecture.
  await requireWritableSession();

  return (
    <>
      <Header current="/idees" />
      <main className="max-w-[640px] mx-auto px-margin-mobile md:px-margin-desktop py-12">
        <Link
          href="/idees"
          className="inline-flex items-center gap-1 text-[13px] text-on-surface-variant hover:text-primary transition-colors mb-6"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Boîte à idées
        </Link>
        <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary mb-2">
          Proposer une idée
        </h1>
        <p className="text-on-surface-variant mb-8">
          Une phrase claire, ça suffit — les autres membres pourront voter.
        </p>

        <IdeaForm />
      </main>
    </>
  );
}
