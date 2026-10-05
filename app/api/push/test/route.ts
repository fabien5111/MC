// Route Handler — notification d'essai envoyée aux appareils du membre
// connecté (bouton « Envoyer une notification d'essai » de /reglages).
//
// Seul moyen pour un membre — et pour nous — de vérifier de bout en bout qu'un
// téléphone reçoit bien les notifications, sans attendre un vrai événement.
// Ne vise que les appareils du membre lui-même : aucune cible n'est lue dans
// la requête. Un délai minimal entre deux essais évite d'en faire une sonnette.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getImpersonationContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { composerMessagePush } from '@/lib/push';
import { envoyerPush } from '@/lib/push-data';

const DELAI_MS = 20_000;
// Mémoire du processus : suffisant ici (`pm2` à une seule instance, cf.
// ecosystem.config.js) — l'enjeu n'est qu'un confort, pas une protection.
const derniersEssais = new Map<string, number>();

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Connexion requise.' }, { status: 401 });
  if (await getImpersonationContext()) {
    return NextResponse.json(
      { ok: false, message: 'Indisponible pendant une connexion « en tant que ».' },
      { status: 403 },
    );
  }
  const maintenant = Date.now();
  if (maintenant - (derniersEssais.get(user.id) ?? 0) < DELAI_MS) {
    return NextResponse.json({ ok: false, message: 'Patientez quelques secondes avant un nouvel essai.' }, { status: 429 });
  }
  derniersEssais.set(user.id, maintenant);
  try {
    const atteints = await envoyerPush(
      createAdminClient(),
      user.id,
      composerMessagePush('Je pâtisse !', 'Les notifications arrivent bien sur cet appareil.', '/reglages#notifications'),
    );
    return NextResponse.json({ ok: true, atteints });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message }, { status: 503 });
  }
}
