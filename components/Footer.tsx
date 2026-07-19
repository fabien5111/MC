// Pied de page partagé (porté de index.html).
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-surface-container-high w-full py-16 px-margin-mobile md:px-margin-desktop mt-20 border-t border-outline-variant/30">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-12 border-b border-outline-variant/30 pb-12 mb-12">
          <div className="flex flex-col gap-6">
            <Link className="maryse-logo-font text-5xl text-primary leading-none" href="/">
              maryse club
            </Link>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-sm leading-relaxed">
              L&apos;excellence de la pâtisserie française partagée avec passion. Rejoignez notre
              communauté de gourmets et apprenez les techniques des chefs.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-16 gap-y-10">
            <div className="flex flex-col gap-4">
              <h4 className="font-label-md text-label-md text-primary uppercase tracking-widest font-bold">
                Le Club
              </h4>
              <ul className="flex flex-col gap-3 font-body-md text-body-md text-on-surface-variant">
                <li><a className="hover:text-primary transition-colors" href="#">Notre Histoire</a></li>
                <li><Link className="hover:text-primary transition-colors" href="/connexion">Connexion</Link></li>
                <li><a className="hover:text-primary transition-colors" href="#">Contact</a></li>
              </ul>
            </div>
            <div className="flex flex-col gap-4">
              <h4 className="font-label-md text-label-md text-primary uppercase tracking-widest font-bold">
                Légal
              </h4>
              <ul className="flex flex-col gap-3 font-body-md text-body-md text-on-surface-variant">
                <li><a className="hover:text-primary transition-colors" href="#">Conditions</a></li>
                <li><a className="hover:text-primary transition-colors" href="#">Confidentialité</a></li>
              </ul>
            </div>
            <div className="flex flex-col gap-4">
              <h4 className="font-label-md text-label-md text-primary uppercase tracking-widest font-bold">
                Suivre
              </h4>
              <div className="flex gap-6">
                <span className="material-symbols-outlined cursor-pointer hover:text-primary transition-colors">share</span>
                <span className="material-symbols-outlined cursor-pointer hover:text-primary transition-colors">mail</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="font-label-md text-[12px] text-on-tertiary-container italic opacity-70">
            © 2024 Maryse-Club. The Modern Pâtissier.
          </p>
          <div className="flex gap-8">
            <span className="font-label-md text-[12px] text-on-tertiary-container uppercase tracking-widest">
              Fait avec passion à Paris
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
