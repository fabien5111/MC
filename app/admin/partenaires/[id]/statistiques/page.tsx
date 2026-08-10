// Statistiques d'une campagne : affichages, clics, et taux de clic par
// segment (connecté / non connecté) sur une période choisie.
import type { Metadata } from 'next';
import Link from 'next/link';
import { getAdAdmin, getAdStats } from '@/lib/ads';
import { adSlotConfig, ctrLabel } from '@/lib/ads-config';
import { AdStatsDateRange } from '@/components/admin/AdStatsDateRange';

export const metadata: Metadata = { title: 'Statistiques publicité | Admin — Je pâtisse !' };

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default async function AdStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const from = sp.from || isoDaysAgo(29);
  const to = sp.to || new Date().toISOString().slice(0, 10);

  const adId = Number(id);
  const ad = Number.isFinite(adId) ? await getAdAdmin(adId) : null;

  if (!ad) {
    return (
      <>
        <header className="flex items-center h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
          <span className="font-headline-md text-2xl text-primary">Statistiques</span>
        </header>
        <main className="p-margin-desktop">
          <p className="text-on-surface-variant">Publicité introuvable.</p>
          <Link href="/admin/partenaires" className="text-primary underline underline-offset-2 text-sm mt-4 inline-block">
            Retour aux publicités
          </Link>
        </main>
      </>
    );
  }

  const stats = await getAdStats(ad.id, from, to);
  const cfg = adSlotConfig(ad.slot);

  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <div className="min-w-0">
          <span className="font-headline-md text-2xl text-primary truncate block">{ad.name}</span>
          <p className="text-xs text-on-surface-variant">{cfg?.label ?? ad.slot}</p>
        </div>
        <Link
          href="/admin/partenaires"
          className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span> Publicités
        </Link>
      </header>

      <main className="p-margin-desktop max-w-4xl">
        <AdStatsDateRange from={from} to={to} />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <StatTile label="Affichages" value={stats.impressions.toLocaleString('fr-FR')} />
          <StatTile
            label="Clics"
            value={stats.clicks.toLocaleString('fr-FR')}
            sub={`Taux de clic global : ${ctrLabel(stats.clicks, stats.impressions)}`}
          />
          <StatTile
            label="Affichages connectés / non connectés"
            value={`${stats.impressionsLoggedIn.toLocaleString('fr-FR')} / ${stats.impressionsAnonymous.toLocaleString('fr-FR')}`}
          />
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-8">
          <h3 className="font-headline-md text-lg font-semibold mb-1">Taux de clic par segment</h3>
          <p className="text-xs text-on-surface-variant mb-6">
            Part des affichages transformés en clic, pour les visiteurs connectés et non connectés séparément — plus
            juste qu&apos;une simple répartition des clics quand les deux publics n&apos;ont pas le même volume d&apos;affichages.
          </p>
          <div className="grid grid-cols-2 gap-6">
            <SegmentTile label="Connectés" clicks={stats.clicksLoggedIn} impressions={stats.impressionsLoggedIn} />
            <SegmentTile label="Non connectés" clicks={stats.clicksAnonymous} impressions={stats.impressionsAnonymous} />
          </div>
        </div>
      </main>
    </>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6">
      <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{label}</span>
      <p className="font-headline-md text-3xl text-primary mt-1">{value}</p>
      {sub && <p className="text-[11px] text-on-surface-variant mt-1">{sub}</p>}
    </div>
  );
}

function SegmentTile({ label, clicks, impressions }: { label: string; clicks: number; impressions: number }) {
  return (
    <div className="border border-outline-variant rounded-lg p-5 text-center">
      <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{label}</span>
      <p className="font-headline-md text-2xl text-primary mt-1">{ctrLabel(clicks, impressions)}</p>
      <p className="text-[11px] text-on-surface-variant mt-1">
        {clicks} clic{clicks > 1 ? 's' : ''} sur {impressions} affichage{impressions > 1 ? 's' : ''}
      </p>
    </div>
  );
}
