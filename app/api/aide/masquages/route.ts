// Route Handler — « Réafficher les aides » (JEP-373) : supprime tous les
// masquages de blocs d'aide du membre connecté (`help_dismissals`, bloc, vidéo
// ou page entière), pour que les aides reviennent sur les écrans où il les
// avait fermées.
//
// Clé service_role, parce que la policy de suppression de `help_dismissals`
// n'est pas démontrable depuis le dépôt (DDL posé à la main) ; la suppression
// est bornée à `user_id` du membre, jamais à une valeur fournie par le client.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getImpersonationContext } from '@/lib/impersonation';
import { refusSiCompteBloque } from '@/lib/moderation-route';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Connexion requise.' }, { status: 401 });
  // Aucune session « en tant que » : les aides masquées sont celles du membre,
  // l'administrateur n'a pas à les rétablir à sa place.
  if (await getImpersonationContext()) {
    return NextResponse.json(
      { ok: false, message: 'Indisponible pendant une connexion « en tant que ».' },
      { status: 403 },
    );
  }
  const bloque = await refusSiCompteBloque(user.id, 'message');
  if (bloque) return bloque;

  try {
    const { error } = await createAdminClient().from('help_dismissals').delete().eq('user_id', user.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message }, { status: 503 });
  }
}
