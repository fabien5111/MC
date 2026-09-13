// Redirection vers un chemin du site, sans jamais reconstruire son origine.
//
// POURQUOI CE MODULE EXISTE. Les routes de redirection déduisaient leur
// origine de `new URL(request.url).origin`. Derrière l'équilibreur NGINX de
// Virtuozzo, **cette valeur est fausse** : l'application rend
// `http://localhost:3000`, son adresse d'écoute, alors même que nginx
// transmet correctement l'en-tête `Host` (mesuré — un `curl` forçant
// `Host: dev.jepatisse.com` sur le port 3000 rend toujours `localhost`).
// Conséquence observée : après une connexion Google, le membre atterrissait
// sur `https://localhost:3000/`. Cf. docs/migration-infomaniak.md § 7.16.
//
// LA SOLUTION EST DE NE PAS AVOIR D'ORIGINE À CALCULER. Une en-tête
// `Location` relative est valide (RFC 7231 § 7.1.2) et le navigateur la
// résout contre l'URL courante — donc contre le domaine par lequel il est
// réellement arrivé. Ça fonctionne sans configuration, sur n'importe quel
// domaine, et ça survivra au jour où `www` et `dev` seront servis par le
// même build.
//
// POURQUOI PAS L'EN-TÊTE `Host`. Le lire reviendrait à faire confiance à une
// valeur que l'appelant contrôle : l'équilibreur ayant un `server_name _`
// attrape-tout, une requête forgée avec `Host: exemple.invalide` produirait
// une redirection ouverte vers ce domaine. Une `Location` relative ne pose
// pas la question.
//
// POURQUOI PAS `siteUrl()` NON PLUS, ICI. Elle conviendrait, mais elle fige
// une origine unique par build — ce qui redeviendrait faux le jour où un
// même déploiement sert deux domaines. Elle reste le bon outil quand une URL
// **absolue** est nécessaire (un lien à ouvrir plus tard, un e-mail) : c'est
// le cas de `/api/admin/impersonate`, qui l'utilise.
import { NextResponse } from 'next/server';

/**
 * Redirige vers un chemin du site. `chemin` doit commencer par `/` — les
 * appelants le garantissent déjà (`safeNext` du callback, chemins littéraux
 * ailleurs).
 *
 * 307 plutôt que 302 : c'est ce que rendait `NextResponse.redirect` par
 * défaut, et la méthode est préservée.
 */
export function redirigerVers(chemin: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: chemin } });
}
