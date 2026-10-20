'use client';

// Ajustement des quantités d'une préparation (spec §6), rendu dans le volet
// « Ajustement des quantités » de chaque préparation du mode projet.
//
// **Rien n'est redéveloppé ici.** Le coefficient sort du même calcul que
// pour une fournée — rapport des volumes ou des surfaces entre le moule de la
// recette source et le format visé (`moldMetrics`) — et s'applique par groupe
// d'ingrédients selon son `scaling_mode` (`scalingCoef`) : une pâte à foncer
// suit la surface, un appareil suit le volume. Quand la géométrie ne permet
// pas de trancher (recette sans moule, composant proposé par l'IA ou saisi à
// la main), l'écran bascule sur `/api/scale-recipe`, la route d'ajustement en
// texte libre déjà en place.
//
// Les quantités proposées sont des POINTS DE DÉPART (spec §6.2), et l'écran
// le dit. L'utilisateur les affine ici, puis au fil de ses essais.
import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { moldMetrics } from '@/lib/recipe-view';
import { scalingCoef } from '@/lib/recipe-plan';
import { applyComponentScale, setLineQuantity } from '@/lib/projects-write';
import {
  COMPONENT_SOURCE_LABELS,
  componentScaleProposal,
  scaleIncompatibility,
  projectFormatKey,
  lignesRendement,
  quantitiesStale,
  scaledQuantityText,
  type ComponentSourceKind,
  type ScalableFormat,
  type ScaleProposal,
} from '@/lib/projects';
import type { ProjectComponent, ProjectFull } from '@/lib/projects-data';

const btnGhost =
  'rounded-pill border border-outline-variant px-4 py-2 font-label-md text-[12.5px] font-semibold text-primary transition-colors hover:bg-surface-container disabled:opacity-40';
const btnPrimary =
  'rounded-pill bg-primary px-5 py-2.5 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:opacity-40';
const champ =
  'rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-[14px] outline-none focus:border-primary';

const fr = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

// Masse totale des lignes exprimées en g ou kg — la « quantité produite »
// lisible d'une préparation (JEP-254, point 13). Les autres unités (pièce,
// ml, pincée) ne s'additionnent pas sans conversion : elles sont ignorées, et
// l'écran le dit (« ingrédients pesés »). `base` : quantités de la recette
// d'origine, avant ajustement.
function masseGrammes(lines: ProjectComponent['lines'], base: boolean): number | null {
  let total = 0;
  let vu = false;
  for (const l of lines) {
    const u = (l.unit || '').trim().toLowerCase();
    const mult = u === 'g' ? 1 : u === 'kg' ? 1000 : null;
    if (mult == null) continue;
    const q = base ? l.baseQuantity : parseFloat(String(l.quantity ?? '').replace(',', '.'));
    if (q == null || !isFinite(q)) continue;
    total += q * mult;
    vu = true;
  }
  return vu ? total : null;
}

const masseTexte = (g: number) => (g >= 1000 ? `${fr(g / 1000)} kg` : `${Math.round(g)} g`);

const round2 = (x: number) => Math.round(x * 100) / 100;

// Perte en cuisine (JEP-254) : ce qui reste sur le fouet, les bols, les
// cuillères réduit ce qui arrive réellement dans le dessert. La correction
// consiste à PRODUIRE un peu plus, pas à changer la quantité visée — donc à
// gonfler le coefficient d'autant, moldCoefs compris (sinon une préparation
// qui fonce un moule, calculée à partir de sa surface, n'en tiendrait pas
// compte).
function appliquerPerte(prop: ScaleProposal, pourcentPerte: number): ScaleProposal {
  if (!pourcentPerte) return prop;
  const mult = 1 + pourcentPerte / 100;
  return {
    factor: round2(prop.factor * mult),
    moldCoefs: prop.moldCoefs
      ? { surface: round2(prop.moldCoefs.surface * mult), volume: round2(prop.moldCoefs.volume * mult) }
      : null,
    reason: `${prop.reason} + ${fr(pourcentPerte)} % de perte en cuisine.`,
  };
}

