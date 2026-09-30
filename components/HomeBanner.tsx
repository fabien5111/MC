// Bannière d'accueil : une image par appareil (porté de loadBanner() du db.js).
// Résolue en CSS pur (<picture>/media queries) plutôt qu'en JS sur
// window.innerWidth : ce dernier n'est connu qu'après hydratation et affichait
// donc la bannière desktop pendant quelques instants sur mobile.
export function HomeBanner({
  web,
  tablette,
  mobile,
  fallback,
}: {
  web?: string;
  tablette?: string;
  mobile?: string;
  fallback: string;
}) {
  const webSrc = web || fallback;
  const tabletteSrc = tablette || web || fallback;
  const mobileSrc = mobile || web || fallback;

  return (
    <section className="relative w-full">
      {/* Précharge la variante réellement affichée à chaque taille d'écran —
          c'est l'élément LCP de l'accueil (audit PageSpeed du 28/09/2026,
          LCP mobile 11,7 s / « Détection de la requête LCP »). Sans ça, le
          navigateur ne découvre cette image qu'en parsant le CSS de la mise
          en page, bien après le premier octet HTML. Next/React hoistent ces
          `<link>` dans le `<head>` où qu'ils soient rendus dans l'arbre. Les
          plages `media` reproduisent celles du `<picture>` ci-dessous (ordre
          « premier vrai » : web dès 1024px, sinon tablette dès 768px). */}
      <link rel="preload" as="image" href={webSrc} media="(min-width: 1024px)" fetchPriority="high" />
      <link
        rel="preload"
        as="image"
        href={tabletteSrc}
        media="(min-width: 768px) and (max-width: 1023px)"
        fetchPriority="high"
      />
      <link rel="preload" as="image" href={mobileSrc} media="(max-width: 767px)" fetchPriority="high" />
      <div
        className="relative w-full aspect-[2.5/1] min-h-[420px] md:min-h-[520px] overflow-hidden"
        style={{ maxWidth: 1983, margin: '0 auto' }}
      >
        <picture>
          <source media="(min-width: 1024px)" srcSet={webSrc} />
          <source media="(min-width: 768px)" srcSet={tabletteSrc} />
          {/* eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin */}
          <img
            src={mobileSrc}
            alt="Bannière Je pâtisse !"
            fetchPriority="high"
            width={1983}
            height={793}
            className="w-full h-full object-cover"
          />
        </picture>
      </div>
    </section>
  );
}
