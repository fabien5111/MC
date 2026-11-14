// Notion (JEP-408, lot 3) — côté navigateur.
//
// Connexion par une fenêtre Notion, dans laquelle le membre choisit lui-même
// les pages qu'il partage avec Je pâtisse ! : c'est le « sélecteur » de Notion.
// Le code revient sur `/stockage/retour`, puis le serveur l'échange (le secret
// de l'intégration y est indispensable). Toutes les lectures passent ensuite
// par nos routes, l'API Notion ne répondant pas aux navigateurs ; le jeton
// n'est gardé qu'en mémoire, le temps du choix.
import { CHEMIN_RETOUR_OAUTH } from '@/lib/stockage-en-ligne';
import { aleatoire, attendreRetour, jsonOuErreur, telecharger, type Explorateur } from './commun';

export async function connecterNotion(clientId: string, fenetre: Window): Promise<string | null> {
  const state = aleatoire(16);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    owner: 'user',
    redirect_uri: `${window.location.origin}${CHEMIN_RETOUR_OAUTH}`,
    state,
  });
  fenetre.location.href = `https://api.notion.com/v1/oauth/authorize?${params}`;
  const code = await attendreRetour(fenetre, state);
  if (!code) return null;
  const r = await telecharger('/api/stockage/en-ligne/notion/jeton', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return (await jsonOuErreur<{ jeton: string }>(r, 'Connexion à Notion refusée')).jeton;
}

function dateCourte(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `modifiée le ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

export function explorateurNotion(jeton: string): Explorateur {
  const auth = { Authorization: `Bearer ${jeton}` };
  return {
    racine: 'Pages partagées avec Je pâtisse !',
    recherche: true,
    async lister(_parent, recherche) {
      const r = await telecharger(`/api/stockage/en-ligne/notion/pages?q=${encodeURIComponent(recherche.trim())}`, { headers: auth });
      const { pages } = await jsonOuErreur<{ pages: { id: string; titre: string; modifie: string | null }[] }>(r, 'Notion ne répond pas');
      return pages.map((p) => ({ id: p.id, nom: p.titre, dossier: false, detail: dateCourte(p.modifie) }));
    },
    async recuperer(choisis) {
      const page = choisis[0];
      if (!page) return null;
      const r = await telecharger(`/api/stockage/en-ligne/notion/page?id=${encodeURIComponent(page.id)}`, { headers: auth });
      const { texte, titre } = await jsonOuErreur<{ texte: string; titre: string }>(r, 'Page Notion illisible');
      return { texte, nom: titre };
    },
  };
}