// Libellés courts des modes d'ajustement, pour l'IA et l'affichage.
const MODE_LABEL: Record<string, string> = {
  simple: 'suit le volume du moule',
  foncage: 'recouvre une surface (fonçage, glaçage)',
  aucun: 'ne doit pas être ajustée',
};

// Format visé par le projet, dans la forme attendue par le calcul.
function targetFormat(project: ProjectFull, forme: string | null): ScalableFormat {
  const dims =
    project.mold_dims && typeof project.mold_dims === 'object' && !Array.isArray(project.mold_dims)
      ? (project.mold_dims as Record<string, number>)
      : {};
  return {
    measure_type: project.measure_type,
    forme,
    dims,
    count: parseInt(project.yield_qty || '1', 10) > 0 ? parseInt(project.yield_qty || '1', 10) : 1,
    yieldQty: project.servings,
    yieldUnit: 'pers',
  };
}

// Introduction + rappel du dessert visé (JEP-254, point 13) : c'est à lui que
// chaque composant doit être ramené. Partagé : la v1 l'affiche en tête de
// l'étape « Quantités », la v2 en tête du bloc « Étapes ».
export function DessertVise({ project, formatLabel }: { project: ProjectFull; formatLabel: string }) {
  return (
    <>
      <p className="text-sm text-on-surface-variant">
        Ces quantités sont un <strong>point de départ</strong>, pas un résultat définitif : vous les affinerez au fil de
        vos essais.
      </p>
      <div className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
        <p className="font-label-md text-[11px] uppercase tracking-widest text-secondary">Dessert visé</p>
        <p className="font-body-md text-[15px] text-on-surface">
          {project.title}
          {' — '}
          {formatLabel}
          {project.servings ? ` · ${project.servings} parts` : ''}
        </p>
      </div>
    </>
  );
}

