// Modèle d'e-mail « Change Email Address » de GoTrue (nœud 216114), hébergé
// ici plutôt que collé à la main dans un panneau : GoTrue auto-hébergé sans
// Studio lit ses modèles via une URL qu'il va chercher à l'envoi
// (`GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE`) — la version dans le dépôt reste
// la source de vérité, comme le reste du site.
//
// `{{ .SiteURL }}`, `{{ .TokenHash }}` sont des variables Go template
// substituées par GoTrue lui-même à l'envoi — ne pas les interpréter ici.
// Le lien pointe vers `/auth/callback` avec `token_hash`/`type` (vérifiés par
// `verifyOtp`), pas `?code=` : ce lien est ouvert depuis un client mail, donc
// hors du navigateur qui a fait la demande — cf. le commentaire de
// `app/auth/callback/route.ts`. `next=/reglages` est fixé ici plutôt que
// transmis par le client : la destination après confirmation d'un changement
// d'adresse est toujours la même.
const HTML = `<!DOCTYPE html>
<html lang="fr">
  <body style="font-family: sans-serif; color: #2b2320;">
    <h2>Confirmer le changement d'adresse e-mail</h2>
    <p>Une demande de changement d'adresse e-mail a été faite sur votre compte Je pâtisse !</p>
    <p>
      <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change&next=/reglages">
        Confirmer cette adresse
      </a>
    </p>
    <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
  </body>
</html>`;

export async function GET() {
  return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
