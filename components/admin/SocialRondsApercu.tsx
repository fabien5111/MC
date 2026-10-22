// Aperçu des ronds de l'en-tête (bureau), même cotes que `SocialRondsHeader`
// mais sans lien ni mesure : un clic dans l'administration ne doit ni ouvrir
// un onglet ni compter comme un clic de visiteur.
import { NOM_RESEAU, type ReseauSocial } from '@/lib/social-links';
import { TRACES_RESEAUX } from '@/lib/social-icons';

export function SocialRondsApercu({ liens }: { liens: { network: ReseauSocial }[] }) {
  return (
    <ul className="flex items-center gap-1.5 border-l border-[#d6c2c3] pl-4">
      {liens.map((l) => (
        <li
          key={l.network}
          title={NOM_RESEAU[l.network]}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[#d6c2c3] text-[#300a12]"
        >
          <svg aria-label={NOM_RESEAU[l.network]} role="img" viewBox="0 0 24 24" width={13} height={13} fill="currentColor">
            <path d={TRACES_RESEAUX[l.network]} />
          </svg>
        </li>
      ))}
    </ul>
  );
}
