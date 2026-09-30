'use client';

// Options de partage externe d'une URL (JEP-21) : feuille de partage native,
// réseaux sociaux, Instagram, copie du lien. Utilisé par le bouton
// « Partager Je pâtisse ! » (`ShareSiteButton`) et par le lien de partage du
// carnet (`ShareBookButton`) — même panneau, deux contenus.
//
// `chemin` est un chemin du site (`/carnet/partage/…`) : l'URL absolue est
// reconstruite sur `window.location.origin`, donc sur le domaine par lequel le
// membre est réellement arrivé (`dev` ou `www`) — même raisonnement que
// `lib/redirection.ts`, plutôt que `siteUrl()` figé au build.
import { useEffect, useState } from 'react';
import { RESEAUX, lienReseau, type Reseau } from '@/lib/social-share';

const ICONES: Record<Reseau, string> = {
  facebook: 'thumb_up',
  pinterest: 'push_pin',
  whatsapp: 'chat',
  x: 'tag',
  email: 'mail',
};

export function SocialSharePanel({ chemin, titre, texte }: { chemin: string; titre: string; texte: string }) {
  const [origin, setOrigin] = useState('');
  const [natif, setNatif] = useState(false);
  const [copie, setCopie] = useState(false);
  const [astuceInstagram, setAstuceInstagram] = useState(false);

  // Lu après le montage : `window` n'existe pas au rendu serveur, et le lire
  // pendant le rendu désynchroniserait l'hydratation.
  useEffect(() => {
    setOrigin(window.location.origin);
    setNatif(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const url = origin ? `${origin}${chemin}` : chemin;
  const contenu = { url, texte, titre, image: origin ? `${origin}${chemin.replace(/\/$/, '')}/opengraph-image` : undefined };

  async function partageNatif(): Promise<boolean> {
    try {
      await navigator.share({ title: titre, text: texte, url });
      return true;
    } catch (e) {
      // Annulation par l'utilisateur : rien à faire, ce n'est pas un échec.
      return (e as Error)?.name === 'AbortError';
    }
  }

  async function copier(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
      return true;
    } catch {
      return false;
    }
  }

  // Instagram : feuille native s'il y en a une (Instagram y figure quand
  // l'application est installée), sinon copie du lien + mode d'emploi — il
  // n'existe aucune URL de partage Instagram (cf. lib/social-share.ts).
  async function instagram() {
    if (natif && (await partageNatif())) return;
    await copier();
    setAstuceInstagram(true);
  }

  const bouton =
    'flex flex-col items-center gap-1.5 rounded-lg border border-outline-variant px-2 py-3 text-[12px] font-semibold text-primary transition-colors hover:bg-surface-container';

  return (
    <div className="flex flex-col gap-4">
      {natif && (
        <button
          type="button"
          onClick={partageNatif}
          className="flex items-center justify-center gap-2 rounded-pill bg-primary px-5 py-3 text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">ios_share</span> Partager via…
        </button>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {RESEAUX.map((r) => (
          <a key={r.id} href={lienReseau(r.id, contenu)} target="_blank" rel="noopener noreferrer" className={bouton}>
            <span className="material-symbols-outlined text-[20px]">{ICONES[r.id]}</span>
            {r.label}
          </a>
        ))}
        <button type="button" onClick={instagram} className={bouton}>
          <span className="material-symbols-outlined text-[20px]">photo_camera</span>
          Instagram
        </button>
      </div>
      {astuceInstagram && (
        <p className="font-body-md text-[12px] text-on-surface-variant italic">
          Lien copié : collez-le dans une story Instagram (sticker « Lien ») ou dans votre bio.
        </p>
      )}

      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="Lien de partage"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 font-body-md text-[13px] text-on-surface"
        />
        <button
          type="button"
          onClick={copier}
          className="flex shrink-0 items-center gap-1.5 rounded-pill border border-outline-variant px-4 py-2 text-[13px] font-semibold text-primary transition-colors hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[18px]">{copie ? 'check' : 'content_copy'}</span>
          {copie ? 'Copié' : 'Copier'}
        </button>
      </div>
    </div>
  );
}
