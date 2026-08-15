// Route Handler — vérification d'un pseudo AVANT création du compte
// (formulaire d'inscription) ou avant son enregistrement (`/choix-pseudo`).
//
// Ouverte aux visiteurs non connectés : à l'inscription par e-mail, il n'y a
// par définition pas encore de session. C'est aussi pourquoi la chaîne de
// contrôles est ordonnée du moins cher au plus cher (format local → unicité
// en base → appel IA) : un robot qui bombarderait cette route ne doit pas
// pouvoir s'en servir comme d'un accès gratuit à l'API Anthropic.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { verifierPseudoComplet } from '@/lib/pseudo-data';
import { PSEUDO_MAX_LENGTH } from '@/lib/pseudo';

export const maxDuration = 20;

// Garde-fou de débit, volontairement simple : compteur en mémoire du process.
// Sur des fonctions serverless, chaque instance a le sien — c'est du
// best-effort qui casse une boucle depuis une même origine, pas une défense
// distribuée. Le contrôle réellement incontournable reste l'index unique en
// base ; celui-ci ne protège que la facture de l'API IA.
const FENETRE_MS = 10 * 60_000;
const MAX_APPELS = 30;
const compteurs = new Map<string, { n: number; jusqua: number }>();

function tropDAppels(ip: string): boolean {
  const maintenant = Date.now();
  const courant = compteurs.get(ip);
  if (!courant || courant.jusqua < maintenant) {
    compteurs.set(ip, { n: 1, jusqua: maintenant + FENETRE_MS });
    // Purge opportuniste : sans elle, la table grossirait indéfiniment sur une
    // instance longue durée.
    if (compteurs.size > 5_000) {
      for (const [cle, v] of compteurs) if (v.jusqua < maintenant) compteurs.delete(cle);
    }
    return false;
  }
  courant.n += 1;
  return courant.n > MAX_APPELS;
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'inconnu';
  if (tropDAppels(ip)) {
    return NextResponse.json({ ok: false, message: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  }

  const body = await req.json().catch(() => ({}));
  const saisie = typeof body?.pseudo === 'string' ? body.pseudo.slice(0, PSEUDO_MAX_LENGTH * 2) : '';

  // Session éventuelle (`/choix-pseudo`) : son propre profil ne doit pas se
  // compter comme un doublon de lui-même.
  const user = await getCurrentUser();
  const resultat = await verifierPseudoComplet(saisie, user?.id);

  // Toujours 200 : un pseudo refusé n'est pas une erreur de la requête, et le
  // formulaire n'a qu'un champ `message` à afficher.
  return resultat.ok
    ? NextResponse.json({ ok: true, pseudo: resultat.pseudo, slug: resultat.slug })
    : NextResponse.json({ ok: false, message: resultat.message });
}
