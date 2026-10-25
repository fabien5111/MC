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
import { adSlotConfig, adSources, type AdSlotConfig, type AdSources, type Ad, type AdSlotKey, type AdsBySlot } from '@/lib/ads-config';

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

  const sources = adSources(ad);
  const inner = sources ? <Visual ad={ad} cfg={cfg} sources={sources} /> : <TextCard ad={ad} cfg={cfg} />;
  const box = `encart-partenaire w-full ${cfg.tone === 'gradient' && !sources ? 'encart-partenaire--decor' : ''} ${
    cfg.tone === 'plain' && !sources ? 'bg-surface-container-low border border-outline-variant/30' : ''
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

// Hauteur plafond, par format : protège la page d'un visuel « ordinateur »
// aux proportions inattendues. Classes écrites en entier, une par seuil, pour
// que Tailwind les trouve.
const PLAFOND: Record<AdSlotConfig['format'], { base: string; md: string; lg: string }> = {
  bandeau_fin: { base: 'max-h-[160px]', md: 'rail:max-h-[160px]', lg: 'lg:max-h-[160px]' },
  bandeau_large: { base: 'max-h-[260px]', md: 'rail:max-h-[260px]', lg: 'lg:max-h-[260px]' },
  pave: { base: 'max-h-[560px]', md: 'rail:max-h-[560px]', lg: 'lg:max-h-[560px]' },
};

// Visuel fourni par l'annonceur, un par appareil (JEP-367), par `<picture>` :
// le navigateur ne télécharge que la source retenue. Seuils de Tailwind
// (`rail` = 701 px, `lg`). Une variante absente vaut le visuel de repli (`adSources`) :
// une source égale à la suivante est simplement omise.
//
// Le plafond de hauteur (`object-cover`, donc recadrage) ne s'applique qu'au
// visuel « ordinateur », y compris quand une tablette ou un téléphone le
// reprennent faute de visuel propre. Un visuel dédié à l'appareil s'affiche
// en entier : il a été fait à ses proportions, le plafonner le rognait (un
// 750 × 400 affiché sur 700 px de large dépassait les 260 px du bandeau).
function Visual({ ad, cfg, sources }: { ad: Ad; cfg: AdSlotConfig; sources: AdSources }) {
  const plafond = PLAFOND[cfg.format];
  const hauteur = [
    sources.mobile === sources.desktop ? plafond.base : 'max-h-none',
    sources.tablet === sources.desktop ? plafond.md : 'rail:max-h-none',
    plafond.lg,
  ].join(' ');
  return (
    <picture>
      {sources.mobile !== sources.desktop && <source media="(max-width: 700px)" srcSet={sources.mobile} />}
      {sources.tablet !== sources.desktop && (
        <source media="(min-width: 701px) and (max-width: 1023px)" srcSet={sources.tablet} />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- visuel déposé sur le stockage objet */}
      <img src={sources.desktop} alt={ad.name} className={`block w-full h-auto ${hauteur} object-cover`} />
    </picture>
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
    <div className="min-h-[160px] flex flex-col rail:flex-row items-center justify-between gap-6 px-8 py-6">
      <div className="flex flex-col gap-1 text-center rail:text-left">
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
