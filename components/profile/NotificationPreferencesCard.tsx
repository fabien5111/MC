'use client';

// Centre de préférences de réception (JEP-279) : une grille catégorie × canal
// (site, e-mail) + rythme de l'e-mail. Remplace l'ancienne case unique
// « notifications d'abonnement par e-mail ».
//
// **Construite en lisant le catalogue** (`lib/notification-events.ts`) : un
// événement ajouté au catalogue apparaît ici sans toucher à ce fichier. Les
// catégories verrouillées (abonnement, support) s'affichent grisées AVEC leur
// raison — une case grisée sans explication se lit comme une panne.
//
// « Aucun » n'est pas un réglage à part : c'est décocher les deux canaux.
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
import {
  CATEGORIES,
  CATEGORIE_INFO,
  LIBELLE_RYTHME,
  RYTHME_VERS_BASE,
  preferenceEffective,
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
}: {
  userId: string;
  preferences: PreferencesMembre;
  /** Admin ou gestionnaire : la catégorie « Modération » apparaît. */
  backOffice: boolean;
}) {
  const { mutate, busy } = useMutation();
  const [prefs, setPrefs] = useState<PreferencesMembre>(preferences);

  const categories = CATEGORIES.filter((c) => backOffice || !CATEGORIE_INFO[c].backOffice);

  async function changer(rubrique: Rubrique, modif: Partial<PreferenceCategorie>) {
    const avant = prefs;
    const suivante: PreferenceCategorie = { ...preferenceEffective(prefs, rubrique.cle), ...modif };
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
        Choisissez, pour chaque type d’information, si vous la recevez sur le site, par e-mail, ou pas du tout — et à
        quel rythme. Décochez les deux pour ne rien recevoir. Le réglage vaut dès le prochain événement.
      </p>
      <ul className="divide-y divide-outline-variant">
        {categories.map((c) => (
          <BlocCategorie key={c} categorie={c} prefs={prefs} onChange={changer} />
        ))}
      </ul>
    </SettingsCard>
  );
}

function BlocCategorie({
  categorie,
  prefs,
  onChange,
}: {
  categorie: Categorie;
  prefs: PreferencesMembre;
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
  siteVerrouille,
  emailVerrouille,
  onChange,
}: {
  rubrique: Rubrique;
  pref: PreferenceCategorie;
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
