'use client';

// Centre de préférences de réception (JEP-279) : une grille catégorie × canal
// (site, e-mail, téléphone) + rythme de l'e-mail. Remplace l'ancienne case unique
// « notifications d'abonnement par e-mail ».
//
// **Construite en lisant le catalogue** (`lib/notification-events.ts`) : un
// événement ajouté au catalogue apparaît ici sans toucher à ce fichier. Les
// catégories verrouillées (abonnement, support) s'affichent grisées AVEC leur
// raison — une case grisée sans explication se lit comme une panne.
//
// « Aucun » n'est pas un réglage à part : c'est décocher les canaux.
//
// Canal « Sur le téléphone » (Web Push) : la case règle QUOI part, le bloc
// `PushDeviceSection` en tête règle OÙ (quels appareils). Elle n'est jamais
// verrouillée, même pour l'abonnement et le support — l'obligation porte sur
// l'e-mail. `push` n'est écrite que quand elle change : avant la migration qui
// crée la colonne, cocher « Sur le site » doit continuer de fonctionner.
//
// Écriture directe du navigateur vers `notification_preferences` (RLS : le
// membre n'écrit que ses propres lignes). Le moteur relit la table à CHAQUE
// événement : le réglage vaut dès le suivant, sans reconnexion.
//
// Mise en page : un bloc par catégorie plutôt qu'un tableau, qui déborderait
// à 360 px.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { SettingsCard } from '@/components/profile/SettingsCard';
import { PushDeviceSection } from '@/components/profile/PushDeviceSection';
import {
  CATEGORIES,
  CATEGORIE_INFO,
  LIBELLE_RYTHME,
  RYTHME_VERS_BASE,
  preferenceEffective,
  pushEffectif,
  rubriquesDeCategorie,
  type Categorie,
  type PreferenceCategorie,
  type PreferencesMembre,
  type Rubrique,
  type Rythme,
} from '@/lib/notification-events';

export function NotificationPreferencesCard({
  userId,
  preferences,
  backOffice,
  clePushPublique,
  appareilsPush,
}: {
  userId: string;
  preferences: PreferencesMembre;
  /** Admin ou gestionnaire : la catégorie « Modération » apparaît. */
  backOffice: boolean;
  /** Clé publique VAPID ; `null` = notifications sur l'appareil indisponibles (colonne masquée). */
  clePushPublique: string | null;
  /** Nombre d'appareils activés du membre (`null` si illisible). */
  appareilsPush: number | null;
}) {
  const { mutate, busy } = useMutation();
  const [prefs, setPrefs] = useState<PreferencesMembre>(preferences);

  const categories = CATEGORIES.filter((c) => backOffice || !CATEGORIE_INFO[c].backOffice);

  async function changer(rubrique: Rubrique, modif: Partial<PreferenceCategorie>) {
    const avant = prefs;
    const suivante: PreferenceCategorie = {
      ...preferenceEffective(prefs, rubrique.cle),
      push: pushEffectif(prefs, rubrique.cle),
      ...modif,
    };
    setPrefs({ ...prefs, [rubrique.cle]: suivante });
    const ok = await mutate(
      () =>
        createClient()
          .from('notification_preferences' as never)
          .upsert(
            {
              user_id: userId,
              // La colonne `category` porte la clé de la RUBRIQUE (sous-catégorie).
              category: rubrique.cle,
              in_app: suivante.site,
              email: suivante.email,
              rhythm: RYTHME_VERS_BASE[suivante.rythme],
              ...('push' in modif ? { push: suivante.push } : {}),
            } as never,
            { onConflict: 'user_id,category' },
          ),
      { refresh: false, errorLabel: 'Préférences de notification' },
    );
    if (!ok) setPrefs(avant);
  }

  return (
    <SettingsCard icon="notifications" title="Notifications" count={0} id="notifications">
      <LoadingOverlay visible={busy} label="Mise à jour…" />
      <p className="mb-6 text-sm text-on-surface-variant">
        Choisissez, pour chaque type d’information, si vous la recevez sur le site, par e-mail
        {clePushPublique ? ', sur votre téléphone' : ''}, ou pas du tout — et à quel rythme. Décochez tout pour ne rien
        recevoir. Le réglage vaut dès le prochain événement.
      </p>
      <PushDeviceSection clePublique={clePushPublique} appareils={appareilsPush} />
      <ul className="divide-y divide-outline-variant">
        {categories.map((c) => (
          <BlocCategorie key={c} categorie={c} prefs={prefs} avecPush={!!clePushPublique} onChange={changer} />
        ))}
      </ul>
    </SettingsCard>
  );
}

