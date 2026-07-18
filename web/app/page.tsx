export default function HomePage() {
  return (
    <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-16">
      <p className="maryse-logo-font text-5xl text-primary mb-4">maryse club</p>
      <h1 className="font-headline-lg text-headline-lg text-primary mb-4">
        Socle Next.js opérationnel
      </h1>
      <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
        Fondation de la migration (Next.js App Router + TypeScript + Tailwind).
        Le design system, le client Supabase (auth par cookies) et les routes IA
        (<code>/api/import-url</code>, <code>/api/scale-recipe</code>) sont en
        place. Les pages sont portées progressivement depuis le site vanilla.
      </p>
    </main>
  );
}
