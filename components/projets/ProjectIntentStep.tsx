'use client';

// Étape 1 du mode projet (JEP-254, point 2) : AVANT toute chose, choisir
// entre l'aide de l'IA — une phrase d'intention, dont l'IA déduit le format
// et la liste des composants — et la construction manuelle, où l'on passe
// directement au format.
//
// Composant de pure saisie : il n'écrit rien. C'est l'appelant qui décide de
// ce que « Continuer » veut dire — créer le projet (`/projets/nouveau`, rien
// n'existe encore en base) ou mettre à jour l'intention d'un projet existant
// (retour à l'étape 1 depuis le parcours).
import { useState } from 'react';
import { LockedAction } from '@/components/LockedAction';
import { INTENT_MAX } from '@/lib/ai/project-structure';

export type ProjectStartMode = 'ai' | 'manual';

// Exemples d'amorce (spec §4, étape 1). Trois suffisent : ils montrent la
// forme attendue d'une intention — un dessert, un format, un nombre de
// parts — sans transformer l'écran en catalogue.
const EXEMPLES = [
  'Une tarte aux fruits rouges pour 8 personnes',
  'Un entremets chocolat-passion en cercle de 20 cm',
  'Une bûche marron-cassis pour 10 personnes',
];

const btnPrimary =
  'rounded-pill bg-primary px-6 py-3 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:opacity-40';

export function ProjectIntentStep({
  initialIntent = '',
  peutGenererIA = true,
  quotaProjetIA = null,
  disabled = false,
  onSubmit,
}: {
  initialIntent?: string;
  peutGenererIA?: boolean;
  quotaProjetIA?: { allowed: boolean; limit?: number; usage?: number } | null;
  disabled?: boolean;
  onSubmit: (mode: ProjectStartMode, intent: string) => void;
}) {
  const iaEpuise = peutGenererIA && quotaProjetIA != null && !quotaProjetIA.allowed;
  const iaDisponible = peutGenererIA && !iaEpuise;
  const [mode, setMode] = useState<ProjectStartMode | null>(null);
  const [intent, setIntent] = useState(initialIntent);
  const [erreur, setErreur] = useState<string | null>(null);

  const iaMessage = peutGenererIA
    ? `Quota de générations par IA atteint ce mois-ci (${quotaProjetIA?.usage ?? quotaProjetIA?.limit}/${quotaProjetIA?.limit}). Le crédit se renouvelle à la prochaine période.`
    : "L'aide de l'IA pour composer un projet n'est pas incluse dans votre formule.";

  function continuer() {
    if (!mode) return;
    const texte = intent.replace(/\s+/g, ' ').trim().slice(0, INTENT_MAX);
    if (mode === 'ai' && texte.length < 5) {
      setErreur('Décrivez en une phrase le dessert que vous voulez réaliser.');
      return;
    }
    setErreur(null);
    onSubmit(mode, texte);
  }

  const carte = (actif: boolean) =>
    `flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
      actif ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary'
    }`;

  return (
    <section className="space-y-5">
      <h2 className="font-headline-md text-2xl text-primary">Comment voulez-vous construire votre projet ?</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {iaDisponible ? (
          <button type="button" onClick={() => setMode('ai')} className={carte(mode === 'ai')} aria-pressed={mode === 'ai'}>
            <span className="material-symbols-outlined text-[22px] text-primary">auto_awesome</span>
            <span>
              <span className="block font-label-md text-[13px] font-semibold text-on-surface">Avec l’aide de l’IA</span>
              <span className="block text-[12px] text-on-surface-variant">
                Décrivez votre dessert en une phrase : l’IA propose le format et les préparations qui le composent.
              </span>
            </span>
          </button>
        ) : (
          <LockedAction
            label="Avec l’aide de l’IA"
            message={iaMessage}
            className="flex w-full items-start gap-3 rounded-xl border border-outline-variant p-4 text-left font-label-md text-[13px] font-semibold"
          >
            Avec l’aide de l’IA
          </LockedAction>
        )}
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={carte(mode === 'manual')}
          aria-pressed={mode === 'manual'}
        >
          <span className="material-symbols-outlined text-[22px] text-primary">construction</span>
          <span>
            <span className="block font-label-md text-[13px] font-semibold text-on-surface">Manuellement</span>
            <span className="block text-[12px] text-on-surface-variant">
              Vous choisissez le format, puis vous composez vous-même la liste des préparations.
            </span>
          </span>
        </button>
      </div>

      {mode === 'ai' && (
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant">
            Une phrase suffit. Le dessert, son format, le nombre de parts — ce qui vous vient.
          </p>
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value.slice(0, INTENT_MAX))}
            rows={3}
            placeholder="Une tarte aux fruits rouges pour 8 personnes"
            className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-4 font-body-md text-[15px] outline-none focus:border-primary"
          />
          <div className="flex flex-wrap gap-2">
            {EXEMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setIntent(ex)}
                className="rounded-pill border border-outline-variant px-3 py-1.5 text-[12.5px] text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-2">
          <label className="block font-label-md text-label-md text-outline">VOTRE INTENTION (FACULTATIF)</label>
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value.slice(0, INTENT_MAX))}
            rows={2}
            placeholder="Une note pour vous : l’idée de départ du dessert"
            className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-4 font-body-md text-[15px] outline-none focus:border-primary"
          />
        </div>
      )}

      {erreur && <p className="text-[13px] text-error">{erreur}</p>}

      {mode && (
        <button type="button" onClick={continuer} disabled={disabled} className={btnPrimary}>
          {mode === 'ai' ? 'Proposer avec l’IA' : 'Continuer'}
        </button>
      )}
    </section>
  );
}