function BlocCategorie({
  categorie,
  prefs,
  avecPush,
  onChange,
}: {
  categorie: Categorie;
  prefs: PreferencesMembre;
  avecPush: boolean;
  onChange: (r: Rubrique, m: Partial<PreferenceCategorie>) => void;
}) {
  const info = CATEGORIE_INFO[categorie];
  const rubriques = rubriquesDeCategorie(categorie);

  return (
    <li className="py-5">
      <p className="font-label-md text-[15px] font-semibold text-on-surface">{info.libelle}</p>
      <ul className="mt-3 grid gap-5">
        {rubriques.map((r) => (
          <LigneRubrique
            key={r.cle}
            rubrique={r}
            pref={preferenceEffective(prefs, r.cle)}
            push={avecPush ? pushEffectif(prefs, r.cle) : null}
            siteVerrouille={!!info.siteVerrouille}
            emailVerrouille={!!info.emailVerrouille}
            onChange={(m) => onChange(r, m)}
          />
        ))}
      </ul>
      {info.noteVerrouille && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px]" aria-hidden>
            lock
          </span>
          {info.noteVerrouille}
        </p>
      )}
    </li>
  );
}

function LigneRubrique({
  rubrique,
  pref,
  push,
  siteVerrouille,
  emailVerrouille,
  onChange,
}: {
  rubrique: Rubrique;
  pref: PreferenceCategorie;
  /** Case « Sur le téléphone » ; `null` = canal indisponible, case absente. */
  push: boolean | null;
  siteVerrouille: boolean;
  emailVerrouille: boolean;
  onChange: (m: Partial<PreferenceCategorie>) => void;
}) {
  const idRythme = `rythme-${rubrique.cle}`;

  return (
    <li className="min-w-0">
      {rubrique.libelle && <p className="text-[13px] font-medium text-on-surface">{rubrique.libelle}</p>}
      <p className="mt-0.5 text-xs text-on-surface-variant">{rubrique.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={pref.site}
            disabled={siteVerrouille}
            onChange={(e) => onChange({ site: e.target.checked })}
            className="h-5 w-5 accent-primary disabled:opacity-60"
          />
          Sur le site
        </label>
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={pref.email}
            disabled={emailVerrouille}
            onChange={(e) => onChange({ email: e.target.checked })}
            className="h-5 w-5 accent-primary disabled:opacity-60"
          />
          Par e-mail
        </label>
        {push !== null && (
          <label className="flex items-center gap-2 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={push}
              onChange={(e) => onChange({ push: e.target.checked })}
              className="h-5 w-5 accent-primary"
            />
            Sur le téléphone
          </label>
        )}
        {pref.email && rubrique.rythmesPermis.length > 1 && (
          <span className="flex items-center gap-2 text-sm text-on-surface">
            <label htmlFor={idRythme} className="text-on-surface-variant">
              Rythme
            </label>
            <select
              id={idRythme}
              value={pref.rythme}
              onChange={(e) => onChange({ rythme: e.target.value as Rythme })}
              className="rounded border border-outline-variant bg-surface-bright px-2 py-1 text-sm"
            >
              {rubrique.rythmesPermis.map((r) => (
                <option key={r} value={r}>
                  {LIBELLE_RYTHME[r]}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>
    </li>
  );
}
