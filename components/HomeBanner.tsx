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

  // Cadre imposé (2,5:1 et hauteur minimale, image recadrée) seulement là où
  // l'appareil affiche la bannière « web » : sur un écran étroit, elle serait
  // sinon une bande de 150 px. Une bannière tablette ou mobile propre a été
  // faite à ses proportions et s'affiche entière, à sa hauteur naturelle —
  // le cadre unique la rognait (une 1500 × 760 dans 744 × 520 perdait ses
  // côtés, une image carrée son haut et son bas).
  const cadre = [
    mobile ? '' : 'aspect-[2.5/1] min-h-[420px]',
    tablette ? 'md:aspect-auto md:min-h-0' : 'md:aspect-[2.5/1] md:min-h-[520px]',
    'lg:aspect-[2.5/1] lg:min-h-[520px]',
  ].join(' ');
  // L'image remplit le cadre imposé, ou garde sa hauteur naturelle sans lui.
  const hauteurImage = [
    mobile ? 'h-auto' : 'h-full',
    tablette ? 'md:h-auto' : 'md:h-full',
    'lg:h-full',
  ].join(' ');

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
      <div className={`relative w-full overflow-hidden ${cadre}`} style={{ maxWidth: 1983, margin: '0 auto' }}>
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
            className={`block w-full ${hauteurImage} object-cover`}
          />
        </picture>
      </div>
    </section>
  );
}
