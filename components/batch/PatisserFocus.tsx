'use client';

// Mode Pâtisser « une étape à la fois » : téléphone et tablette (sous 1024 px).
//
// Une étape occupe l'écran ; la jauge du haut montre toutes les étapes (vert =
// terminée, marron = il reste quelque chose à faire) et permet d'y sauter. Les
// boutons du bas servent SEULEMENT à se déplacer : une étape se termine par la
// case de son titre, ou toute seule quand ses sous-étapes et ingrédients sont
// cochés (mêmes règles que le déroulé, `gestesEtape`). Sur la dernière étape,
// le bouton de droite ouvre l'écran de fin de fournée.
//
// Ce qui sert à RÉALISER l'étape est en tête : « Ma note » avec les retours de
// mes fournées (réduits à une ligne), puis les photos en vignettes. Ce qui se
// constate APRÈS (commentaire, quantité obtenue) est en bas, dans « Fin
// d'étape ». Le déroulé complet reste celui de l'ordinateur et de l'impression.
import { useEffect, useRef, useState } from 'react';
import { NomIngredient } from '@/components/IngredientNomsProvider';
import { ARacheterButton } from '@/components/batch/ARacheterButton';
import { EcartProduitChamp } from '@/components/batch/EcartProduitChamp';
import { DerniereFoisEtape, RetoursIngredient, RetoursSousEtape, useLecons } from '@/components/batch/DerniereFois';
import { PhotosEtapeVignettes } from '@/components/batch/PhotosFournee';
import { PointsAVerifierFournee } from '@/components/batch/PointsAVerifierFournee';
import { gestesEtape } from '@/components/batch/gestes-etape';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';
import { ReplieUneLigne } from '@/components/ReplieUneLigne';
import { ingredientConversionText, shortUnitLbl, type ConversionRef, type UnitRef } from '@/lib/ingredient-conversions';
import { etapesOrdonnees, ingredientsEtapeCuisine, type EtapeOrdonnee } from '@/lib/patisser-focus';
import { fmtNum, type BatchFull, type BatchIngredientRow, type BatchJalon, type BatchSubstepRow, type SubstepMatchIngredient } from '@/lib/recipe-plan';

type Rappels = {
  onToggleStep: (id: number, checked: boolean, defiler?: boolean) => void;
  onToggleSub: (id: number, checked: boolean) => void;
  onSubComment: (id: number, value: string) => void;
  onToggleIng: (id: number, checked: boolean) => void;
  onIngReal: (id: number, value: string) => void;
  onIngComment: (id: number, value: string) => void;
  onStepComment: (id: number, value: string) => void;
  onStepEcart: (id: number, value: number | null) => void;
};

const jourLong = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

// Jour réel d'un jalon : dégustation (ou date prévue) moins son décalage.
function dateDuJalon(batch: BatchFull, offset: number): Date | null {
  const base = batch.degustation_at ? new Date(batch.degustation_at) : batch.planned_date ? new Date(batch.planned_date + 'T00:00:00') : null;
  if (!base) return null;
  base.setDate(base.getDate() - (offset || 0));
  return base;
}

const qteTexte = (q: number | null | undefined, texte: string | null | undefined, unite: string | null | undefined) =>
  [q != null ? fmtNum(q) : texte || '', unite ? shortUnitLbl(unite) : ''].filter(Boolean).join(' ');

