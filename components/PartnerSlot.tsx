// Rendu public d'un encart partenaire (publicité).
//
// Nommage neutre volontaire (`PartnerSlot`, classe CSS `encart-partenaire`) :
// les bloqueurs de publicité filtrent sur des sélecteurs contenant « ad » ou
// « pub » et masqueraient une régie maison — cf. lib/ads-config.ts.
//
// Composant serveur : la liste des campagnes est fournie par la page (une
// seule requête pour tous ses emplacements), et l'état « administrateur » est
// résolu ici, sans le faire descendre en props de page en page — getCurrentUser
// et isAdmin sont mémoïsés par requête (React cache).
import Link from 'next/link';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { canAccess } from '@/lib/entitlements';
import { getEntitlements } from '@/lib/entitlements-data';
import { PartnerLink } from '@/components/PartnerLink';
import { adSlotConfig, type AdSlotConfig, type Ad, type AdSlotKey, type AdsBySlot } from '@/lib/ads-config';

export async function PartnerSlot({
  slot,
  ads,
  index = 0,
  className,
}: {
  slot: AdSlotKey;
  ads: AdsBySlot;
  /** Rang du bandeau quand l'emplacement est rendu plusieurs fois sur la même
   *  page (résultats de recherche) : chaque bandeau prend la campagne suivante,
   *  de façon déterministe. */
  index?: number;
  className?: string;
}) {
  const cfg = adSlotConfig(slot);
  if (!cfg) return null;

  const list = ads[slot] ?? [];
  const ad = list.length > 0 ? list[index % list.length] : null;

  // Emplacement sans campagne : rien pour les visiteurs (la section disparaît
  // au lieu de laisser un bloc vide), un repère pour les administrateurs.
  if (!ad) return <EmptySlot cfg={cfg} className={className} />;

  // `navigation_sans_pub` (§4 « Page d'accueil ») : les emplacements HORS
  // accueil disparaissent pour qui a ce droit. `home_top` / `home_mid`
  // restent affichés à tout le monde — `pub_accueil` n'est gouverné par
  // aucun plan (cf. docs/abonnements.md, écarts de grille). Un visiteur
  // déconnecté n'a pas de droits à vérifier : il voit les encarts, comme un
  // membre FREE.
  if (slot !== 'home_top' && slot !== 'home_mid') {
    const user = await getCurrentUser();
    if (user && canAccess(await getEntitlements(user.id), 'navigation_sans_pub')) return null;
  }

  const inner = ad.image_url ? <Visual ad={ad} cfg={cfg} /> : <TextCard ad={ad} cfg={cfg} />;
  const box = `encart-partenaire w-full ${cfg.tone === 'gradient' && !ad.image_url ? 'encart-partenaire--decor' : ''} ${
    cfg.tone === 'plain' && !ad.image_url ? 'bg-surface-container-low border border-outline-variant/30' : ''
  }`;

  return (
    <div className={`no-print ${className ?? ''}`}>
      <Mention />
      <PartnerLink adId={ad.id} href={ad.link_url} className={`${box} group`}>
        {inner}
      </PartnerLink>
    </div>
  );
}

// Mention systématique, y compris sur un encart illustré : un contenu
// commercial doit rester identifiable comme tel.
function Mention() {
  return (
    <span className="block font-label-md text-[10px] uppercase tracking-[0.2em] text-outline mb-1.5">
      Publicité
    </span>
  );
}

const VISUAL_MAX_HEIGHT: Record<AdSlotConfig['format'], string> = {
  bandeau_fin: 'max-h-[160px]',
  bandeau_large: 'max-h-[260px]',
  pave: 'max-h-[560px]',
};

// Visuel fourni par l'annonceur. `object-cover` sous une hauteur plafond : une
// image aux proportions inattendues est recadrée plutôt que d'étirer la page.
function Visual({ ad, cfg }: { ad: Ad; cfg: AdSlotConfig }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data-URL stockée en base
    <img
      src={ad.image_url as string}
      alt={ad.name}
      className={`w-full h-auto ${VISUAL_MAX_HEIGHT[cfg.format]} object-cover`}
    />
  );
}

const CTA = 'whitespace-nowrap border border-primary px-8 py-3 font-label-md text-label-md text-primary uppercase tracking-widest transition-all group-hover:bg-primary group-hover:text-on-primary';

// Repli sans visuel : reprend le dessin des encarts déjà en place dans les
// pages, pour qu'une campagne purement textuelle reste présentable.
function TextCard({ ad, cfg }: { ad: Ad; cfg: AdSlotConfig }) {
  if (cfg.format === 'bandeau_fin') {
    return (
      <div className="min-h-[120px] flex flex-col items-center justify-center gap-1 px-6 py-6 text-center">
        {ad.title && <h3 className="font-headline-md text-headline-md text-primary">{ad.title}</h3>}
        {ad.subtitle && <p className="text-secondary italic">{ad.subtitle}</p>}
      </div>
    );
  }

  if (cfg.format === 'pave') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-8 py-20 text-center">
        {ad.title && <p className="font-headline-md text-headline-md text-primary">{ad.title}</p>}
        {ad.subtitle && <p className="text-secondary italic">{ad.subtitle}</p>}
        {ad.cta_label && <span className={`${CTA} mt-2`}>{ad.cta_label}</span>}
      </div>
    );
  }

  return (
    <div className="min-h-[160px] flex flex-col md:flex-row items-center justify-between gap-6 px-8 py-6">
      <div className="flex flex-col gap-1 text-center md:text-left">
        {ad.title && <h3 className="font-headline-md text-headline-md text-primary">{ad.title}</h3>}
        {ad.subtitle && <p className="text-secondary italic">{ad.subtitle}</p>}
      </div>
      {ad.cta_label && <span className={CTA}>{ad.cta_label}</span>}
    </div>
  );
}

async function EmptySlot({ cfg, className }: { cfg: AdSlotConfig; className?: string }) {
  const user = await getCurrentUser();
  if (!user || !(await isAdmin(user.id))) return null;

  return (
    <div className={`no-print ${className ?? ''}`}>
      <div className="encart-partenaire encart-partenaire--decor flex flex-col items-center justify-center gap-1.5 px-6 py-8 text-center">
        <span className="material-symbols-outlined text-2xl text-outline">campaign</span>
        <span className="font-label-md text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">
          Emplacement libre — {cfg.label}
        </span>
        <Link href="/admin/partenaires" className="text-[11px] text-primary underline underline-offset-2">
          Programmer une campagne
        </Link>
        <span className="text-[10px] text-outline">Visible uniquement par les administrateurs.</span>
      </div>
    </div>
  );
}
