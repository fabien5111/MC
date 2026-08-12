// Bloc visiteur de l'accueil, à la même place que le carrousel de sessions
// d'un membre — les deux occupent le même emplacement, jamais ensemble
// (cf. README Écran 1). Dit ce qu'est le produit en trois points, avant que
// la recette de la semaine et la recherche ne le montrent en pratique.
export function GuestIntro() {
  return (
    <section className="pt-6 mb-20">
      <div className="text-center max-w-[62ch] mx-auto">
        <p className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline mb-4">
          Je pâtisse !
        </p>
        <h2 className="font-headline-lg text-[30px] md:text-[38px] font-bold leading-tight text-primary mb-5">
          Vos recettes s&apos;adaptent enfin à votre cuisine
        </h2>
        <p className="text-[16px] leading-relaxed text-on-surface-variant">
          Changez de moule, doublez les quantités, remplacez un ingrédient : les proportions suivent. Planifiez vos
          préparations sur plusieurs jours et gardez la trace de chaque essai.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
        {POINTS.map((p) => (
          <div key={p.title} className="text-center px-4">
            <span className="material-symbols-outlined text-primary text-[32px] mb-3">{p.icon}</span>
            <h3 className="font-headline-md text-[19px] text-primary mb-2">{p.title}</h3>
            <p className="text-[14px] text-on-surface-variant leading-relaxed">{p.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const POINTS = [
  {
    icon: 'resize',
    title: 'Adapter',
    text: 'Un cercle de 20 cm au lieu de 24 ? Les quantités se recalculent selon la surface et le volume.',
  },
  {
    icon: 'event_note',
    title: 'Planifier',
    text: 'Une pâte la veille, le montage le jour J. Le planning se déroule en dates réelles.',
  },
  {
    icon: 'history_edu',
    title: 'Se souvenir',
    text: "Vos commentaires d'une fois sur l'autre, pour ne pas refaire la même erreur.",
  },
];
