'use client';

// Contenu du tiroir Compte — un seul jeu d'entrées, deux contenants : un
// panneau sous l'avatar au bureau (`AccountMenuButton`), une feuille remontante
// depuis la cinquième fente de la barre basse (`AccountSheetButton`). Le geste
// change, la liste ne change pas ; l'écrire deux fois, c'est se garantir qu'un
// jour l'une des deux aura une entrée que l'autre n'a pas.
//
// Deux entrées des maquettes sont volontairement absentes : **Messagerie** et
// **Aide** n'ont pas d'écran. Une entrée grisée « bientôt » est du décor : elle
// occupe une place, se fait cliquer, et n'apprend rien. Elles reviendront avec
// leur destination.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export type AccountMenuData = {
  name: string;
  avatarUrl: string | null;
  // Admin complet OU gestionnaire (cf. lib/auth.ts `isManager()`) : les deux
  // ont un lien « Administration », vers un `/admin` dont le périmètre réel
  // se referme lui-même par écran (lib/admin-access.ts).
  isManager: boolean;
  // Nom d'utilisateur choisi, ou identifiant de compte à défaut — c'est ce qui
  // rend l'en-tête du tiroir cliquable vers `/u/[handle]`. `null` seulement si
  // aucun des deux n'est disponible, ce qui ne devrait pas arriver pour un
  // utilisateur connecté (repli sur l'id dans les deux chromes).
  handle: string | null;
};

// Classe commune des entrées, pour que le clavier et la souris parcourent
// exactement la même liste (cf. `[role="menuitem"]` dans les deux contenants).
const ITEM =
  'flex w-full items-center gap-3 px-4 py-2.5 text-left font-body-md text-sm text-on-surface hover:bg-surface-container-low transition-colors';

export function AccountMenuItems({
  data,
  onNavigate,
}: {
  data: AccountMenuData;
  // Appelé à chaque activation d'une entrée : le contenant se referme.
  onNavigate: () => void;
}) {
  const router = useRouter();

  async function signOut() {
    onNavigate();
    await createClient().auth.signOut();
    router.replace('/');
    router.refresh();
  }

  return (
    <>
      {/* En-tête : avatar + nom, désormais un lien vers le profil public
          (`/u/[handle]`) — la route existe depuis le lot « abonnements ». */}
      {data.handle ? (
        <Link
          href={`/u/${data.handle}`}
          role="menuitem"
          onClick={onNavigate}
          className="flex items-center gap-3 border-b border-outline-variant/60 px-4 py-3.5 hover:bg-surface-container-low transition-colors"
        >
          <span className="block h-10 w-10 shrink-0 overflow-hidden rounded-pill bg-surface-container">
            {data.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
              <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="material-symbols-outlined flex h-full w-full items-center justify-center text-[22px] text-on-surface-variant">
                person
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-label-md text-sm text-primary">{data.name}</span>
            <span className="block font-body-md text-xs text-on-surface-variant">Voir mon profil public</span>
          </span>
        </Link>
      ) : (
        <div className="flex items-center gap-3 border-b border-outline-variant/60 px-4 py-3.5">
          <span className="block h-10 w-10 shrink-0 overflow-hidden rounded-pill bg-surface-container">
            {data.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
              <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="material-symbols-outlined flex h-full w-full items-center justify-center text-[22px] text-on-surface-variant">
                person
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-label-md text-sm text-primary">{data.name}</span>
            <span className="block font-body-md text-xs text-on-surface-variant">Mon compte</span>
          </span>
        </div>
      )}

      <div className="py-1.5">
        <Link href="/carnet" role="menuitem" onClick={onNavigate} className={ITEM}>
          <span className="material-symbols-outlined text-[20px] text-outline">menu_book</span> Mon carnet
        </Link>
        <Link href="/reglages" role="menuitem" prefetch={false} onClick={onNavigate} className={ITEM}>
          <span className="material-symbols-outlined text-[20px] text-outline">settings</span> Réglages du compte
        </Link>
        {data.isManager && (
          <Link href="/admin" role="menuitem" prefetch={false} onClick={onNavigate} className={ITEM}>
            <span className="material-symbols-outlined text-[20px] text-outline">admin_panel_settings</span>{' '}
            Administration
          </Link>
        )}
      </div>

      <div className="border-t border-outline-variant/60 py-1.5">
        <button type="button" role="menuitem" onClick={signOut} className={`${ITEM} text-on-surface-variant`}>
          <span className="material-symbols-outlined text-[20px] text-outline">logout</span> Se déconnecter
        </button>
      </div>
    </>
  );
}
