'use client';

// Essais d'un projet (spec §7), sous le récapitulatif.
//
// **Un essai est une fournée du projet**, pas un objet de plus. Les fournées
// portent déjà les quantités réellement utilisées, les notes du jour J,
// l'état d'avancement et la filiation d'un essai au suivant ; une table
// d'essais aurait dupliqué tout cela et créé une seconde source de vérité sur
// « combien j'ai vraiment mis ». Seul le verdict manquait
// (`batches.trial_verdict`).
//
// La fournée est créée avec le MÊME moteur que celle d'une recette ordinaire
// (`insertMaterializedBatch`) — c'est ce que « un projet est une recette »
// veut dire concrètement — et avec un facteur de 1 : les quantités du projet
// sont déjà à l'échelle du format visé, c'est tout l'objet de l'étape 5.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { insertMaterializedBatch, recipeContentColumns } from '@/lib/batch-write';
import { promoteTrialQuantities } from '@/lib/projects-write';
import { scaledQuantityText } from '@/lib/projects';
import { formatDate } from '@/lib/format';
import type { ProjectTrial } from '@/lib/projects-data';
import type { RecipeFull } from '@/lib/recipes';

// Appréciation globale, volontairement à trois valeurs (spec §7.2) : de quoi
// retrouver d'un coup d'œil l'essai qui a marché, pas une échelle de notation.
const VERDICTS: { value: string; label: string; cls: string }[] = [
  { value: 'to_review', label: 'À revoir', cls: 'bg-error/90' },
  { value: 'ok', label: 'Correct', cls: 'bg-secondary/90' },
  { value: 'validated', label: 'Validé', cls: 'bg-green-700' },
];

const btnGhost =
  'rounded-pill border border-outline-variant px-4 py-2 font-label-md text-[12.5px] font-semibold text-primary transition-colors hover:bg-surface-container disabled:opacity-40';
const btnPrimary =
  'rounded-pill bg-primary px-5 py-2.5 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:opacity-40';
const champ =
  'rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-[14px] outline-none focus:border-primary';

const fr = (n: number | null) => (n == null ? '—' : String(Math.round(n * 100) / 100).replace('.', ','));

