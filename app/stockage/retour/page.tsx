import type { Metadata } from 'next';
import { RetourConnexion } from '@/components/stockage/RetourConnexion';

// Page de retour des connexions ouvertes dans une fenêtre (Microsoft, Notion —
// JEP-408). Elle ne fait que rendre le code de connexion à la page qui a
// ouvert la fenêtre, puis se ferme. Aucun jeton n'est échangé ni gardé ici.
// Adresse à déclarer chez Microsoft (application monopage) et chez Notion :
// `https://<domaine>/stockage/retour`.
export const metadata: Metadata = { title: 'Connexion | Je pâtisse !', robots: { index: false, follow: false } };

export default function RetourStockagePage() {
  return <RetourConnexion />;
}
