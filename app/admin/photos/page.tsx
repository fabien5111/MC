import type { Metadata } from 'next';
import { requireFullAdmin } from '@/lib/auth';
import { getSiteSettings } from '@/lib/site';
import { BannerManager } from '@/components/admin/BannerManager';
import { RecipeDefaultPhotoManager } from '@/components/admin/RecipeDefaultPhotoManager';
import { RecipeImageBackfill } from '@/components/admin/RecipeImageBackfill';

export const metadata: Metadata = { title: 'Photos du site | Admin — Je pâtisse !' };

export default async function AdminPhotosPage() {
  await requireFullAdmin(); // paramètres du site : admin complet
  const settings = await getSiteSettings([
    'banner_home_web',
    'banner_home_tablette',
    'banner_home_mobile',
    'recipe_default_photo',
  ]);

  return (
    <>
      <header className="flex items-center h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Photos du site</span>
      </header>
      <main className="flex-1 overflow-y-auto p-gutter lg:px-margin-desktop lg:py-12 bg-surface">
        <section className="mb-12 max-w-4xl">
          <h2 className="font-headline-md text-primary mb-2">Bannière de la page d&apos;accueil</h2>
          <p className="text-on-surface-variant mb-8">
            Une photo par appareil. L&apos;image est recadrée automatiquement : gardez le sujet au
            centre. Sans photo pour un appareil, la version web est utilisée.
          </p>
          <BannerManager initial={settings} />
        </section>
        <section className="mb-12 max-w-4xl">
          <h2 className="font-headline-md text-primary mb-2">Photo par défaut des cartes recette</h2>
          <p className="text-on-surface-variant mb-8">
            Affichée à la place du pictogramme sur les cartes recette (accueil, recherche, carnet,
            profils, suggestions) quand l&apos;auteur n&apos;a pas ajouté de photo.
          </p>
          <RecipeDefaultPhotoManager initialUrl={settings.recipe_default_photo || null} />
        </section>
        <section className="mb-12 max-w-4xl">
          <RecipeImageBackfill
            column="hero_thumb_url"
            maxWidth={96}
            title="Miniatures des fournées"
            description="Génère la miniature des recettes créées avant son ajout, pour qu'elles affichent une vignette dans les listes de fournées de l'écran « En cuisine » au lieu de l'icône par défaut. Les recettes créées ou modifiées depuis en ont déjà une — relancer ne les retouche pas."
          />
        </section>
        <section className="mb-12 max-w-4xl">
          <RecipeImageBackfill
            column="hero_card_url"
            maxWidth={480}
            quality={0.7}
            title="Vignettes des cartes recette"
            description="Génère la vignette des recettes créées avant son ajout, pour les cartes recette de l'accueil, la recherche, le carnet, les profils et les suggestions, au lieu de transporter la photo en pleine définition. Les recettes créées ou modifiées depuis en ont déjà une — relancer ne les retouche pas."
          />
        </section>
      </main>
    </>
  );
}
