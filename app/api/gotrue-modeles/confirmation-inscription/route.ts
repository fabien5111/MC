// Modèle d'e-mail GoTrue « confirmation-inscription » (JEP-276) : contenu et liens dans
// `lib/gotrue-modeles.ts`. Lu par GoTrue (nœud 216114) à l'envoi, via
// `GOTRUE_MAILER_TEMPLATES_*` — cf. DEPLOY.md § « Modèles d'e-mails GoTrue ».
// Dynamique : la photo de signature (JEP-378) est relue à chaque appel.
import { photoSignatureEmail } from '@/lib/email';
import { modeleGoTrue } from '@/lib/gotrue-modeles';
import { siteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

export async function GET() {
  const html = modeleGoTrue('confirmation-inscription', { urlSite: siteUrl(), photoSignature: await photoSignatureEmail() });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
