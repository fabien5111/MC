// Layout de la console admin : garde d'accès (admin uniquement) + barre latérale.
// Protège toutes les routes /admin/*.
import { requireAdmin } from '@/lib/auth';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin(); // redirige vers / si non admin, vers /connexion si non connecté

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
