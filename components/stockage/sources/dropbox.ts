// Dropbox (JEP-408, lot 1) — sélecteur officiel « Chooser », côté navigateur.
//
// Aucun jeton : le Chooser rend un lien direct temporaire vers chaque fichier
// choisi, que le navigateur télécharge. Seule la clé d'application (publique)
// est nécessaire, et le domaine du site doit être déclaré dans l'application
// Dropbox (« Chooser / Saver / Embedder domains »).
import { EXTENSIONS_IMAGE, MAX_OCTETS_SOURCE, mimeDepuisNom, type ConfigStockage, type UsageStockage } from '@/lib/stockage-en-ligne';
import { ErreurStockage, chargerScript, fichierDepuisReponse, telecharger, type Selection } from './commun';

type FichierDropbox = { name: string; link: string; bytes: number };
type Dropbox = {
  choose: (o: {
    success: (f: FichierDropbox[]) => void;
    cancel?: () => void;
    linkType: 'direct' | 'preview';
    multiselect: boolean;
    extensions: string[];
    folderselect?: boolean;
    sizeLimit?: number;
  }) => void;
};

const SCRIPT = 'https://www.dropbox.com/static/api/2/dropins.js';

export function prechargerDropbox(config: NonNullable<ConfigStockage['dropbox']>): Promise<void> {
  return chargerScript(SCRIPT, { id: 'dropboxjs', 'data-app-key': config.appKey });
}

export async function choisirDansDropbox(
  config: NonNullable<ConfigStockage['dropbox']>,
  usage: UsageStockage,
  max: number,
  avantTelechargement: () => void,
): Promise<Selection> {
  await prechargerDropbox(config);
  const dbx = (window as unknown as { Dropbox?: Dropbox }).Dropbox;
  if (!dbx) throw new ErreurStockage('Le sélecteur Dropbox est indisponible.');

  const choisis = await new Promise<FichierDropbox[] | null>((resoudre) => {
    dbx.choose({
      success: (f) => resoudre(f),
      cancel: () => resoudre(null),
      linkType: 'direct',
      multiselect: max > 1,
      extensions: usage === 'image' ? EXTENSIONS_IMAGE : ['.pdf'],
      folderselect: false,
      sizeLimit: MAX_OCTETS_SOURCE,
    });
  });
  if (!choisis?.length) return null;
  avantTelechargement();

  const fichiers: File[] = [];
  for (const f of choisis.slice(0, max)) {
    if (f.bytes > MAX_OCTETS_SOURCE) throw new ErreurStockage(`« ${f.name} » dépasse 30 Mo.`);
    fichiers.push(await fichierDepuisReponse(await telecharger(f.link), f.name, mimeDepuisNom(f.name)));
  }
  return { fichiers };
}
