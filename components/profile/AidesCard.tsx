'use client';

// Bloc « Aides et conseils » de /reglages (JEP-373) : rétablir les blocs
// d'aide masqués, et rejoindre la page Aide qui rassemble leurs textes.
import Link from 'next/link';
import { ReafficherAidesButton } from '@/components/help/ReafficherAidesButton';
import { SettingsCard } from './SettingsCard';

export function AidesCard() {
  return (
    <SettingsCard icon="help" title="Aides et conseils" count={0} id="aides">
      <p className="mb-6 text-sm text-on-surface-variant">
        Les blocs « Aides et Conseils » s&apos;affichent en haut de certains écrans. Vous en avez masqué ? Réaffichez-les
        tous d&apos;un clic, ou relisez-les à tout moment sur la{' '}
        <Link href="/aide" className="text-primary underline underline-offset-2">
          page Aide
        </Link>
        .
      </p>
      <ReafficherAidesButton />
    </SettingsCard>
  );
}
