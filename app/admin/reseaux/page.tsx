import type { Metadata } from 'next';
import Link from 'next/link';
import { requireFullAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RESEAUX, type LienSocial } from '@/lib/social-links';
import { SocialLinksManager } from '@/components/admin/SocialLinksManager';

export const metadata: Metadata = { title: 'Réseaux sociaux | Admin — Je pâtisse !' };

export default async function AdminSocialLinksPage() {
  await requireFullAdmin(); // l'en-tête du site : admin complet (pas le gestionnaire)

  // Lecture directe sous la session, jamais le cache du site : un écran
  // d'administration ne doit pas montrer une valeur périmée (cf. `getSiteSettings`).
  const supabase = await createClient();
  const { data, error } = await (supabase.from('social_links' as never) as unknown as {
    select: (c: string) => Promise<{ data: LienSocial[] | null; error: { message: string } | null }>;
  }).select('network, url, is_visible');

  const parReseau = new Map((data ?? []).map((l) => [l.network, l]));
  const lignes: LienSocial[] = RESEAUX.map((r) => parReseau.get(r) ?? { network: r, url: null, is_visible: true });

  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Réseaux sociaux</span>
        <Link href="/admin" className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Tableau de bord
        </Link>
      </header>
      <SocialLinksManager
        initial={lignes}
        tableAbsente={Boolean(error) || (data ?? []).length === 0}
      />
    </>
  );
}
