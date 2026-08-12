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
  return (
    <section className="relative w-full">
      <div
        className="relative w-full aspect-[2.5/1] min-h-[420px] md:min-h-[520px] overflow-hidden"
        style={{ maxWidth: 1983, margin: '0 auto' }}
      >
        <picture>
          <source media="(min-width: 1024px)" srcSet={web || fallback} />
          <source media="(min-width: 768px)" srcSet={tablette || web || fallback} />
          {/* eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin */}
          <img
            src={mobile || web || fallback}
            alt="Bannière Je pâtisse !"
            className="w-full h-full object-cover"
          />
        </picture>
      </div>
    </section>
  );
}
