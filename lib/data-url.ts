// Décodage des data-URL stockées en base (les images du site n'ont pas de
// bucket : cf. CLAUDE.md « Images »). Sert aux routes qui les servent en
// binaire, avec en-têtes de cache, au lieu de les inliner dans le HTML —
// une data-URL en ligne n'est ni cachable par le navigateur, ni téléchargeable
// en parallèle du document, et pèse ~33 % de plus que l'image elle-même.
//
// Module volontairement séparé de `lib/images.ts`, qui manipule un `canvas` :
// il ne doit pas être importé par une route serveur.

export type DecodedImage = { mime: string; bytes: ArrayBuffer };

// `data:[<mime>][;paramètres][;base64],<charge>` — le `s` couvre les data-URL
// contenant des retours à la ligne.
const DATA_URL = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s;

export function decodeDataUrl(value: string): DecodedImage | null {
  const m = DATA_URL.exec(value);
  if (!m) return null;
  const mime = (m[1] || '').toLowerCase().trim();
  // Seules des images sont servies : renvoyer une data-URL `text/html` stockée
  // en base avec son propre type MIME, depuis notre origine, serait une faille
  // XSS. Le type est donc filtré ici, et jamais deviné (`nosniff` à l'envoi).
  if (!mime.startsWith('image/')) return null;
  const isBase64 = /;base64\b/i.test(m[2] || '');
  const payload = m[3] ?? '';
  try {
    const view = isBase64
      ? new Uint8Array(Buffer.from(payload, 'base64'))
      : new TextEncoder().encode(decodeURIComponent(payload));
    if (view.byteLength === 0) return null;
    // `slice` plutôt que `.buffer` tel quel : un Buffer Node peut être une vue
    // sur un tampon partagé plus grand, dont on ne veut pas servir la fin.
    return { mime, bytes: view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer };
  } catch {
    return null;
  }
}

// Réponse image immuable. `immutable` est légitime parce que l'URL change dès
// que le contenu change : les photos d'étape sont réinsérées (nouvel `id`) à
// chaque enregistrement de la recette — `CreerForm` fait un delete + insert
// complet de `recipe_steps` — et l'URL du visuel d'en-tête porte `?v=`, la
// date de dernière modification de la recette.
//
// `shared` distingue ce qu'un cache mutualisé (CDN) peut conserver : une
// recette publiée et publique est identique pour tout le monde ; tout le reste
// reste `private`, donc cachable par le navigateur du seul destinataire et
// jamais par un intermédiaire.
export function imageResponse(img: DecodedImage, opts: { shared: boolean }): Response {
  return new Response(img.bytes, {
    headers: {
      'Content-Type': img.mime,
      'Content-Length': String(img.bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
      // Une image affichée par `<img>` ne s'exécute jamais, mais son URL peut
      // aussi être ouverte directement dans un onglet : la charge devient alors
      // un document de notre origine. `sandbox` la place dans une origine
      // opaque — la parade habituelle au SVG scriptable, en plus du filtrage du
      // type MIME côté décodage.
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': `${opts.shared ? 'public' : 'private'}, max-age=31536000, immutable`,
    },
  });
}

// Certaines colonnes peuvent contenir une vraie URL plutôt qu'une data-URL
// (image hébergée ailleurs — cf. `remotePatterns` de next.config.mjs). On
// redirige alors, au lieu de renvoyer une erreur. Schémas restreints à
// http/https : la valeur vient de la base, mais un `javascript:` renvoyé en
// redirection depuis notre origine n'a rien à y faire.
export function externalImageRedirect(value: string): Response | null {
  if (!/^https?:\/\//i.test(value)) return null;
  return Response.redirect(value, 302);
}
