import type { Metadata } from 'next';
import { getSiteSettings } from '@/lib/site';
import { BannerManager } from '@/components/admin/BannerManager';

export const metadata: Metadata = { title: 'Photos du site | Admin — Maryse Club' };

export default async function AdminPhotosPage() {
  const banners = await getSiteSettings([
    'banner_home_web',
    'banner_home_tablette',
    'banner_home_mobile',
  ]);

  return (
    <>
      <header className="flex items-center h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Photos du site</span>
      </header>
      <main className="flex-1 overflow-y-auto p-gutter lg:px-margin-desktop lg:py-12 bg-surface">
        <section className="mb-12 max-w-4xl">
          <h2 className="font-headline-md text-primary mb-2">Bannière de la page d&apos;accueil</h2>
          <p className="text-on-surface-variant mb-8">
            Une photo par appareil. L&apos;image est recadrée automatiquement : gardez le sujet au
            centre. Sans photo pour un appareil, la version web est utilisée.
          </p>
          <BannerManager initial={banners} />
        </section>
      </main>
    </>
  );
}
