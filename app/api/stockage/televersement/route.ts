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
import {
  EXPIRATION_TELEVERSEMENT_S,
  USAGES,
  estMimeAccepte,
  estUsage,
  nouvelleCleObjet,
} from '@/lib/storage';
import { urlDeTeleversement } from '@/lib/storage-data';

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

  const { usage, mime } = (corps ?? {}) as { usage?: unknown; mime?: unknown };

  if (!estUsage(usage)) return refus('Usage inconnu.', 400);
  if (typeof mime !== 'string' || !estMimeAccepte(mime)) {
    return refus('Type d’image non accepté.', 400);
  }

  const decl = USAGES[usage];

  // L'usage `contact` est déclaré mais volontairement fermé à ce stade.
  //
  // C'est le seul dépôt ouvert à un visiteur NON CONNECTÉ : /contact accepte
  // des photos sans compte. Sa protection ne peut pas être improvisée ici —
  // elle tient à la chaîne du formulaire (piège, délai minimum porté par un
  // jeton signé par CONTACT_FORM_SECRET, limitation de débit comptée en base).
  // `reserverQuota()` ne s'y substitue pas : il exige un userId.
  //
  // Câbler une moitié de cette chaîne maintenant, avant que le formulaire ne
  // l'utilise, produirait un second dispositif qui divergerait du premier au
  // premier changement. Le B2 étape 4 l'ouvre en réutilisant l'existant.
  if (decl.acces === 'public') {
    return refus('Dépôt anonyme pas encore ouvert (lot B2).', 501);
  }

  const user = await getCurrentUser();
  if (!user) return refus('Connexion requise.', 401);

  // Une session « en tant que » en lecture seule n'écrit rien, ici comme
  // ailleurs : /api/import-url et /api/transcribe-photo renvoient déjà 403.
  // Sans ce garde, l'impersonation pourrait déposer des objets — l'écriture en
  // base serait refusée ensuite, mais l'objet, lui, resterait.
  if (await isReadOnlySession()) return refus('Session en lecture seule.', 403);

  if (decl.acces === 'admin' && !(await isAdmin(user.id))) {
    return refus('Réservé à l’administration.', 403);
  }

  const cle = nouvelleCleObjet(decl.prefixe, mime);

  return NextResponse.json({
    cle,
    conteneur: decl.conteneur,
    url: urlDeTeleversement(decl.conteneur, cle),
    expireDansS: EXPIRATION_TELEVERSEMENT_S,
  });
}