export function QuantitiesStep({
  project,
  targetForme,
  formatLabel,
  hideTitle = false,
  componentId,
  pied,
  quotaAjustementIA = null,
}: {
  project: ProjectFull;
  targetForme: string | null;
  // La v2 du mode projet porte déjà le titre dans le cadre de son bloc.
  hideTitle?: boolean;
  // v2 : une seule préparation, rendue dans sa propre section du bloc
  // « Étapes » — sans l'introduction ni le rappel du dessert (affichés une
  // fois en tête du bloc, `DessertVise`), ni le nom (déjà en titre). Les
  // autres préparations restent connues du calcul (voisins transmis à l'IA).
  componentId?: number;
  // v2 : contenu posé tout en bas de la préparation (case « Quantités
  // vérifiées »), sous la note sur les quantités modifiées à la main.
  pied?: ReactNode;
  // État du quota `ajustement_ia_mensuel` (`mc_check_quota`, affichage seulement,
  // lu par la page) : sert à montrer les crédits restants et à griser « Ajuster
  // avec l'IA » une fois le quota atteint. `null` = pas de droit, ou lecture
  // absente : rien n'est affiché. La vraie garde reste `mc_consume` côté route.
  quotaAjustementIA?: { allowed: boolean; limit?: number; usage?: number } | null;
  // Format visé, en clair (« Cercle Ø 20 × 4 cm ») : sert à décrire la cible
  // à l'IA quand la géométrie ne suffit pas.
  formatLabel: string;
}) {
  const dialog = useDialog();
  const { mutate, busy } = useMutation();
  const [travail, setTravail] = useState(false);
  // Ajustements par IA réussis depuis le dernier rendu serveur : la page ne
  // relit le quota qu'à son rendu, le décompte baisse donc ici sans attendre.
  // Remis à zéro dès que le serveur rend un `usage` à jour.
  const [iaConsommes, setIaConsommes] = useState(0);
  useEffect(() => setIaConsommes(0), [quotaAjustementIA?.usage]);
  const iaLimite = quotaAjustementIA?.limit;
  const iaRestants =
    iaLimite != null && quotaAjustementIA?.usage != null
      ? Math.max(0, iaLimite - quotaAjustementIA.usage - iaConsommes)
      : null;
  const iaEpuise = quotaAjustementIA != null && (!quotaAjustementIA.allowed || iaRestants === 0);
  const [propositions, setPropositions] = useState<Record<number, ScaleProposal>>({});
  const [saisie, setSaisie] = useState<Record<number, string>>({});
  // Précisions libres pour l'ajustement par IA, par composant (JEP-254,
  // point 15) — « la recette d'origine est pour 2 fonds », « je veux une
  // couche plus épaisse »…
  const [contexteIA, setContexteIA] = useState<Record<number, string>>({});
  // Perte en cuisine par composant (ce qui reste sur le fouet, les bols, les
  // cuillères) : un pourcentage qui vient gonfler le coefficient proposé,
  // quelle que soit sa source — géométrique, IA, ou plan de montage. Défaut
  // à 10 %, réglage de session (pas de colonne dédiée). Un coefficient saisi
  // à la main n'en tient PAS compte : il est déjà la décision finale de
  // l'utilisateur.
  const [pertes, setPertes] = useState<Record<number, string>>({});
  // Dernière proposition AVANT perte, par composant : la perte se recalcule
  // toujours depuis elle (jamais depuis le coefficient affiché, qui dériverait
  // à force de retaper). Absente = coefficient saisi à la main, pas de perte.
  const [basesSansPerte, setBasesSansPerte] = useState<Record<number, ScaleProposal>>({});
  const perteDe = (id: number) => {
    const v = parseFloat((pertes[id] ?? '10').replace(',', '.'));
    return isFinite(v) && v >= 0 ? v : 0;
  };

  const cible = targetFormat(project, targetForme);
  // Empreinte du format enregistré, posée à chaque ajustement appliqué.
  const cleFormat = projectFormatKey(project);
  const ordered = [...project.components].sort((a, b) => a.position - b.position);

  // Proposition géométrique : lue en direct sur la recette source, jamais
  // stockée. La copie du composant est autonome (elle survit à la suppression
  // de sa source) ; une proposition, elle, n'a de valeur qu'au moment où on
  // la calcule — et si la source a disparu, l'ajustement par IA prend le
  // relais.
  async function proposer(c: ProjectComponent) {
    if (!c.source_recipe_id) {
      dialog.alert(
        'Ce composant n’a pas de recette source (proposé par l’IA ou saisi à la main) : ajustez-le avec l’IA ou saisissez le coefficient.',
      );
      return;
    }
    setTravail(true);
    try {
      const { data } = await createClient()
        .from('recipes')
        .select('measure_type, mold_dims, yield_qty, yield_unit, mold_types(forme)')
        .eq('id', c.source_recipe_id)
        .maybeSingle();
      if (!data) {
        dialog.alert('La recette d’origine n’est plus accessible : ajustez ce composant avec l’IA.');
        return;
      }
      const row = data as unknown as {
        measure_type: string | null;
        mold_dims: unknown;
        yield_qty: string | null;
        yield_unit: string | null;
        mold_types: { forme: string | null } | null;
      };
      const source: ScalableFormat = {
        measure_type: row.measure_type,
        forme: row.mold_types?.forme ?? null,
        dims:
          row.mold_dims && typeof row.mold_dims === 'object' && !Array.isArray(row.mold_dims)
            ? (row.mold_dims as Record<string, number>)
            : {},
        count: parseInt(row.yield_qty || '1', 10) > 0 ? parseInt(row.yield_qty || '1', 10) : 1,
        yieldQty: parseFloat(String(row.yield_qty ?? '').replace(',', '.')) || null,
        yieldUnit: row.yield_unit,
      };
      const incompat = scaleIncompatibility(source, cible);
      if (incompat) {
        dialog.alert(incompat);
        return;
      }
      const prop = componentScaleProposal(source, cible, moldMetrics);
      if (!prop) {
        dialog.alert(
          'Le format de la recette d’origine ne permet pas de déduire un coefficient : ajustez ce composant avec l’IA.',
        );
        return;
      }
      const propAvecPerte = appliquerPerte(prop, perteDe(c.id));
      setBasesSansPerte((p) => ({ ...p, [c.id]: prop }));
      setPropositions((p) => ({ ...p, [c.id]: propAvecPerte }));
      setSaisie((p) => ({ ...p, [c.id]: fr(propAvecPerte.factor) }));
    } finally {
      setTravail(false);
    }
  }

  // Ajustement par IA : la route /api/scale-recipe, déjà utilisée par les
  // fournées. Elle rend un coefficient ET son explication en une phrase —
  // exactement la transparence exigée au §6.4.
  //
  // L'IA reçoit trois sources (JEP-254, point 15) : la recette d'origine
  // (rendement, moule, complément sur les quantités, ingrédients), le dessert
  // visé (nom, format, parts, mode d'ajustement du composant) et les
  // précisions saisies par le pâtissier.
  async function proposerIA(c: ProjectComponent) {
    setTravail(true);
    try {
      // Le rendement d'origine n'est connu que de la recette source : sans
      // lui, l'IA ne dispose d'aucune donnée de départ à comparer au format
      // visé, et renvoie systématiquement « recette non dimensionnée ».
      let rendement: string | null = c.sourceYield;
      let yieldNotes: string | null = null;
      if (c.source_recipe_id) {
        const { data } = await createClient()
          .from('recipes')
          .select('yield_qty, yield_unit, yield_notes')
          .eq('id', c.source_recipe_id)
          .maybeSingle();
        const row = data as { yield_qty: string | null; yield_unit: string | null; yield_notes: string | null } | null;
        if (!rendement && row?.yield_qty) rendement = `${row.yield_qty} ${row.yield_unit ?? ''}`.trim();
        yieldNotes = row?.yield_notes ?? null;
      }
      if (!rendement) {
        rendement = c.source_title
          ? `recette « ${c.source_title} » (rendement non précisé)`
          : 'quantités telles que saisies pour ce composant (rendement non précisé)';
      }
      const mode = c.scalingMode ?? c.lines.find((l) => l.scalingMode)?.scalingMode ?? null;
      const precisions = (contexteIA[c.id] ?? '').replace(/\s+/g, ' ').trim().slice(0, 450);
      // Rôle et voisins dans l'assemblage (JEP-254) : sans eux, l'IA ne peut
      // que comparer des surfaces/volumes de moules — inutile pour un insert,
      // dont la quantité ne dépend pas du moule mais de sa place dans le
      // montage. Le poids pesé lui donne un ordre de grandeur de départ.
      const masseBase = masseGrammes(c.lines, true);
      const autres = ordered.filter((o) => o.id !== c.id).map((o) => `${o.name}${o.role ? ` (${o.role})` : ''}`);
      const prompt = [
        `Adapter la préparation « ${c.name} »${c.role ? `, rôle : ${c.role},` : ''} au dessert « ${project.title} » :`,
        `format ${formatLabel}, ${project.servings ?? '?'} parts.`,
        autres.length ? `Les autres préparations de l’assemblage sont : ${autres.join(', ')}.` : null,
        masseBase ? `La recette telle que saisie produit environ ${masseTexte(masseBase)}.` : null,
        c.role
          ? `Si cette préparation est un insert, une garniture ou une couche intermédiaire, raisonne en COUCHE (dimensions et épaisseur compatibles avec le format ci-dessus, plus petite que le dessert), pas en remplissage du moule entier.`
          : null,
        mode && MODE_LABEL[mode] ? `Cette préparation ${MODE_LABEL[mode]}.` : null,
        precisions ? `Précisions du pâtissier : ${precisions}` : null,
      ]
        .filter(Boolean)
        .join(' ');
      const r = await fetch('/api/scale-recipe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          recette: {
            titre: c.source_title || c.name,
            rendement,
            yield_notes: yieldNotes,
            // Quantités D'ORIGINE quand elles sont connues : le coefficient
            // rendu s'applique à elles (`base_quantity`), pas aux quantités
            // déjà ajustées une première fois.
            ingredients: c.lines.map((l) => ({
              nom: l.name,
              quantite: l.baseQuantity != null ? fr(l.baseQuantity) : l.quantity,
              unite: l.unit,
            })),
          },
          moules_reference: [],
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !(data?.coefficient > 0)) {
        dialog.alert(data?.erreur || data?.explication || 'L’ajustement n’a pas abouti.');
        return;
      }
      const baseIA: ScaleProposal = {
        factor: data.coefficient,
        moldCoefs: null,
        reason: data.explication || `Coefficient ×${fr(data.coefficient)}.`,
      };
      const propAvecPerte = appliquerPerte(baseIA, perteDe(c.id));
      setBasesSansPerte((p) => ({ ...p, [c.id]: baseIA }));
      setPropositions((p) => ({ ...p, [c.id]: propAvecPerte }));
      setSaisie((p) => ({ ...p, [c.id]: fr(propAvecPerte.factor) }));
      setIaConsommes((n) => n + 1);
    } catch {
      dialog.alert('L’ajustement n’a pas abouti.');
    } finally {
      setTravail(false);
    }
  }

  // Changer la perte recalcule aussitôt le coefficient depuis la proposition
  // d'origine (calcul pur, sans réseau : fluide à chaque frappe, y compris sur
  // mobile). Champ vide ou en cours de frappe = 0 %.
  function changerPerte(c: ProjectComponent, texte: string) {
    setPertes((p) => ({ ...p, [c.id]: texte }));
    // Sans proposition en mémoire (page rechargée), la base est le coefficient
    // en vigueur : la perte ne se compose jamais sur elle-même, on la fige ici.
    const base: ScaleProposal = basesSansPerte[c.id] ?? {
      factor: c.scaleFactor ?? 1,
      moldCoefs: null,
      reason: `Coefficient ×${fr(c.scaleFactor ?? 1)}.`,
    };
    if (!basesSansPerte[c.id]) setBasesSansPerte((p) => ({ ...p, [c.id]: base }));
    const v = parseFloat(texte.replace(',', '.'));
    const avec = appliquerPerte(base, isFinite(v) && v >= 0 ? v : 0);
    setPropositions((p) => ({ ...p, [c.id]: avec }));
    setSaisie((p) => ({ ...p, [c.id]: fr(avec.factor) }));
  }

  // Un coefficient saisi à la main devient la nouvelle base et la perte repart
  // à 0 % : c'est la décision de l'utilisateur, la perte peut ensuite s'y
  // ajouter en direct.
  function saisirCoefficient(c: ProjectComponent, texte: string) {
    setSaisie((p) => ({ ...p, [c.id]: texte }));
    const v = parseFloat(texte.replace(',', '.'));
    if (!(v > 0)) return;
    setBasesSansPerte((p) => ({
      ...p,
      [c.id]: { factor: v, moldCoefs: null, reason: `Coefficient ×${fr(v)} saisi à la main.` },
    }));
    setPertes((p) => ({ ...p, [c.id]: '0' }));
  }

  async function appliquer(c: ProjectComponent) {
    // Même repli que l'affichage du champ (`saisie[c.id] ?? fr(facteur)`) :
    // sans lui, cliquer « Appliquer » sans avoir touché un champ qui montre
    // pourtant « 1 » (le coefficient déjà en vigueur) déclenchait le message
    // « Indiquez un coefficient supérieur à zéro », incohérent avec ce qui
    // était affiché.
    const facteur = c.scaleFactor ?? 1;
    const brut = (saisie[c.id] ?? fr(facteur)).replace(',', '.');
    const factor = parseFloat(brut);
    if (!(factor > 0)) {
      dialog.alert('Indiquez un coefficient supérieur à zéro.');
      return;
    }
    const prop = propositions[c.id];
    const moldCoefs = prop && Math.abs(prop.factor - factor) < 1e-9 ? prop.moldCoefs : null;
    const reason =
      prop && Math.abs(prop.factor - factor) < 1e-9 ? prop.reason : `Coefficient ×${fr(factor)} saisi à la main.`;

    await mutate(
      async () => {
        const supabase = createClient();
        try {
          await applyComponentScale(supabase, c.lines, factor, moldCoefs, scalingCoef, scaledQuantityText);
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        const res = await supabase
          .from('recipe_project_components')
          .update({
            scale_factor: factor,
            scale_reason: reason,
            // L'ajustement global reprend la main : les lignes touchées à la
            // main gardent malgré tout leur valeur (leur `base_quantity` est
            // vide, `applyComponentScale` les ignore).
            manually_adjusted: false,
          } as never)
          .eq('id', c.id);
        if (res.error) return res;
        // Format pour lequel ces quantités sont calculées : sert à signaler
        // plus tard qu'elles sont périmées si le format change. Écrit à part,
        // en tolérant l'absence de la colonne (migration pas encore jouée) :
        // l'ajustement lui-même ne doit jamais échouer pour ça.
        await supabase
          .from('recipe_project_components')
          .update({ scale_format_key: cleFormat } as never)
          .eq('id', c.id);
        return res;
      },
      { errorLabel: 'Ajustement du composant' },
    );
  }

  async function editerLigne(c: ProjectComponent, lineId: number, valeur: string) {
    await mutate(
      async () => {
        const supabase = createClient();
        try {
          await setLineQuantity(supabase, lineId, valeur);
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        return supabase.from('recipe_project_components').update({ manually_adjusted: true } as never).eq('id', c.id);
      },
      { errorLabel: 'Modification de la quantité' },
    );
  }

  return (
    <section className="space-y-5">
      <LoadingOverlay visible={busy || travail} label={travail ? 'Calcul des quantités…' : undefined} />
      {!hideTitle && componentId == null && <h2 className="font-headline-md text-2xl text-primary">Quelles quantités ?</h2>}
      {componentId == null && <DessertVise project={project} formatLabel={formatLabel} />}
      {/* Le dessert visé reste sous les yeux dans le volet d'UNE préparation
          (v2) : les coefficients proposés en dépendent, et la carte complète
          est loin au-dessus quand on a déroulé plusieurs préparations. */}
      {componentId != null && (
        <p className="text-[12.5px] text-on-surface-variant">
          <span className="font-label-md uppercase tracking-widest text-secondary">Dessert visé</span>
          {' : '}
          {project.title}
          {' — '}
          {formatLabel}
          {project.servings ? ` · ${project.servings} parts` : ''}
        </p>
      )}

      {ordered.filter((c) => componentId == null || c.id === componentId).map((c) => {
        const facteur = c.scaleFactor ?? 1;
        const prop = propositions[c.id];
        const masseOrigine = masseGrammes(c.lines, true);
        const masseActuelle = masseGrammes(c.lines, false);
        const perime = quantitiesStale(c, cleFormat);
        return (
          <div key={c.id} className={componentId == null ? 'rounded-xl border border-outline-variant p-4' : ''}>
            {perime && (
              <p className="mb-3 flex items-start gap-2 rounded-lg border border-error/40 bg-error-container/40 px-3 py-2 text-[12.5px] text-on-error-container">
                <span className="material-symbols-outlined text-[18px] shrink-0">sync_problem</span>
                Ces quantités ont été calculées pour un autre format que le format visé actuel. Recalculez-les :
                « Proposer », puis « Appliquer ».
              </p>
            )}
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                {componentId == null && <h3 className="font-body-md text-[16px] font-semibold text-on-surface">{c.name}</h3>}
                <p className="text-[12px] text-on-surface-variant">
                  {COMPONENT_SOURCE_LABELS[c.source_kind as ComponentSourceKind] ?? c.source_kind}
                  {c.source_title && c.source_recipe_id ? (
                    <>
                      {' · '}
                      <a
                        href={`/recette/${c.source_recipe_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      >
                        {c.source_title}
                      </a>
                    </>
                  ) : c.source_title ? (
                    ` · ${c.source_title}`
                  ) : (
                    ''
                  )}
                  {c.manuallyAdjusted ? ' · ajusté à la main' : ''}
                </p>
              </div>
              <span className="font-label-md text-[12.5px] text-primary">×{fr(facteur)}</span>
            </div>


            {!c.resolved ? (
              <p className="text-[13px] italic text-on-surface-variant">
                Composant non résolu : choisissez d’abord une recette à l’étape précédente.
              </p>
            ) : (
              <>
                {/* Ce que produit la recette choisie (JEP-254, point 13) :
                    son rendement d'origine, et le poids de la préparation
                    avant / après ajustement. */}
                <dl className="mb-3 grid grid-cols-1 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-[auto_1fr]">
                  <dt className="text-outline">Recette d’origine</dt>
                  <dd className="flex items-start gap-2 text-on-surface">
                    <span>
                      {c.sourceYield
                        ? lignesRendement(c.sourceYield).map((l, i) => (
                            <span key={i} className="block">
                              {l}
                            </span>
                          ))
                        : 'rendement non précisé'}
                    </span>
                    {/* Recette d'origine dans un nouvel onglet (préparation copiée seulement). */}
                    {c.source_recipe_id && (
                      <a
                        href={`/recette/${c.source_recipe_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Voir la recette d'origine"
                        aria-label={`Voir la recette d'origine de ${c.name}`}
                        className="-my-1 shrink-0 rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                      >
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                      </a>
                    )}
                  </dd>
                  {masseActuelle != null && (
                    <>
                      <dt className="text-outline">Ingrédients pesés</dt>
                      <dd className="text-on-surface">
                        {masseOrigine != null && Math.abs(masseOrigine - masseActuelle) > 0.5
                          ? `${masseTexte(masseOrigine)} dans la recette d’origine → ${masseTexte(masseActuelle)} pour ce dessert`
                          : masseTexte(masseActuelle)}
                      </dd>
                    </>
                  )}
                </dl>

                <div className="mb-3">
                  <label className="mb-1 block font-label-md text-[11.5px] text-outline">
                    PRÉCISIONS POUR L’AJUSTEMENT PAR L’IA (FACULTATIF)
                  </label>
                  <textarea
                    value={contexteIA[c.id] ?? ''}
                    onChange={(e) => setContexteIA((p) => ({ ...p, [c.id]: e.target.value.slice(0, 450) }))}
                    rows={2}
                    placeholder="La recette d’origine donne deux fonds de tarte ; je veux une couche plus fine…"
                    className={`${champ} w-full`}
                  />
                </div>

                {/* Justification consultable en une phrase (§6.4) : la
                    proposition du moment, sinon celle qui a été appliquée.
                    Juste au-dessus du coefficient qu'elle explique. */}
                {(prop?.reason || c.scaleReason) && (
                  <p className="mb-3 rounded-lg bg-surface-container-low px-3 py-2 text-[12.5px] text-on-surface-variant">
                    {prop?.reason || c.scaleReason}
                  </p>
                )}

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void proposer(c)} className={btnGhost}>
                    Proposer d’après le format
                  </button>
                  <button
                    type="button"
                    onClick={() => void proposerIA(c)}
                    disabled={iaEpuise}
                    title={
                      iaEpuise
                        ? `Quota d’ajustements par IA atteint ce mois-ci (${iaLimite ?? '?'}/${iaLimite ?? '?'}). Le crédit se renouvelle à la prochaine période.`
                        : undefined
                    }
                    className={`${btnGhost} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    Ajuster avec l’IA
                  </button>
                  {iaRestants != null && (
                    <span
                      className={`text-[12px] ${iaEpuise ? 'text-error' : 'text-on-surface-variant'}`}
                      title="Ajustements par IA du mois (« Ajuster avec l’IA » des quantités). Les propositions de préparations du mode projet ont leur propre quota."
                    >
                      Utilisation quota IA : {(iaLimite ?? 0) - iaRestants}/{iaLimite} par mois
                    </span>
                  )}
                </div>

                {/* Perte et coefficient sur une seconde rangée : libellés de
                    même largeur, champs de même taille, donc alignés. */}
                <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <span
                    className="flex items-center gap-2"
                    title="Ce qui reste sur le fouet, dans les bols, sur les cuillères : s’ajoute au coefficient de départ (proposition, ou dernier coefficient saisi) et le recalcule à chaque modification."

                  >
                    <label className="w-24 font-label-md text-[12px] text-outline">PERTE (%)</label>
                    <input
                      value={pertes[c.id] ?? (basesSansPerte[c.id] ? '10' : '0')}
                      onChange={(e) => changerPerte(c, e.target.value)}
                      inputMode="decimal"
                      className={`${champ} w-24`}
                    />
                  </span>
                  <span className="flex items-center gap-2">
                    <label className="w-24 font-label-md text-[12px] text-outline">COEFFICIENT</label>
                    <input
                      value={saisie[c.id] ?? fr(facteur)}
                      onChange={(e) => saisirCoefficient(c, e.target.value)}
                      inputMode="decimal"
                      className={`${champ} w-24`}
                    />
                    <button type="button" onClick={() => void appliquer(c)} disabled={busy} className={btnPrimary}>
                      Appliquer
                    </button>
                  </span>
                </div>

                {c.lines.length > 0 && (
                  <ul className="space-y-1">
                    {c.lines.map((l) => {
                      const actuelle = parseFloat(String(l.quantity ?? '').replace(',', '.'));
                      // Quantité d'origine, à titre de repère : affichée en
                      // italique tant qu'un ajustement l'a réellement changée
                      // — inutile de la répéter à l'identique (facteur ×1, ou
                      // avant tout ajustement).
                      const montrerOrigine =
                        l.baseQuantity != null && (!isFinite(actuelle) || Math.abs(l.baseQuantity - actuelle) > 1e-9);
                      return (
                        <li key={l.id} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                          <span className="min-w-0 flex-1 text-on-surface">
                            {l.name}
                            {l.comment && <span className="italic text-on-surface-variant"> — {l.comment}</span>}
                          </span>
                          {montrerOrigine && (
                            <span
                              className="w-20 shrink-0 text-right text-[12px] italic text-on-surface-variant"
                              title="Quantité d’origine, avant ajustement"
                            >
                              {fr(l.baseQuantity as number)} {l.unit ?? ''}
                            </span>
                          )}
                          <input
                            // `key` porte la quantité et pas seulement l'id : le
                            // champ est non contrôlé (on n'écrit qu'à la sortie
                            // du champ, pas à la frappe), donc sans remontage il
                            // garderait sa valeur DOM après un ajustement global
                            // et afficherait l'ancienne quantité jusqu'au
                            // rechargement de la page.
                            key={`${l.id}-${l.quantity ?? ''}`}
                            defaultValue={l.quantity ?? ''}
                            onBlur={(e) => {
                              if ((e.target.value || '') !== (l.quantity ?? '')) void editerLigne(c, l.id, e.target.value);
                            }}
                            className={`${champ} w-24 py-1`}
                          />
                          <span className="w-20 text-[12.5px] text-on-surface-variant">{l.unit ?? ''}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-2 text-[11.5px] text-outline">
                  Une quantité modifiée à la main n’est plus recalculée par un changement de coefficient.
                </p>
                {pied}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
