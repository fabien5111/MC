// Modèle d'e-mail GoTrue « mot-de-passe-oublie » (JEP-276) : contenu et liens dans
// `lib/gotrue-modeles.ts`. Lu par GoTrue (nœud 216114) à l'envoi, via
// `GOTRUE_MAILER_TEMPLATES_*` — cf. DEPLOY.md § « Modèles d'e-mails GoTrue ».
// Dynamique : la photo de signature et son lien (JEP-378) sont relus à chaque appel.
import { signatureEmail } from '@/lib/email';
import { modeleGoTrue } from '@/lib/gotrue-modeles';
import { siteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sig = await signatureEmail();
  const html = modeleGoTrue('mot-de-passe-oublie', { urlSite: siteUrl(), photoSignature: sig.photo, lienSignature: sig.lien });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
