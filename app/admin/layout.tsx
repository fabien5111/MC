// Layout de la console admin : garde d'accès + barre latérale.
//
// La garde laisse entrer l'admin complet ET le gestionnaire (rédaction du
// blog, modération des recettes) ; les écrans réservés à l'admin se referment
// ensuite eux-mêmes avec `requireFullAdmin()` — voir `lib/admin-access.ts`.
import { requireManager, getRole } from '@/lib/auth';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireManager(); // → / si simple membre, → /connexion si non connecté
  const role = await getRole(user.id); // mémoïsé : pas de seconde requête

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <AdminSidebar role={role} />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
