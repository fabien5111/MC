// Tuto « Mettre une recette en favori et la retrouver dans le carnet »
// (docs/tutos/01-favoris-carnet.md). Scénario de référence de `nouveau-tuto`.
//
// Deux gestes montrés : le cœur de la FICHE recette, puis le cœur de la CARTE
// sur l'accueil — chacun suivi d'une visite de Mon carnet → Favoris.
// Les deux recettes doivent ne PAS être en favori au départ : `preparer` retire
// leur favori hors caméra, le tournage le remet → l'état du compte est inchangé.

export const depart = '/';

// Les deux premières recettes de « Dernières Créations » : la première montrée
// depuis sa fiche, la seconde depuis sa carte. Pas de titre codé en dur — le
// contenu de l'accueil change.
const SECTION = 'Dernières Créations';

export async function preparer(prep) {
  const recettes = (await prep.recettesSection(SECTION)).filter((r) => !/test/i.test(r.titre));
  if (recettes.length < 2) throw new Error(`Moins de deux recettes dans « ${SECTION} »`);
  const [fiche, carte] = recettes;
  // Mémoriser l'état d'origine, puis retirer le favori : le tournage le pose.
  fiche.etaitFavori = await prep.estFavori(fiche.href);
  carte.etaitFavori = await prep.estFavori(carte.href);
  await prep.retirerFavori(fiche.href);
  await prep.retirerFavori(carte.href);
  prep.chrono(`fiche : « ${fiche.titre} », carte : « ${carte.titre} »`);
  return { fiche, carte };
}

// Après le tournage, hors caméra : rendre au compte son état d'origine.
export async function remettre(prep, { fiche, carte }) {
  for (const r of [fiche, carte]) if (!r.etaitFavori) await prep.retirerFavori(r.href);
}

async function carnetFavoris(cam, titre, avantPastille = () => {}) {
  const { page } = cam;
  await cam.cliquer(cam.lienEntete('Mon carnet'));
  await page.waitForURL('**/carnet**');
  await cam.attendrePage();
  await cam.pause(1200);
  avantPastille();
  await cam.cliquer(page.getByRole('link', { name: /Favoris/ }).or(page.getByRole('button', { name: /Favoris/ })).first());
  await page.waitForURL('**scope=fav**').catch(() => {});
  await cam.attendrePage();
  await cam.pause(1200);
  await cam.viser(page.getByText(titre, { exact: false }).first());
}

export async function tourner(cam, { fiche: f, carte: c }) {
  const fiche = f.href;
  const carte = c.href;
  const { page } = cam;

  // 1. Depuis la fiche recette
  // Le haut de l'accueil reste à l'écran le temps de l'accroche (~3,5 s parlées
  // avec le défilement) : sans ça, la phrase 2 arrive avant la fin de la 1.
  cam.phrase('Une recette vous plaît ? Mettez-la en favori…');
  await cam.pause(5000);
  const lienCarte = page.locator(`a[href="${fiche}"]`).first();
  await cam.defiler(lienCarte);
  cam.phrase('Ouvrez la recette, puis cliquez sur le cœur…');
  await cam.cliquer(lienCarte);
  await page.waitForURL(`**${fiche}`);
  await cam.attendrePage();
  await cam.pause(2000);
  const coeur = page.locator('button[aria-label="Ajouter aux favoris"]').first();
  await cam.viser(coeur);
  await cam.pause(600);
  await cam.verifierEcriture('/rest/v1/favorites', () => cam.cliquer(coeur));
  await cam.pause(2000);

  cam.phrase('Elle vous attend dans Mon carnet, rubrique Favoris.');
  await carnetFavoris(cam, f.titre);
  await cam.pause(2500);

  // 2. Autre option : le cœur de la carte, sans ouvrir la recette
  cam.phrase('Encore plus rapide : depuis l\'accueil, le cœur d\'une carte…');
  await cam.cliquer(cam.lienEntete('Accueil'));
  await page.waitForURL(`${cam.base}/`);
  await cam.attendrePage();
  await cam.pause(1200);
  const coeurCarte = page
    .locator(`xpath=//a[@href="${carte}"]/ancestor::*[.//button[@title="Ajouter aux favoris"]][1]//button[@title="Ajouter aux favoris"]`)
    .first();
  await cam.defiler(coeurCarte);
  await cam.viser(coeurCarte);
  await cam.pause(600);
  await cam.verifierEcriture('/rest/v1/favorites', () => cam.cliquer(coeurCarte));
  await cam.pause(2000);

  // Phrase finale au clic sur la pastille, quand la liste va apparaître.
  await carnetFavoris(cam, c.titre, () => cam.phrase('Tous vos coups de cœur, réunis au même endroit.'));
  await cam.pause(3000);
}
