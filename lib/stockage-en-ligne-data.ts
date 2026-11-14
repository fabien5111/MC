// Stockages en ligne (JEP-408) — configuration et droit, côté serveur.
//
// Les identifiants publics des fournisseurs (identifiant OAuth, clé API
// Google, clé Dropbox) sont lus ICI, à l'exécution, puis transmis par le rendu
// au navigateur — pas de `NEXT_PUBLIC_*` : poser ou changer une clé sur le
// nœud prend effet au redémarrage, sans reconstruction (même choix que les
// clés VAPID). Seul le secret Notion ne quitte jamais le serveur.
import 'server-only';
import { canAccess, type Entitlements } from '@/lib/entitlements';
import { DROIT_STOCKAGE_EN_LIGNE, type ConfigStockage } from '@/lib/stockage-en-ligne';

function env(nom: string): string | null {
  const v = process.env[nom]?.trim();
  return v ? v : null;
}

/** Sources configurées sur ce serveur. Une source incomplète est absente. */
export function configStockage(): ConfigStockage {
  const config: ConfigStockage = {};
  const googleClient = env('GOOGLE_PICKER_CLIENT_ID');
  const googleCle = env('GOOGLE_PICKER_API_KEY');
  const googleApp = env('GOOGLE_PICKER_APP_ID');
  if (googleClient && googleCle && googleApp) {
    config.google = { clientId: googleClient, apiKey: googleCle, appId: googleApp };
  }
  // Google Photos se règle à part (`GOOGLE_PHOTOS_ACTIF`) : son API demande
  // d'être activée dans la console et sa portée validée par Google — Drive
  // peut être en service avant.
  if (googleClient && env('GOOGLE_PHOTOS_ACTIF') === 'true') {
    config.googlePhotos = { clientId: googleClient };
  }
  const dropbox = env('DROPBOX_APP_KEY');
  if (dropbox) config.dropbox = { appKey: dropbox };
  const microsoft = env('MICROSOFT_CLIENT_ID');
  if (microsoft) config.microsoft = { clientId: microsoft };
  const notionClient = env('NOTION_CLIENT_ID');
  if (notionClient && env('NOTION_CLIENT_SECRET')) config.notion = { clientId: notionClient };
  return config;
}

/** Secret Notion (échange du code), ou `null` si Notion n'est pas configuré. */
export function identifiantsNotion(): { clientId: string; secret: string } | null {
  const clientId = env('NOTION_CLIENT_ID');
  const secret = env('NOTION_CLIENT_SECRET');
  return clientId && secret ? { clientId, secret } : null;
}

/** Ce que le fournisseur de contexte reçoit d'une page. */
export type StockageEnLigne = { autorise: boolean; config: ConfigStockage };

export function stockageEnLigne(droits: Entitlements): StockageEnLigne {
  return { autorise: canAccess(droits, DROIT_STOCKAGE_EN_LIGNE), config: configStockage() };
}