// Picto « note » d'une ligne : vert quand une note est enregistrée.
function BoutonNote({ ouvert, aNote, onClick, libelle }: { ouvert: boolean; aNote: boolean; onClick: () => void; libelle: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ouvert}
      aria-label={libelle}
      title={libelle}
      className={`no-print shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${aNote ? 'bg-green-50 text-green-800' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
    >
      <span className="material-symbols-outlined text-[22px]">edit_note</span>
    </button>
  );
}

function LigneIngredient({
  ing,
  stepId,
  g,
  conversions,
  units,
  peutRacheter,
  onIngReal,
  onIngComment,
}: {
  ing: BatchIngredientRow;
  stepId: number;
  g: ReturnType<typeof gestesEtape>;
  conversions: ConversionRef[];
  units: UnitRef[];
  peutRacheter: boolean;
  onIngReal: Rappels['onIngReal'];
  onIngComment: Rappels['onIngComment'];
}) {
  const [ouvert, setOuvert] = useState(false);
  const excluded = g.cookExcluded(ing);
  const locked = g.ingredientVerrouille(ing);
  const struck = ing.done || excluded ? ' line-through opacity-50' : '';
  const prevu = qteTexte(ing.quantity, ing.quantity_text, ing.unit);
  const conv = ingredientConversionText(conversions, units, ing.ref_id, ing.unit, ing.quantity ?? ing.quantity_text);
  const reel = ing.real_quantity != null && ing.real_quantity !== ing.quantity ? qteTexte(ing.real_quantity, null, ing.unit) : '';
  const aNote = !!(ing.commentaire || reel);
  return (
    <li className="border-b border-outline-variant/30 py-1.5">
      <div className="flex items-center gap-2">
        <label className={`flex flex-1 min-w-0 items-center gap-3 py-1 ${locked ? '' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={ing.done || excluded}
            disabled={locked}
            onChange={(ev) => g.cocherIngredient(ing, ev.target.checked)}
            className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary shrink-0"
          />
          <span className={`w-[4.75rem] shrink-0 text-right font-bold tabular-nums text-primary leading-tight${struck}`}>{prevu}</span>
          <span className={`flex-1 min-w-0 font-body-md text-[16px] leading-snug${struck}`}>
            <NomIngredient nom={ing.name} quantite={ing.quantity ?? ing.quantity_text} unite={ing.unit} refId={ing.ref_id} />
            {ing.comment && <span className="italic text-on-surface-variant"> ({ing.comment})</span>}
            {conv && <span className="block text-[12px] text-on-surface-variant">{conv}</span>}
          </span>
        </label>
        {(!locked || aNote || peutRacheter) && (
          <BoutonNote ouvert={ouvert} aNote={aNote} onClick={() => setOuvert((o) => !o)} libelle={`Noter sur « ${ing.name} »`} />
        )}
      </div>
      {ouvert ? (
        <div className="ml-9 mt-1 mb-1 flex flex-col gap-2 rounded-lg border border-green-700 bg-green-50 p-2">
          <label className="flex items-center gap-2 text-[13px] text-on-surface-variant">
            Quantité utilisée
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder={ing.quantity != null ? fmtNum(ing.quantity) : 'réel'}
              disabled={locked}
              defaultValue={ing.real_quantity != null ? ing.real_quantity : ''}
              onBlur={(ev) => onIngReal(ing.id, ev.target.value)}
              className="w-20 border border-outline-variant rounded px-2 py-1.5 text-center bg-white"
            />
            <span>{ing.unit ? shortUnitLbl(ing.unit) : ''}</span>
            <span className="ml-auto text-[12px]">prévu {prevu}</span>
          </label>
          <input
            type="text"
            placeholder="Note (ex : trop sec, viser +10 g)"
            disabled={locked}
            defaultValue={ing.commentaire || ''}
            onBlur={(ev) => onIngComment(ing.id, ev.target.value)}
            className="border border-outline-variant rounded px-2 py-1.5 bg-white"
          />
          <div className="flex items-center justify-between gap-2">
            <ARacheterButton nom={ing.name} refId={ing.ref_id} autorise={peutRacheter} />
            <button type="button" onClick={() => setOuvert(false)} className="rounded-lg bg-green-700 px-4 py-1.5 font-label-md text-[13px] text-white">
              OK
            </button>
          </div>
        </div>
      ) : (
        aNote && (
          <p className="ml-9 mb-1 border-l-[3px] border-green-700 bg-green-50 rounded-r px-2 py-1 text-[13px] text-green-900">
            {[reel && `${reel} utilisés au lieu de ${prevu}`, ing.commentaire].filter(Boolean).join(' · ')}
          </p>
        )
      )}
      <ReplieUneLigne className="ml-9" hauteur={26}>
        <RetoursIngredient stepId={stepId} ingredientId={ing.id} />
      </ReplieUneLigne>
    </li>
  );
}

function LigneSousEtape({
  su,
  stepId,
  g,
  ingredientsNommes,
  conversions,
  units,
  onSubComment,
}: {
  su: BatchSubstepRow;
  stepId: number;
  g: ReturnType<typeof gestesEtape>;
  ingredientsNommes: SubstepMatchIngredient[];
  conversions: ConversionRef[];
  units: UnitRef[];
  onSubComment: Rappels['onSubComment'];
}) {
  const [ouvert, setOuvert] = useState(false);
  const excluded = g.subExcluded(su);
  const locked = g.sousEtapeVerrouillee(su);
  const struck = su.done || excluded ? ' line-through opacity-50' : '';
  return (
    <li className="py-1">
      <div className="flex items-start gap-2">
        <label className={`flex flex-1 min-w-0 items-start gap-3 py-1 ${locked ? '' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={su.done || excluded}
            disabled={locked}
            onChange={(ev) => g.cocherSousEtape(su, ev.target.checked)}
            className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary shrink-0 mt-0.5"
          />
          <span className={`font-body-md text-[16px] leading-relaxed${struck}`}>{su.texte}</span>
        </label>
        {(!locked || !!su.commentaire) && (
          <BoutonNote ouvert={ouvert} aNote={!!su.commentaire} onClick={() => setOuvert((o) => !o)} libelle="Noter sur ce geste" />
        )}
      </div>
      {ingredientsNommes.length > 0 && (
        <ul className="ml-9 flex flex-col gap-0.5">
          {ingredientsNommes.map((it) => {
            const q = qteTexte(it.quantity, it.quantity_text, it.unit);
            const conv = ingredientConversionText(conversions, units, it.ref_id, it.unit, it.quantity ?? it.quantity_text);
            return (
              <li key={it.id} className={`text-[12px] font-label-md text-on-surface-variant${struck}`}>
                <NomIngredient nom={it.name} quantite={it.quantity ?? it.quantity_text} unite={it.unit} refId={it.ref_id} />
                {q && <> — {q}</>}
                {conv && <span className="block">{conv}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <ReplieUneLigne hauteur={28}>
        <RetoursSousEtape stepId={stepId} texte={su.texte} />
      </ReplieUneLigne>
      {ouvert ? (
        <div className="ml-9 mt-1 flex gap-2 rounded-lg border border-green-700 bg-green-50 p-2">
          <input
            type="text"
            placeholder="Note sur ce geste"
            disabled={locked}
            defaultValue={su.commentaire || ''}
            onBlur={(ev) => onSubComment(su.id, ev.target.value)}
            className="min-w-0 flex-1 border border-outline-variant rounded px-2 py-1.5 bg-white"
          />
          <button type="button" onClick={() => setOuvert(false)} className="rounded-lg bg-green-700 px-4 py-1.5 font-label-md text-[13px] text-white">
            OK
          </button>
        </div>
      ) : (
        su.commentaire && <p className="ml-9 mt-0.5 border-l-[3px] border-green-700 bg-green-50 rounded-r px-2 py-1 text-[13px] text-green-900">{su.commentaire}</p>
      )}
    </li>
  );
}

// « Ma note » de l'étape et retours de mes fournées : un seul bloc, réduit à sa
// première ligne (« Tout afficher » pour le reste).
function NoteEtRetours({ stepId, note }: { stepId: number; note: string | null }) {
  const lecons = useLecons();
  const nbRetours = (lecons?.lecons.parEtape[stepId]?.remarques ?? []).filter((r) => r.nature === 'etape').length;
  if (!note && !nbRetours) return null;
  return (
    <div className="rounded-xl border border-secondary-container bg-secondary-container/30 px-3 py-2.5">
      <p className="mb-1 flex items-center gap-1.5 font-label-md text-[11px] uppercase tracking-widest text-secondary">
        <span className="material-symbols-outlined text-[18px]">{note ? 'sticky_note_2' : 'history'}</span>
        {note ? 'Ma note' : 'Retours de mes fournées'}
        {note && nbRetours > 0 && (
          <span className="ml-auto rounded-full bg-primary px-2 normal-case tracking-normal text-[11px] text-on-primary">
            + {nbRetours} retour{nbRetours > 1 ? 's' : ''}
          </span>
        )}
      </p>
      <ReplieUneLigne hauteur={23}>
        {note && <div className="font-body-md text-[15px] leading-[23px] whitespace-pre-line">{note}</div>}
        {nbRetours > 0 && (
          <div className={note ? 'mt-2 border-t border-dashed border-secondary/40 pt-2' : ''}>
            <DerniereFoisEtape stepId={stepId} />
          </div>
        )}
      </ReplieUneLigne>
    </div>
  );
}

function CarteEtape({
  batch,
  e,
  rang,
  total,
  jalon,
  readOnly,
  conversions,
  units,
  peutRacheter,
  pointsAVerifier,
  photosRecette,
  rappels,
}: {
  batch: BatchFull;
  e: EtapeOrdonnee;
  rang: number;
  total: number;
  jalon: BatchJalon;
  readOnly: boolean;
  conversions: ConversionRef[];
  units: UnitRef[];
  peutRacheter: boolean;
  pointsAVerifier: string | null;
  photosRecette: { url: string; ai_retouched: boolean }[];
  rappels: Rappels;
}) {
  const s = e.step;
  const ingredients = ingredientsEtapeCuisine(batch, s);
  const g = gestesEtape(s, ingredients, readOnly, rappels);
  const jour = dateDuJalon(batch, jalon.offset);
  const [finOuvert, setFinOuvert] = useState(false);
  const ecartSaisi = (s as { ecart_produit_g?: number | null }).ecart_produit_g != null;
  const finVisible = g.complete || finOuvert || !!s.commentaire || ecartSaisi;
  // Étape qui VIENT d'être terminée (case du titre ou dernier geste coché) : on
  // emmène le membre vers « Fin d'étape », où se saisit le constat. Jamais à
  // l'ouverture d'une étape déjà terminée (la carte est remontée à chaque
  // changement d'étape : la référence part de l'état initial).
  const finRef = useRef<HTMLElement>(null);
  const etaitTerminee = useRef(g.complete);
  useEffect(() => {
    if (g.complete && !etaitTerminee.current && !window.matchMedia('(min-width: 1024px)').matches) {
      const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      requestAnimationFrame(() => requestAnimationFrame(() => finRef.current?.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'center' })));
    }
    etaitTerminee.current = g.complete;
  }, [g.complete]);
  const titreJour = (jalon.offset > 0 ? `Jour J − ${jalon.offset}` : 'Jour J') + (jour ? ` · ${jourLong(jour)}` : '');
  // Temps seulement : l'état de l'étape se lit à la couleur du titre et de la
  // jauge. « Déjà réalisée avant la fournée » reste dit, lui, car il change
  // ce que l'étape demande.
  const enAmont = !!(s as { fait_en_amont?: boolean }).fait_en_amont;
  const badges = [enAmont ? 'DÉJÀ RÉALISÉE AVANT LA FOURNÉE' : '', ...g.badges.filter((b) => b !== 'PRÉPARATION DÉJÀ RÉALISÉE')].filter(Boolean);
  return (
    <article data-etape-courante={s.id} className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-8">
      <header className="flex flex-col gap-1">
        <p className="flex justify-between gap-2 font-label-md text-[12px] uppercase tracking-widest text-secondary">
          <span className="min-w-0 truncate">{titreJour}</span>
          <span className="shrink-0">
            Étape {rang} / {total}
          </span>
        </p>
        <label className={`flex items-center gap-3 ${readOnly ? '' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={g.complete}
            disabled={readOnly}
            aria-label={`Marquer « ${s.title || 'cette étape'} » comme réalisée`}
            onChange={(ev) => g.cocherEtape(ev.target.checked, false)}
            className="w-8 h-8 rounded border-outline accent-green-700 focus:ring-primary shrink-0"
          />
          <h2 className={`font-headline-md text-[22px] leading-tight ${g.complete ? 'text-green-800' : 'text-primary'}`}>
            {s.title || 'Étape'}
          </h2>
        </label>
        {badges.length > 0 && <p className="text-[12px] font-label-md text-on-surface-variant">{badges.join(' · ')}</p>}
      </header>

      <NoteEtRetours stepId={s.id} note={s.user_note} />
      <PointsAVerifierFournee texte={pointsAVerifier} />
      <PhotosEtapeVignettes stepId={s.id} photosRecette={photosRecette} />

      {s.tips && (
        <div className="p-3 bg-primary/5 border-l-4 border-primary rounded">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-primary mb-1">Conseils &amp; astuces</p>
          {/* Première ligne seulement, « Tout afficher » pour le reste (comme « Ma note »). */}
          <ReplieUneLigne hauteur={24}>
            <div className="font-body-md text-[16px] leading-6 italic whitespace-pre-line">{s.tips}</div>
          </ReplieUneLigne>
        </div>
      )}

      {ingredients.length > 0 && (
        <section>
          <h3 className="font-label-md text-[11px] uppercase tracking-widest text-secondary">Ingrédients</h3>
          <ul>
            {ingredients.map((ing) => (
              <LigneIngredient
                key={ing.id}
                ing={ing}
                stepId={s.id}
                g={g}
                conversions={conversions}
                units={units}
                peutRacheter={peutRacheter}
                onIngReal={rappels.onIngReal}
                onIngComment={rappels.onIngComment}
              />
            ))}
          </ul>
        </section>
      )}

      {g.substeps.length > 0 ? (
        <section>
          <h3 className="font-label-md text-[11px] uppercase tracking-widest text-secondary">Gestes</h3>
          <ul>
            {g.substeps.map((su) => (
              <LigneSousEtape
                key={su.id}
                su={su}
                stepId={s.id}
                g={g}
                ingredientsNommes={g.subIngredientsBySubstep.get(su.id) || []}
                conversions={conversions}
                units={units}
                onSubComment={rappels.onSubComment}
              />
            ))}
          </ul>
        </section>
      ) : (
        s.description && <div className="font-body-md text-[16px] leading-relaxed whitespace-pre-line">{s.description}</div>
      )}

      {s.video_url && <StepVideoPlayer url={s.video_url} />}

      {/* Le constat se fait en fin d'étape : cadre discret pendant l'étape (un
          lien « Remplir maintenant »), vert et déplié une fois l'étape terminée.
          Déplié aussi dès qu'un constat existe. */}
      <section
        ref={finRef}
        className={`mt-2 flex flex-col gap-3 rounded-xl p-4 lg:sticky lg:top-[calc(var(--site-header-h,72px)+16px)] lg:col-start-2 lg:[grid-row:1/span_20] lg:mt-0 ${g.complete ? 'border-2 border-green-700 bg-green-50' : 'border border-dashed border-outline-variant bg-white'}`}
      >
        <h3 className={`flex items-center gap-2 font-label-md text-[13px] font-bold uppercase tracking-widest ${g.complete ? 'text-green-800' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined text-[20px]">{g.complete ? 'task_alt' : 'flag'}</span>
          {g.complete ? 'Étape terminée — comment ça s’est passé ?' : 'Fin d’étape'}
        </h3>
        {!finVisible ? (
          <>
            <p className="text-[13px] text-on-surface-variant">À compléter une fois l’étape terminée : votre commentaire et la quantité obtenue.</p>
            {!readOnly && (
              <button type="button" onClick={() => setFinOuvert(true)} className="self-start font-label-md text-[14px] text-primary underline underline-offset-2">
                Remplir maintenant
              </button>
            )}
          </>
        ) : (
          <>
            <label htmlFor={`fin-com-${s.id}`} className="font-label-md text-[11px] uppercase tracking-widest text-on-surface-variant">
              Mon commentaire
            </label>
            <textarea
              id={`fin-com-${s.id}`}
              rows={3}
              style={{ minHeight: 84 }}
              placeholder="Texture, cuisson, ce que vous changeriez…"
              disabled={readOnly}
              value={s.commentaire || ''}
              onChange={(ev) => rappels.onStepComment(s.id, ev.target.value)}
              className={`block w-full resize-y border rounded px-3 py-2 font-body-md text-sm focus:ring-1 focus:ring-primary ${
                s.commentaire ? 'border-green-700 bg-white' : 'border-outline-variant bg-white'
              }`}
            />
            {/* Colonne absente (migration pas jouée) : le champ n'est pas proposé. */}
            {'ecart_produit_g' in s && (
              <EcartProduitChamp
                valeur={(s as { ecart_produit_g?: number | null }).ecart_produit_g ?? null}
                disabled={readOnly}
                onChange={(v) => rappels.onStepEcart(s.id, v)}
              />
            )}
          </>
        )}
      </section>
    </article>
  );
}

export function PatisserFocus({
  batch,
  jalons,
  readOnly,
  etapeId,
  onEtape,
  conversions,
  units,
  peutRacheter,
  pointsAVerifier,
  photosRecette,
  onCloturer,
  rappels,
  bureau = true,
  onDeroule,
}: {
  batch: BatchFull;
  jalons: BatchJalon[];
  readOnly: boolean;
  // Étape affichée (choisie par la page : adresse, sommaire, navigation).
  etapeId: number | null;
  onEtape: (id: number) => void;
  conversions: ConversionRef[];
  units: UnitRef[];
  peutRacheter: boolean;
  pointsAVerifier?: Record<number, string>;
  photosRecette?: Record<number, { url: string; ai_retouched: boolean }[]>;
  // Absent : fournée close ou verrouillée, pas de clôture proposée.
  onCloturer?: () => void;
  rappels: Rappels;
  // Au-dessus de 1024 px : vue « une étape » en trois zones (liste, étape, fin
  // d'étape) quand vrai, déroulé complet quand faux. Sous 1024 px, toujours la vue
  // une étape. `onDeroule` : bouton « Voir tout le déroulé » (bureau seulement).
  bureau?: boolean;
  onDeroule?: () => void;
}) {
  const etapes = etapesOrdonnees(batch, jalons);
  const idx = Math.max(0, etapes.findIndex((e) => e.step.id === etapeId));
  const courante = etapes[idx];
  const haut = useRef<HTMLDivElement>(null);
  const premier = useRef(true);
  // Changement d'étape : on remonte en haut de l'étape (sauf à l'ouverture).
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    haut.current?.scrollIntoView({ block: 'start' });
  }, [courante?.step.id]);

  // Hauteur RÉELLE de la barre basse du site : `--mobile-nav-h` (72 px) est une
  // estimation, que la taille des polices, l'encoche ou le rond central
  // dépassent sur certains téléphones — la barre de navigation passait alors en
  // partie dessous. Mesurée et suivie ; la variable reste le repli avant mesure.
  const [navH, setNavH] = useState<number | null>(null);
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('.mobile-nav-bar');
    if (!nav) return;
    const mesurer = () => setNavH(Math.ceil(nav.getBoundingClientRect().height));
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(nav);
    window.addEventListener('resize', mesurer);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', mesurer);
    };
  }, []);

  if (!courante) return null;
  const prec = etapes[idx - 1];
  const suiv = etapes[idx + 1];
  const toutFini = etapes.every((e) => e.terminee);
  const jalon = jalons[courante.jalon];

  return (
    <div className={`${bureau ? '' : 'lg:hidden'} print:hidden`}>
      <div ref={haut} id="patisser-focus" className="scroll-mt-24" />
      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-8">
      {/* Jauge : un segment par étape, regroupés par jour. Vert = terminée,
          marron = il reste quelque chose à faire ; l'étape affichée est
          entourée. Toucher un segment y mène. */}
      <nav aria-label="Étapes de la fournée" className="mb-4 flex gap-2 lg:hidden">
        {jalons.map((j, ji) => (
          <div key={ji} className="flex min-w-0 gap-1" style={{ flex: j.steps.length }}>
            {etapes
              .filter((e) => e.jalon === ji)
              .map((e) => {
                const rang = etapes.indexOf(e) + 1;
                const active = e.step.id === courante.step.id;
                return (
                  <button
                    key={e.step.id}
                    type="button"
                    onClick={() => onEtape(e.step.id)}
                    aria-current={active ? 'step' : undefined}
                    aria-label={`Étape ${rang} : ${e.step.title || ''}${e.terminee ? ' (terminée)' : ' (à faire)'}`}
                    title={e.step.title || undefined}
                    className="flex h-7 min-w-0 flex-1 items-center"
                  >
                    <span
                      className={`block h-2.5 w-full rounded-full ${e.terminee ? 'bg-green-700' : 'bg-primary'} ${active ? 'ring-2 ring-on-surface ring-offset-2 ring-offset-background' : ''}`}
                    />
                  </button>
                );
              })}
          </div>
        ))}
      </nav>

      {/* Bureau : liste verticale des étapes, groupées par jour. Même sens des
          couleurs que la jauge : vert = terminée, marron = reste à faire. */}
      <nav
        aria-label="Étapes de la fournée"
        className="hidden lg:sticky lg:top-[calc(var(--site-header-h,72px)+16px)] lg:flex lg:max-h-[calc(100vh-var(--site-header-h,72px)-32px)] lg:flex-col lg:gap-3 lg:overflow-y-auto"
      >
        {jalons.map((j, ji) => {
          const jour = dateDuJalon(batch, j.offset);
          return (
            <div key={ji} className="flex flex-col gap-1">
              <p className="font-label-md text-[11px] uppercase tracking-widest text-secondary">
                {j.offset > 0 ? `Jour J − ${j.offset}` : 'Jour J'}
                {jour ? ` · ${jour.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}
              </p>
              {etapes
                .filter((e) => e.jalon === ji)
                .map((e) => {
                  const rang = etapes.indexOf(e) + 1;
                  const active = e.step.id === courante.step.id;
                  return (
                    <button
                      key={e.step.id}
                      type="button"
                      onClick={() => onEtape(e.step.id)}
                      aria-current={active ? 'step' : undefined}
                      className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left font-body-md text-[14px] leading-tight ${active ? 'bg-surface-container-high ring-2 ring-primary' : 'hover:bg-surface-container'}`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${e.terminee ? 'bg-green-700' : 'bg-primary'}`}>
                        {e.terminee ? <span className="material-symbols-outlined text-[16px]">check</span> : rang}
                      </span>
                      <span className={`min-w-0 ${e.terminee ? 'text-green-800' : 'text-on-surface'}`}>{e.step.title || 'Étape'}</span>
                    </button>
                  );
                })}
            </div>
          );
        })}
        {onDeroule && (
          <button type="button" onClick={onDeroule} className="mt-2 self-start font-label-md text-[13px] text-primary underline underline-offset-2">
            Voir tout le déroulé
          </button>
        )}
      </nav>

      <div className="min-w-0">
      <CarteEtape
        key={courante.step.id}
        batch={batch}
        e={courante}
        rang={idx + 1}
        total={etapes.length}
        jalon={jalon}
        readOnly={readOnly}
        conversions={conversions}
        units={units}
        peutRacheter={peutRacheter}
        pointsAVerifier={courante.step.source_step_id ? pointsAVerifier?.[courante.step.source_step_id] ?? null : null}
        photosRecette={courante.step.source_step_id ? photosRecette?.[courante.step.source_step_id] ?? [] : []}
        rappels={rappels}
      />

      {/* Aucune place réservée sous le contenu : la barre fixe ne recouvre que le
          bas de marge du pied de page (`globals.css`, `#patisser-focus`). Un
          espaceur ici laissait ~400 px de vide avant le pied de page. */}
      {/* Navigation seule : rien n'est coché par ces boutons. Collée à la barre
          basse (aucun jour entre les deux : le texte défilait dans l'intervalle),
          fond plein, et marge basse de 12 px pour le rond central de la barre
          basse, qui déborde vers le haut. */}
      <div
        className="fixed inset-x-0 z-[46] border-t border-outline-variant bg-white px-3 pt-2 pb-3 lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0"
        style={{ bottom: navH != null ? navH - 1 : 'calc(var(--mobile-nav-h) - 1px)' }}
      >
        <div className="mx-auto flex max-w-[1200px] gap-2">
          <button
            type="button"
            disabled={!prec}
            onClick={() => prec && onEtape(prec.step.id)}
            className="h-12 basis-[40%] shrink-0 rounded-xl bg-surface-container-high font-label-md text-[15px] text-primary disabled:opacity-40"
          >
            ← Précédente
          </button>
          {suiv ? (
            <button type="button" onClick={() => onEtape(suiv.step.id)} className="h-12 flex-1 rounded-xl bg-primary font-label-md text-[15px] text-on-primary">
              Suivante →
            </button>
          ) : onCloturer ? (
            <button
              type="button"
              onClick={onCloturer}
              className={`h-12 flex-1 rounded-xl font-label-md text-[15px] text-white ${toutFini ? 'bg-green-700' : 'bg-primary'}`}
            >
              Clôturer la fournée
            </button>
          ) : batch.status !== 'planifiee' ? (
            <a href="#sec-resume" className="flex h-12 flex-1 items-center justify-center rounded-xl bg-primary font-label-md text-[15px] text-on-primary">
              Voir le résumé
            </a>
          ) : (
            <span className="flex-1" />
          )}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
