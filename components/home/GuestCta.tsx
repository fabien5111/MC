import Link from 'next/link';

// Invitation finale de l'accueil (visiteur uniquement) — dernière chose vue
// avant le pied de page, après que la recette de la semaine et les dernières
// créations ont montré le produit en pratique.
export function GuestCta() {
  return (
    <section className="mt-20 mb-16">
      <div className="bg-primary text-on-primary rounded-xl px-8 py-14 text-center">
        <h2 className="font-headline-lg text-[28px] md:text-[34px] font-bold leading-tight mb-4">
          Ouvrez votre carnet
        </h2>
        <p className="text-[16px] opacity-90 mb-8 max-w-[52ch] mx-auto leading-relaxed">
          Créez vos recettes, adaptez-les à vos moules, planifiez vos préparations. Gratuit, et vos recettes
          restent privées si vous le souhaitez.
        </p>
        <Link
          href="/connexion?inscription=1"
          className="inline-block bg-white text-primary px-10 py-4 rounded-full text-[12.5px] font-semibold uppercase tracking-[0.15em] hover:shadow-xl transition-all active:scale-95"
        >
          Créer un compte
        </Link>
      </div>
    </section>
  );
}