export function ProjectTrials({
  recipe,
  trials,
  unresolved,
  canLaunch = true,
}: {
  // Recette du projet, telle que le moteur de fournée la lit. C'est la même
  // lecture que sur une fiche recette : aucun chemin particulier au projet.
  recipe: RecipeFull;
  trials: ProjectTrial[];
  // Composants encore non résolus : la fournée reste autorisée (spec §12),
  // mais l'utilisateur doit savoir qu'elle sera incomplète.
  unresolved: string[];
  // Faux sur la fiche recette d'un projet VALIDÉ (spec §7.5, « l'historique
  // reste consultable ») : lancer une fournée y passe déjà par le geste
  // normal de la fiche (BatchWidget) — proposer un second bouton « essai »
  // ferait deux portes d'entrée pour le même geste. Seuls l'historique, la
  // comparaison et la promotion des quantités restent affichés.
  canLaunch?: boolean;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const { mutate, busy } = useMutation();
  const [travail, setTravail] = useState(false);
  const today = new Date();
  const [date, setDate] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
  );
  const [compare, setCompare] = useState<number[]>([]);

  async function lancerEssai() {
    if (!recipe.recipe_steps?.length) {
      dialog.alert('Ce projet n’a encore aucune étape : résolvez au moins un composant.');
      return;
    }
    if (unresolved.length) {
      const ok = await dialog.confirm(
        `${unresolved.length} composant${unresolved.length > 1 ? 's ne sont' : ' n’est'} pas encore résolu${
          unresolved.length > 1 ? 's' : ''
        } (${unresolved.join(', ')}). La fournée d’essai ne contiendra que les composants résolus. Continuer ?`,
      );
      if (!ok) return;
    }

    setTravail(true);
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/connexion');
        return;
      }
      const { data: batchRow, error } = await supabase
        .from('batches')
        .insert({
          user_id: user.id,
          recipe_id: recipe.id,
          recipe_title: recipe.title,
          planned_date: date,
          // Facteur 1 : les quantités du projet sont déjà celles du format
          // visé (étape 5). Un second coefficient les fausserait.
          factor: 1,
          adjust_label: 'Fournée d’essai du projet',
          status: 'planifiee',
          ...recipeContentColumns(recipe),
        })
        .select('id')
        .single();
      if (error || !batchRow) {
        dialog.alert('Erreur : ' + (error?.message || 'création refusée'));
        return;
      }
      try {
        await insertMaterializedBatch(supabase, batchRow.id, recipe, 1, null);
      } catch (e) {
        // Une fournée à moitié matérialisée serait pire que pas de fournée :
        // on efface la ligne créée (même garde que BatchWidget).
        await supabase.from('batches').delete().eq('id', batchRow.id);
        dialog.alert('Erreur lors de la création de la fournée : ' + (e as Error).message);
        return;
      }
      router.push(`/fournee/${batchRow.id}?mode=preparer`);
    } finally {
      setTravail(false);
    }
  }

  async function setVerdict(t: ProjectTrial, verdict: string) {
    await mutate(
      () =>
        createClient()
          .from('batches')
          .update({ trial_verdict: verdict || null } as never)
          .eq('id', t.id),
      { errorLabel: 'Appréciation de l’essai' },
    );
  }

  async function setNote(t: ProjectTrial, note: string) {
    await mutate(
      () =>
        createClient()
          .from('batches')
          .update({ commentaire_global: note.trim() || null } as never)
          .eq('id', t.id),
      { errorLabel: 'Note de l’essai' },
    );
  }

  async function promouvoir(t: ProjectTrial) {
    const mesurees = t.lines.filter((l) => l.realQuantity != null).length;
    if (!mesurees) {
      dialog.alert('Cet essai ne porte aucune quantité réellement utilisée : rien à reprendre.');
      return;
    }
    const ok = await dialog.confirm(
      `Reprendre les ${mesurees} quantité${mesurees > 1 ? 's' : ''} mesurée${mesurees > 1 ? 's' : ''} de cet essai comme quantités de référence du projet ?\nL’essai reste conservé dans l’historique.`,
    );
    if (!ok) return;

    let appliquees = 0;
    await mutate(
      async () => {
        const supabase = createClient();
        try {
          appliquees = await promoteTrialQuantities(supabase, recipe.id, t.lines, scaledQuantityText);
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        return { error: null };
      },
      { errorLabel: 'Reprise des quantités' },
    );
    if (appliquees === 0) {
      dialog.alert('Aucune quantité n’a pu être rattachée : les étapes du projet ont peut-être changé depuis cet essai.');
    }
  }

  function toggleCompare(id: number) {
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2)));
  }

  // Comparaison de deux essais sur les quantités (spec §7.3). Appariement par
  // nom : à l'intérieur d'un même projet, deux essais successifs portent les
  // mêmes lignes.
  const compares = trials.filter((t) => compare.includes(t.id));
  const lignesComparees =
    compares.length === 2
      ? [
          ...new Set(compares.flatMap((t) => t.lines.map((l) => l.name.trim().toLowerCase()))),
        ]
          .map((cle) => ({
            nom: compares[0].lines.find((l) => l.name.trim().toLowerCase() === cle)?.name ?? cle,
            unite:
              compares[0].lines.find((l) => l.name.trim().toLowerCase() === cle)?.unit ??
              compares[1].lines.find((l) => l.name.trim().toLowerCase() === cle)?.unit ??
              '',
            valeurs: compares.map((t) => {
              const l = t.lines.find((x) => x.name.trim().toLowerCase() === cle);
              return l ? (l.realQuantity ?? l.quantity) : null;
            }),
          }))
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
      : [];

  return (
    <div className="rounded-xl border border-outline-variant p-4">
      <LoadingOverlay visible={busy || travail} />
      <h3 className="mb-2 font-label-md text-label-md uppercase tracking-widest text-secondary">Essais</h3>
      <p className="mb-4 text-[13px] text-on-surface-variant">
        {canLaunch
          ? 'Une fournée d’essai se cuisine comme n’importe quelle autre. À la fin, notez ce que vous avez réellement mis : ces quantités pourront devenir celles du projet.'
          : 'Notez ce que vous avez réellement mis à chaque fournée cuisinée : ces quantités pourront devenir celles de la recette.'}
      </p>

      {canLaunch && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <label className="font-label-md text-[12px] text-outline">DATE DE DÉGUSTATION</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
          <button type="button" onClick={() => void lancerEssai()} disabled={busy || travail} className={btnPrimary}>
            Lancer une fournée d’essai
          </button>
        </div>
      )}

      {trials.length === 0 ? (
        <p className="text-[13px] italic text-on-surface-variant">Aucun essai pour l’instant.</p>
      ) : (
        <ul className="space-y-3">
          {trials.map((t) => {
            const mesurees = t.lines.filter((l) => l.realQuantity != null).length;
            return (
              <li key={t.id} className="rounded-xl border border-outline-variant p-3">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <a href={`/fournee/${t.id}`} className="font-body-md text-[15px] font-semibold text-primary">
                    Essai du {t.plannedDate ? formatDate(t.plannedDate) : formatDate(t.createdAt)}
                  </a>
                  <span className="text-[12px] text-on-surface-variant">
                    {t.status === 'terminee' ? 'Terminée' : t.status === 'abandonnee' ? 'Abandonnée' : 'En cours'}
                    {mesurees ? ` · ${mesurees} quantité${mesurees > 1 ? 's' : ''} mesurée${mesurees > 1 ? 's' : ''}` : ''}
                  </span>
                  <span className="ml-auto flex flex-wrap items-center gap-1">
                    {VERDICTS.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => void setVerdict(t, t.verdict === v.value ? '' : v.value)}
                        className={`rounded-pill px-3 py-1 font-label-md text-[11px] transition-all ${
                          t.verdict === v.value
                            ? `${v.cls} text-white`
                            : 'border border-outline-variant text-on-surface-variant hover:border-primary'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </span>
                </div>

                <textarea
                  // `key` porte la note : le champ n'écrit qu'à la sortie, il
                  // faut le remonter quand la valeur serveur change.
                  key={`${t.id}-${t.note ?? ''}`}
                  defaultValue={t.note ?? ''}
                  onBlur={(e) => {
                    if ((e.target.value || '') !== (t.note ?? '')) void setNote(t, e.target.value);
                  }}
                  rows={2}
                  placeholder="Ce que vous avez observé — texture, cuisson, équilibre…"
                  className={`${champ} mb-2 w-full`}
                />

                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void promouvoir(t)} className={btnGhost}>
                    Reprendre ces quantités
                  </button>
                  <label className="flex items-center gap-2 text-[12.5px] text-on-surface-variant">
                    <input type="checkbox" checked={compare.includes(t.id)} onChange={() => toggleCompare(t.id)} />
                    Comparer
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lignesComparees.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead>
              <tr className="text-left text-on-surface-variant">
                <th className="py-1 font-label-md text-[11.5px] uppercase tracking-widest">Ingrédient</th>
                {compares.map((t) => (
                  <th key={t.id} className="py-1 font-label-md text-[11.5px] uppercase tracking-widest">
                    {t.plannedDate ? formatDate(t.plannedDate) : formatDate(t.createdAt)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignesComparees.map((l) => {
                const differe = l.valeurs[0] !== l.valeurs[1];
                return (
                  <tr key={l.nom} className={differe ? 'bg-surface-container-low' : undefined}>
                    <td className="py-1 pr-3 text-on-surface">{l.nom}</td>
                    {l.valeurs.map((v, i) => (
                      <td key={i} className="py-1 pr-3 text-on-surface-variant">
                        {fr(v)} {l.unite}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-outline">
            Quantité réellement utilisée quand elle a été notée, sinon quantité prévue. Les lignes qui diffèrent sont
            surlignées.
          </p>
        </div>
      )}
    </div>
  );
}
