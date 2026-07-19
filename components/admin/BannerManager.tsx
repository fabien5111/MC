'use client';

// Gestion des bannières d'accueil par appareil (porté de admin-photos.html).
// Upload → compression data-URL → enregistrement dans site_settings.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resizeImageToDataUrl } from '@/lib/images';

type Device = 'web' | 'tablette' | 'mobile';

const BANNERS: { device: Device; label: string; size: string; aspect: string; max: number }[] = [
  { device: 'web', label: 'Web (ordinateur)', size: '2000 × 800 px', aspect: 'aspect-[2.5/1]', max: 2000 },
  { device: 'tablette', label: 'Tablette', size: '1500 × 760 px', aspect: 'aspect-[2/1]', max: 1500 },
  { device: 'mobile', label: 'Mobile', size: '900 × 900 px (sujet centré)', aspect: 'aspect-square', max: 900 },
];

const key = (d: Device) => `banner_home_${d}`;

export function BannerManager({ initial }: { initial: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-10">
      {BANNERS.map((b) => (
        <BannerCard key={b.device} config={b} initialUrl={initial[key(b.device)] || null} />
      ))}
    </div>
  );
}

function BannerCard({
  config,
  initialUrl,
}: {
  config: (typeof BANNERS)[number];
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    setStatus('Enregistrement…');
    try {
      const dataUrl = await resizeImageToDataUrl(file, config.max);
      const supabase = createClient();
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: key(config.device), value: dataUrl });
      if (error) throw error;
      setUrl(dataUrl);
      setStatus('Bannière enregistrée ✓');
    } catch (e) {
      setStatus('');
      alert('Erreur lors de l’enregistrement : ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-8 ambient-shadow">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-headline-md text-xl text-primary">{config.label}</h3>
        <span className="text-xs font-label-md text-on-surface-variant">Taille idéale : {config.size}</span>
      </div>
      <div
        className={`${config.aspect} max-w-xl bg-surface-container rounded-lg overflow-hidden border border-outline-variant mb-4 flex items-center justify-center`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL
          <img src={url} alt={`Bannière ${config.label}`} className="w-full h-full object-cover" />
        ) : (
          <span className="material-symbols-outlined text-5xl text-on-surface-variant">imagesmode</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <label className="bg-primary text-on-primary px-6 py-2.5 rounded-full font-label-md text-label-md flex items-center gap-2 hover:opacity-90 transition-all active:scale-95 cursor-pointer">
          <span className="material-symbols-outlined text-[18px]">photo_camera</span> Choisir une photo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />
        </label>
        <span className="text-sm text-on-surface-variant">{status}</span>
      </div>
    </div>
  );
}
