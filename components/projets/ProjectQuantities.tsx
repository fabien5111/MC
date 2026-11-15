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
import { useSeuilsArrondi } from '@/components/SeuilsArrondiProvider';
import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import ChoixLignesManuelles, { type LigneManuelleChoix } from '@/components/projets/ChoixLignesManuelles';
import { useLecons } from '@/components/batch/DerniereFois';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { moldMetrics } from '@/lib/recipe-view';
import { applyComponentScale, setLineQuantity } from '@/lib/projects-write';
import {
  COMPONENT_SOURCE_LABELS,
  coefPreparation,
  baseDeLigne,
  lignesManuelles,
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
import { COUT_AJUSTEMENT, libelleCredits } from '@/lib/credits-ia';

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
function masseGrammes(
  lines: ProjectComponent['lines'],
  base: boolean,
  estimer?: EstimerMasse,
): { grammes: number; horsTotal: string[] } | null {
  // Avec le référentiel (conversions, masse volumique) : un lait ou une crème
  // en cl / ml compte dans la masse, au lieu d'être ignoré en silence.
  if (estimer) {
    const ls = lines.map((l) => {
      const q = base ? l.baseQuantity : parseFloat(String(l.quantity ?? '').replace(',', '.'));
      return { name: l.name, quantity: q != null && isFinite(q) ? q : null, unit: l.unit };
    });
    const e = estimer(ls.filter((l) => l.quantity != null));
    // Une ligne non chiffrée (« 1 pincée ») n'a pas à être signalée : elle ne pèse rien.
    return e.grammes > 0 ? { grammes: e.grammes, horsTotal: e.nonConvertis } : null;
  }
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
  return vu ? { grammes: total, horsTotal: [] } : null;
}

// Estimation de masse par le référentiel, fournie par la page (`estimateWeightGrams`).
export type EstimerMasse = (
  lignes: { name: string; quantity: number | null; unit: string | null }[],
) => { grammes: number; nonConvertis: string[] };

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
  etapeIds,
  quotaAjustementIA = null,
  suggestion = null,
  estimerMasse,
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
  // v2 : étapes de la préparation. Sert à retirer la justification « Fournée
  // d’essai : … » quand plus aucun retour épinglé avec un écart ne la porte.
  etapeIds?: number[];
  // État du quota `ajustement_ia_mensuel` (`mc_check_quota`, affichage seulement,
  // lu par la page) : sert à montrer les crédits restants et à griser « Ajuster
  // avec l'IA » une fois le quota atteint. `null` = pas de droit, ou lecture
  // absente : rien n'est affiché. La vraie garde reste `mc_consume` côté route.
  quotaAjustementIA?: { allowed: boolean; limit?: number; usage?: number } | null;
  // v2 : coefficient proposé depuis l'extérieur (quantité obtenue d'une
  // fournée d'essai, « 50 g en trop ») pour la préparation `componentId`.
  // Prérempli comme une saisie à la main (perte à 0 % : l'écart mesuré
  // l'inclut déjà), jamais appliqué tout seul. `n` change à chaque demande.
  suggestion?: { factor: number; reason: string; n: number } | null;
  // Format visé, en clair (« Cercle Ø 20 × 4 cm ») : sert à décrire la cible
  // à l'IA quand la géométrie ne suffit pas.
  formatLabel: string;
  // Masse par le référentiel (conversions, masse volumique) : sans lui, seules
  // les lignes en g / kg comptent dans « Ingrédients pesés ».
  estimerMasse?: EstimerMasse;
}) {
  const dialog = useDialog();
  // Seuils d'arrondi à l'unité des quantités calculées (JEP-389).
  const seuils = useSeuilsArrondi();
  const lecons = useLecons();
  // La justification posée par « Modifier les quantités avec ce coefficient »
  // (retour de fournée) n'a plus d'objet une fois le retour désépinglé.
  const raisonVisible = (raison: string | null | undefined) => {
    if (!raison || !raison.startsWith('Fournée d’essai :')) return raison;
    if (!lecons?.gestion || !etapeIds) return raison;
    const porteur = etapeIds.some((id) =>
      (lecons.lecons.parEtape[id]?.remarques ?? []).some((r) => r.ecartProduit && lecons.epinglee(r)),
    );
    return porteur ? raison : null;
  };
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
  const iaEpuise =
    quotaAjustementIA != null && (!quotaAjustementIA.allowed || (iaRestants != null && iaRestants < COUT_AJUSTEMENT));
  const [propositions, setPropositions] = useState<Record<number, ScaleProposal>>({});
  const [saisie, setSaisie] = useState<Record<number, string>>({});
  // Précisions libres pour l'ajustement par IA, par composant (JEP-254,
  // point 15) — « la recette d'origine est pour 2 fonds », « je veux une
  // couche plus épaisse »…
  const [contexteIA, setContexteIA] = useState<Record<number, string>>({});
  // Complément d'informations de la recette d'origine : replié par défaut, une
  // seule ligne visible (JEP-403). Réglage d'affichage, jamais enregistré.
  const [complementOuvert, setComplementOuvert] = useState<Record<number, boolean>>({});
  // Fenêtre « appliquer aussi aux lignes manuelles ? » : la promesse de
  // `appliquer` attend le choix du membre (lignes retenues, ou null = annulé).
  const [choixManuel, setChoixManuel] = useState<{
    coefficient: string;
    lignes: LigneManuelleChoix[];
    resoudre: (incluses: Set<number> | null) => void;
  } | null>(null);
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

  useEffect(() => {
    if (!suggestion || componentId == null) return;
    const prop: ScaleProposal = { factor: suggestion.factor, moldCoefs: null, reason: suggestion.reason };
    setSaisie((p) => ({ ...p, [componentId]: fr(suggestion.factor) }));
    setBasesSansPerte((p) => ({ ...p, [componentId]: prop }));
    setPropositions((p) => ({ ...p, [componentId]: prop }));
    setPertes((p) => ({ ...p, [componentId]: '0' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion?.n]);

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
      const masseBase = masseGrammes(c.lines, true, estimerMasse)?.grammes ?? null;
      const autres = ordered.filter((o) => o.id !== c.id).map((o) => `${o.name}${o.role ? ` (${o.role})` : ''}`);
      const prompt = [
        `Adapter la préparation « ${c.name} »${c.role ? `, rôle : ${c.role},` : ''} au dessert « ${project.title} » :`,
        `format ${formatLabel}, ${project.servings ?? '?'} parts.`,
        autres.length ? `Les autres préparations de l’assemblage sont : ${autres.join(', ')}.` : null,
        masseBase ? `La recette telle que saisie produit environ ${masseTexte(masseBase)}.` : null,
        c.role
          ? `Si cette préparation est un insert, une garniture ou une couche intermédiaire, raisonne en COUCHE (dimensions et épaisseur compatibles avec le format ci-dessus, plus petite que le dessert), pas en remplissage du moule entier.`
          : null,
        mode && mode !== 'aucun' && MODE_LABEL[mode] ? `Cette préparation ${MODE_LABEL[mode]}.` : null,
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

  // Ajustement par le poids (JEP-403) : le pâtissier sait souvent ce qu'il
  // veut obtenir (« 300 g de ganache »). Coefficient = poids visé ÷ masse de
  // la recette d'origine (quantités de base, celles que multiplie tout
  // ajustement), estimée par le référentiel. La perte s'y ajoute comme pour
  // les autres propositions : le poids visé est ce qui doit arriver dans le
  // dessert.
  const [poidsVise, setPoidsVise] = useState<Record<number, string>>({});
  function proposerPoids(c: ProjectComponent) {
    const cibleG = parseFloat((poidsVise[c.id] ?? '').replace(',', '.'));
    if (!(cibleG > 0)) {
      dialog.alert('Indiquez le poids visé, en grammes.');
      return;
    }
    const origine = masseGrammes(c.lines, true, estimerMasse);
    if (!origine || !(origine.grammes > 0)) {
      dialog.alert('Le poids de cette préparation n’a pas pu être estimé (aucun ingrédient pesable) : saisissez le coefficient.');
      return;
    }
    const factor = round2(cibleG / origine.grammes);
    if (!(factor > 0)) {
      dialog.alert('Le poids visé est trop faible pour cette préparation.');
      return;
    }
    const hors = origine.horsTotal.length ? ` Hors calcul (conversion inconnue) : ${origine.horsTotal.join(', ')}.` : '';
    const base: ScaleProposal = {
      factor,
      moldCoefs: null,
      reason: `Poids visé ${masseTexte(cibleG)} ÷ ${masseTexte(origine.grammes)} (recette d’origine) = ×${fr(factor)}.${hors}`,
    };
    const avec = appliquerPerte(base, perteDe(c.id));
    setBasesSansPerte((p) => ({ ...p, [c.id]: base }));
    setPropositions((p) => ({ ...p, [c.id]: avec }));
    setSaisie((p) => ({ ...p, [c.id]: fr(avec.factor) }));
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
    const texteQte = (b: number | null, c2: number, u?: string | null) => scaledQuantityText(b, c2, u, seuils);

    // Lignes retouchées à la main : le membre choisit celles qui suivent aussi
    // le nouveau coefficient (toutes cochées d'office). Celles qu'il décoche
    // gardent leur quantité.
    const manuelles = lignesManuelles(c);
    const ignorer = new Set<number>();
    if (manuelles.length > 0) {
      const choix: LigneManuelleChoix[] = manuelles.map((l) => {
        const base = baseDeLigne(l);
        const coef = coefPreparation(l.scalingMode, factor, moldCoefs);
        const unite = l.unit ? ` ${l.unit}` : '';
        return {
          id: l.id,
          nom: l.name,
          commentaire: l.comment,
          actuelle: `${l.quantity ?? ''}${unite}`,
          proposee: `${texteQte(base, coef, l.unit) ?? ''}${unite}`,
          origineConnue: l.baseQuantity != null,
        };
      });
      const incluses = await new Promise<Set<number> | null>((resoudre) =>
        setChoixManuel({ coefficient: fr(factor), lignes: choix, resoudre }),
      );
      setChoixManuel(null);
      if (incluses === null) return;
      manuelles.forEach((l) => {
        if (!incluses.has(l.id)) ignorer.add(l.id);
      });
    }

    await mutate(
      async () => {
        const supabase = createClient();
        try {
          await applyComponentScale(supabase, c.lines, factor, moldCoefs, coefPreparation, texteQte, ignorer);
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        const res = await supabase
          .from('recipe_project_components')
          .update({
            scale_factor: factor,
            scale_reason: reason,
            // Les lignes retouchées à la main que le membre a laissées telles
            // quelles restent signalées ; sinon l'ajustement global reprend la main.
            manually_adjusted: ignorer.size > 0,
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
    // Préparation jamais ajustée (×1) et ligne sans base : la quantité d'avant la
    // retouche EST l'origine, on la garde sous les yeux.
    const ligne = c.lines.find((x) => x.id === lineId);
    const avant = parseFloat(String(ligne?.quantity ?? '').replace(',', '.'));
    const baseSiAbsente = ligne && ligne.baseQuantity == null && (c.scaleFactor ?? 1) === 1 && isFinite(avant) ? avant : null;
    await mutate(
      async () => {
        const supabase = createClient();
        try {
          await setLineQuantity(supabase, lineId, valeur, baseSiAbsente);
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
        const masseOrigine = masseGrammes(c.lines, true, estimerMasse);
        const masseActuelle = masseGrammes(c.lines, false, estimerMasse);
        const perime = quantitiesStale(c, cleFormat);
        const manuellesIds = new Set(lignesManuelles(c).map((x) => x.id));
        return (
          <div key={c.id} className={componentId == null ? 'rounded-xl border border-outline-variant p-4' : ''}>
            {perime && (
              <p className="mb-3 flex items-start gap-2 rounded-lg border border-error/40 bg-error-container/40 px-3 py-2 text-[12.5px] text-on-error-container">
                <span className="material-symbols-outlined text-[18px] shrink-0">sync_problem</span>
                Ces quantités ont été calculées pour un autre format que le format visé actuel. Recalculez-les :
                « Proposer », puis « Appliquer ».
              </p>
            )}
            {/* Le nom de la recette d'origine vit dans « Recette d'origine » ; le
                coefficient est déjà dans le titre du volet (préparation seule). */}
            {(componentId == null || c.manuallyAdjusted) && (
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  {componentId == null && <h3 className="font-body-md text-[16px] font-semibold text-on-surface">{c.name}</h3>}
                  {c.manuallyAdjusted && <p className="text-[12px] text-on-surface-variant">Ajusté à la main</p>}
                </div>
                {componentId == null && <span className="font-label-md text-[12.5px] text-primary">×{fr(facteur)}</span>}
              </div>
            )}

            {!c.resolved ? (
              <p className="text-[13px] italic text-on-surface-variant">
                Composant non résolu : choisissez d’abord une recette à l’étape précédente.
              </p>
            ) : (
              <>
                {/* Ce que produit la recette choisie (JEP-254, point 13) :
                    son rendement d'origine, et le poids de la préparation
                    avant / après ajustement. */}
                {(() => {
                  const lignes = c.sourceYield ? lignesRendement(c.sourceYield) : [];
                  const reste = lignes.slice(1);
                  const ecart = masseActuelle != null && masseOrigine != null && Math.abs(masseOrigine.grammes - masseActuelle.grammes) > 0.5;
                  const poids = masseOrigine ?? masseActuelle;
                  const plus = reste.length > 0 || poids != null;
                  const ouvert = !!complementOuvert[c.id];
                  const sourceLabel = COMPONENT_SOURCE_LABELS[c.source_kind as ComponentSourceKind] ?? c.source_kind;
                  return (
                    <dl className="mb-3 grid grid-cols-1 gap-x-4 gap-y-1 text-[12.5px] sm:grid-cols-[auto_1fr]">
                      <dt className="text-outline">Recette d’origine</dt>
                      <dd className="text-on-surface">
                        {/* Première ligne : d'où vient la recette (lien vers elle). */}
                        <span className="block">
                          {sourceLabel}
                          {c.source_title && c.source_recipe_id ? (
                            <>
                              {' · '}
                              <a
                                href={`/recette/${c.source_recipe_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Voir la recette d'origine"
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
                        </span>
                        {/* Complément d'informations : première ligne seule, le reste se déplie. */}
                        <span className="flex items-start gap-1.5">
                          <span className="block">{lignes[0] ?? 'rendement non précisé'}</span>
                          {plus && (
                            <button
                              type="button"
                              onClick={() => setComplementOuvert((p) => ({ ...p, [c.id]: !ouvert }))}
                              aria-expanded={ouvert}
                              title={ouvert ? 'Voir moins' : 'Voir plus'}
                              aria-label={ouvert ? 'Voir moins' : 'Voir plus'}
                              className="shrink-0 text-on-surface-variant transition-colors hover:text-primary"
                            >
                              <span className="material-symbols-outlined block text-[18px] leading-none">
                                {ouvert ? 'expand_less' : 'expand_more'}
                              </span>
                            </button>
                          )}
                        </span>
                        {plus && ouvert && (
                          <span className="mt-1 block">
                            {reste.map((l, i) => (
                              <span key={i} className="block">
                                {l}
                              </span>
                            ))}
                            {poids != null && (
                              <span className="mt-1 block">
                                <span className="text-outline">Poids des ingrédients de la recette d’origine : </span>
                                {masseTexte(poids.grammes)}
                                {ecart && masseActuelle != null ? ` → ${masseTexte(masseActuelle.grammes)} pour ce dessert` : ''}
                                {poids.horsTotal.length > 0 && (
                                  <span className="block text-[12px] text-outline">
                                    Hors total (conversion inconnue) : {poids.horsTotal.join(', ')}
                                  </span>
                                )}
                              </span>
                            )}
                          </span>
                        )}
                      </dd>
                    </dl>
                  );
                })()}

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
                {(prop?.reason || raisonVisible(c.scaleReason)) && (
                  <p className="mb-3 rounded-lg bg-surface-container-low px-3 py-2 text-[12.5px] text-on-surface-variant">
                    {prop?.reason || raisonVisible(c.scaleReason)}
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
                        ? `Crédits IA épuisés ce mois-ci (${iaLimite ?? '?'}/${iaLimite ?? '?'}). Ils se renouvellent à la prochaine période.`
                        : undefined
                    }
                    className={`${btnGhost} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    Ajuster avec l’IA · {libelleCredits(COUT_AJUSTEMENT)} IA
                  </button>
                  {iaRestants != null && (
                    <span
                      className={`text-[12px] ${iaEpuise ? 'text-error' : 'text-on-surface-variant'}`}
                      title="Crédits IA du mois, communs à l’import, à l’ajustement et au mode projet."
                    >
                      (il vous en reste {iaRestants} ce mois-ci)
                    </span>
                  )}
                </div>

                {/* Poids visé (JEP-403) : une troisième façon de proposer un
                    coefficient, à côté du format et de l'IA. */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <label htmlFor={`poids-${c.id}`} className="w-24 font-label-md text-[12px] text-outline">
                    POIDS VISÉ (G)
                  </label>
                  <input
                    id={`poids-${c.id}`}
                    value={poidsVise[c.id] ?? ''}
                    onChange={(e) => setPoidsVise((p) => ({ ...p, [c.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') proposerPoids(c);
                    }}
                    inputMode="decimal"
                    placeholder={masseActuelle ? String(Math.round(masseActuelle.grammes)) : undefined}
                    className={`${champ} w-24`}
                  />
                  <button type="button" onClick={() => proposerPoids(c)} className={btnGhost}>
                    Proposer d’après ce poids
                  </button>
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
                  <div className="overflow-x-auto">
                  <ul className="min-w-[440px] space-y-1">
                    {/* En-têtes (JEP-403) : « Origine » calé à droite au-dessus des
                        quantités de base, « Ce dessert » centré sur le champ de
                        saisie seul (mêmes largeurs que les lignes ci-dessous). */}
                    <li aria-hidden className="flex items-center gap-2 font-label-md text-[10px] uppercase tracking-wider text-outline">
                      <span className="min-w-0 flex-1" />
                      <span className="w-20 shrink-0 text-right">Origine</span>
                      <span className="w-16 shrink-0" />
                      <span className="w-24 shrink-0 text-center">Ce dessert</span>
                      <span className="w-14 shrink-0" />
                    </li>
                    {c.lines.map((l) => {
                      const texteQte = String(l.quantity ?? '').trim().replace(',', '.');
                      const actuelle = texteQte === '' ? NaN : Number(texteQte);
                      // Une ligne « manuelle » : voir `lignesManuelles` (drapeau
                      // `quantity_manual`, ou ancien marquage sans origine).
                      const manuelle = manuellesIds.has(l.id);
                      // Origine : la base enregistrée ; sans base, la quantité
                      // elle-même tant que la ligne n'est pas manuelle (rien n'a
                      // encore changé) ; vide pour une ligne manuelle ou non chiffrée.
                      const origine = l.baseQuantity != null ? l.baseQuantity : manuelle || !isFinite(actuelle) ? null : actuelle;
                      const inchangee = origine != null && isFinite(actuelle) && Math.abs(origine - actuelle) < 1e-9;
                      // Coefficient de la ligne : calculé à l'affichage, jamais stocké.
                      const coefLigne = origine != null && origine !== 0 && isFinite(actuelle) ? actuelle / origine : null;
                      return (
                        <li key={l.id} className="flex items-center gap-2 text-[13.5px]">
                          <span className="min-w-0 flex-1 text-on-surface">
                            {l.name}
                            {l.comment && <span className="italic text-on-surface-variant"> — {l.comment}</span>}
                          </span>
                          <span
                            className={`w-20 shrink-0 text-right text-[12px] italic tabular-nums text-on-surface-variant ${inchangee ? 'opacity-55' : ''}`}
                            title={origine != null ? 'Quantité d’origine, avant ajustement' : undefined}
                          >
                            {origine != null ? `${fr(origine)} ${l.unit ?? ''}` : ''}
                          </span>
                          <span className="flex w-16 shrink-0 justify-center">
                            {manuelle ? (
                              <span
                                className="rounded-pill bg-secondary-container px-2 py-px text-[11px] text-on-secondary-container"
                                title="Quantité modifiée à la main : cette ligne ne suit plus le coefficient de la préparation."
                              >
                                manuel
                              </span>
                            ) : coefLigne != null ? (
                              <span
                                className={`rounded-pill px-2 py-px text-[11px] tabular-nums ${
                                  inchangee ? 'text-outline' : 'bg-surface-container text-secondary'
                                }`}
                                title="Quantité actuelle ÷ quantité d’origine"
                              >
                                ×{fr(coefLigne)}
                              </span>
                            ) : null}
                          </span>
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
                            className={`${champ} w-24 shrink-0 py-1 text-right tabular-nums ${
                              manuelle ? 'border-secondary bg-primary-fixed/60' : ''
                            }`}
                          />
                          <span className="w-14 shrink-0 text-[12.5px] text-on-surface-variant">{l.unit ?? ''}</span>
                        </li>
                      );
                    })}
                  </ul>
                  </div>
                )}
                {pied}
              </>
            )}
          </div>
        );
      })}
      {choixManuel && (
        <ChoixLignesManuelles
          coefficient={choixManuel.coefficient}
          lignes={choixManuel.lignes}
          onConfirm={(incluses) => choixManuel.resoudre(incluses)}
          onCancel={() => choixManuel.resoudre(null)}
        />
      )}
    </section>
  );
}
