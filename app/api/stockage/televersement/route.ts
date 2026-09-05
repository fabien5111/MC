// Route Handler — mint d'une URL de dépôt sur le stockage objet.
//
// Le navigateur y fait ensuite un `PUT` **direct** : les octets ne transitent
// jamais par l'application (§ 3 — le stockage sert le navigateur en direct,
// sans consommer de cloudlets, et ça contourne la limite de 4,5 Mo du corps
// d'une fonction serverless).
//
// Ce que le jeton rendu autorise, et rien d'autre : écrire UNE fois, à UN
// chemin, pendant quinze minutes. Il ne permet ni de lire, ni de supprimer, ni
// d'écrire ailleurs — la signature porte la méthode et le chemin.
//
// Cf. docs/migration-infomaniak.md § 7.5 (lot B, sous-lot B1).
import { NextResponse } from 'next/server';

import { getCurrentUser, isAdmin } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { verdictDelaiOuverture } from '@/lib/contact';
import { clientIp, debitIpDepasse, empreinteIp, verifierOuverture } from '@/lib/contact-data';
import {
  EXPIRATION_TELEVERSEMENT_S,
  USAGES,
  estMimeAccepte,
  estUsage,
  nouvelleCleObjet,
} from '@/lib/storage';
import { urlCanonique, urlDeTeleversement } from '@/lib/storage-data';

function refus(message: string, code: number) {
  return NextResponse.json({ error: message }, { status: code });
}

export async function POST(req: Request) {
  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return refus('Corps de requête illisible.', 400);
  }

  const { usage, mime, formToken } = (corps ?? {}) as { usage?: unknown; mime?: unknown; formToken?: unknown };

  if (!estUsage(usage)) return refus('Usage inconnu.', 400);
  if (typeof mime !== 'string' || !estMimeAccepte(mime)) {
    return refus('Type d’image non accepté.', 400);
  }

  const decl = USAGES[usage];
  const user = await getCurrentUser();

  if (decl.acces === 'public') {
    // Seul `contact` est déclaré `public` (§ 7.5, lot B2 étape 4) : le dépôt
    // initial d'une demande se fait SANS session — c'est le seul cas de ce
    // fichier. Les réponses (admin, membre) passent, elles, par une session
    // authentifiée et suivent la branche `else` ci-dessous, comme n'importe
    // quel usage `membre`.
    if (!user) {
      // Même chaîne que `/api/contact`, jamais improvisée ici : un jeton de
      // formulaire absent/périmé/prématuré est le signe d'un robot qui
      // appelle la route sans être passé par la page — 403 franc plutôt
      // qu'un 200 silencieux, cette route ne répond pas à un visiteur mais à
      // un appel de script du formulaire.
      const ouvertureMs = verifierOuverture(formToken);
      if (verdictDelaiOuverture(ouvertureMs, Date.now()) !== 'ok') {
        return refus('Jeton de formulaire invalide ou expiré.', 403);
      }
      // Même compteur, mêmes seuils que la limitation de débit du dépôt de la
      // demande elle-même (`DEBIT_IP`) : une IP déjà au plafond de demandes
      // ne peut pas non plus obtenir de nouvelles URLs de dépôt.
      const ipHash = await empreinteIp(clientIp(req));
      if (ipHash && (await debitIpDepasse(ipHash))) {
        return refus('Trop de demandes récentes, réessayez plus tard.', 429);
      }
    } else if (await isReadOnlySession()) {
      return refus('Session en lecture seule.', 403);
    }
  } else {
    if (!user) return refus('Connexion requise.', 401);

    // Une session « en tant que » en lecture seule n'écrit rien, ici comme
    // ailleurs : /api/import-url et /api/transcribe-photo renvoient déjà 403.
    // Sans ce garde, l'impersonation pourrait déposer des objets — l'écriture
    // en base serait refusée ensuite, mais l'objet, lui, resterait.
    if (await isReadOnlySession()) return refus('Session en lecture seule.', 403);

    if (decl.acces === 'admin' && !(await isAdmin(user.id))) {
      return refus('Réservé à l’administration.', 403);
    }
  }

  const cle = nouvelleCleObjet(decl.prefixe, mime);

  // `urlFinale` est ce que l'appelant persiste en base. Sur `jp-photos`
  // (public), c'est une URL directement fonctionnelle. Sur `jp-contact`
  // (privé), c'est une forme stable mais PAS directement lisible — un `GET`
  // dessus échoue sans signature — qui permet néanmoins d'en retrouver la clé
  // à la lecture (`cleDepuisUrlCanonique`) pour la re-signer à chaque
  // affichage (`urlAffichablePrivee`), sans colonne séparée pour la clé.
  return NextResponse.json({
    cle,
    conteneur: decl.conteneur,
    url: urlDeTeleversement(decl.conteneur, cle),
    urlFinale: urlCanonique(decl.conteneur, cle),
    expireDansS: EXPIRATION_TELEVERSEMENT_S,
  });
}
