'use client';

// Gestion des campagnes publicitaires : un tableau par emplacement + un panneau
// de saisie ouvert SOUS le tableau, en pleine largeur (JEP-367 — c'était un
// tiroir latéral, trop étroit pour trois visuels côte à côte).
//
// Différence assumée avec la recette à la une : le chevauchement de plages est
// autorisé. L'interdire obligerait à carreler les dates au jour près et
// empêcherait toute rotation ; l'ordre `priorité ↓, début ↓, id ↑` départage
// (cf. lib/ads.ts).
//
// `ads` n'étant pas encore dans lib/database.types.ts, les écritures passent
// par un cast local — même motif que FeaturedRecipesManager.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { formatDate } from '@/lib/format';
import { resizeImageToDataUrl, isAcceptedImage, isHeic } from '@/lib/images';
import { televerserImage } from '@/lib/storage-client';
import {
  AD_APPAREILS,
  AD_COLONNE_IMAGE,
  AD_SLOTS,
  adSlotConfig,
  adStatus,
  type AdAppareil,
  type AdFormatVisuel,
  type AdRow,
  type AdSlotKey,
} from '@/lib/ads-config';
import { revalidateReference } from '@/lib/revalidate-reference';

type AdsTable = {
  insert: (values: unknown) => PromiseLike<{ error: { message: string } | null }>;
  update: (values: unknown) => {
    eq: (col: string, value: unknown) => PromiseLike<{ error: { message: string } | null }>;
  };
  delete: () => {
    eq: (col: string, value: unknown) => PromiseLike<{ error: { message: string } | null }>;
  };
  select: (cols: string) => {
    eq: (col: string, value: unknown) => {
      maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
    };
  };
};

function adsTable(): AdsTable {
  return createClient().from('ads' as never) as unknown as AdsTable;
}

export function PartnersManager({ items }: { items: AdRow[] }) {
  const router = useRouter();
  const { mutate } = useMutation();
  const [editing, setEditing] = useState<AdRow | null | undefined>(undefined); // undefined = panneau fermé
  const [filter, setFilter] = useState<AdSlotKey | 'all'>('all');

  const rows = useMemo(
    () => (filter === 'all' ? items : items.filter((a) => a.slot === filter)),
    [items, filter],
  );

  // Les campagnes diffusables sont en cache serveur (lib/ads.ts) : sans
  // invalidation, une campagne supprimée ou désactivée continuerait de
  // s'afficher jusqu'à une heure. Invalider AVANT la resynchronisation portée
  // par `mutate`, sinon le rendu serveur relit la valeur en cache.
  async function del(row: AdRow) {
    await mutate(
      async () => {
        const r = await adsTable().delete().eq('id', row.id);
        await revalidateReference('ads');
        return r;
      },
      {
        confirm: `Supprimer la publicité « ${row.name} » ? Cette action est définitive.`,
        errorLabel: 'Suppression impossible',
      },
    );
  }

  async function toggleActive(row: AdRow) {
    await mutate(
      async () => {
        const r = await adsTable().update({ active: !row.active }).eq('id', row.id);
        await revalidateReference('ads');
        return r;
      },
      { errorLabel: 'Modification impossible' },
    );
  }

  return (
    <div className="p-margin-desktop flex flex-col gap-gutter">
      <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
        <div className="p-6 border-b border-outline-variant flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-headline-md text-lg font-semibold">Campagnes publicitaires</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Une campagne s&apos;affiche sur son emplacement entre ses dates de diffusion. Plusieurs
              campagnes peuvent se chevaucher : la priorité la plus haute passe en premier.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as AdSlotKey | 'all')}
              className="border border-outline-variant rounded px-3 py-2 text-sm bg-transparent"
            >
              <option value="all">Tous les emplacements</option>
              {AD_SLOTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} ({s.hint})
                </option>
              ))}
            </select>
            <button
              onClick={() => setEditing(null)}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded hover:opacity-90 transition-all"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              <span>Nouvelle publicité</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Nom</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Emplacement</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Diffusion</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Priorité</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Statut</th>
                <th className="px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-on-surface-variant text-sm">
                    Aucune publicité programmée.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const st = adStatus(row);
                  const cfg = adSlotConfig(row.slot);
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-surface-container-low transition-colors ${
                        editing?.id === row.id ? 'bg-surface-container-low' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-on-surface">{row.name}</span>
                          {row.link_url && (
                            <span className="text-[11px] text-on-surface-variant truncate max-w-[280px]">{row.link_url}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface">{cfg?.label ?? row.slot}</td>
                      <td className="px-6 py-4 text-sm text-on-surface whitespace-nowrap">
                        {formatDate(row.start_date)} → {row.end_date ? formatDate(row.end_date) : 'sans fin'}
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface">{row.priority}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full ${st.cls} text-[11px] font-bold uppercase tracking-wider`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => toggleActive(row)}
                            className="p-2 hover:bg-surface-container-high rounded text-on-surface-variant"
                            title={row.active ? 'Suspendre la diffusion' : 'Reprendre la diffusion'}
                          >
                            <span className="material-symbols-outlined text-xl">
                              {row.active ? 'pause_circle' : 'play_circle'}
                            </span>
                          </button>
                          <Link
                            href={`/admin/partenaires/${row.id}/statistiques`}
                            className="p-2 hover:bg-surface-container-high rounded text-on-surface-variant inline-flex"
                            title="Statistiques"
                          >
                            <span className="material-symbols-outlined text-xl">bar_chart</span>
                          </Link>
                          <button
                            onClick={() => setEditing(row)}
                            className="p-2 hover:bg-surface-container-high rounded text-on-surface-variant"
                            title="Modifier"
                          >
                            <span className="material-symbols-outlined text-xl">edit_note</span>
                          </button>
                          <button
                            onClick={() => del(row)}
                            className="p-2 hover:bg-error/10 rounded text-on-surface-variant hover:text-error"
                            title="Supprimer"
                          >
                            <span className="material-symbols-outlined text-xl">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <AdForm
          // Remonté à chaque changement de campagne : ses états sont
          // initialisés depuis `entry`.
          key={editing?.id ?? 'nouvelle'}
          entry={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const FIELD =
  'w-full border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors';
const LABEL = 'text-xs font-semibold text-on-surface-variant uppercase tracking-wider';


type Visuels = Record<AdAppareil, string | null>;

function AdForm({
  entry,
  onClose,
  onSaved,
}: {
  entry: AdRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();
  const panneau = useRef<HTMLElement>(null);

  const [slot, setSlot] = useState<AdSlotKey>(entry?.slot ?? AD_SLOTS[0].key);
  const [name, setName] = useState(entry?.name ?? '');
  const [linkUrl, setLinkUrl] = useState(entry?.link_url ?? '');
  const [title, setTitle] = useState(entry?.title ?? '');
  const [subtitle, setSubtitle] = useState(entry?.subtitle ?? '');
  const [ctaLabel, setCtaLabel] = useState(entry?.cta_label ?? '');
  const [startDate, setStartDate] = useState(entry?.start_date ?? '');
  const [endDate, setEndDate] = useState(entry?.end_date ?? '');
  const [noEnd, setNoEnd] = useState(!!entry && !entry.end_date);
  const [active, setActive] = useState(entry?.active ?? true);
  const [priority, setPriority] = useState(String(entry?.priority ?? 0));
  const [images, setImages] = useState<Visuels>({ desktop: null, tablet: null, mobile: null });
  // Valeurs lues en base : seule une variante qui a changé est écrite, pour
  // qu'une campagne reste modifiable tant que les colonnes JEP-367 manquent.
  const initiales = useRef<Visuels>({ desktop: null, tablet: null, mobile: null });
  // Les visuels ne sont pas chargés avec la liste : on les récupère à
  // l'ouverture du panneau, pour la campagne éditée seulement.
  const [imageLoading, setImageLoading] = useState(!!entry);
  const [imageBusy, setImageBusy] = useState<AdAppareil | null>(null);

  const cfg = adSlotConfig(slot) ?? AD_SLOTS[0];

  // Le panneau s'ouvre sous un tableau qui peut être long : on l'amène à
  // l'écran, sans quoi « Modifier » semblerait ne rien faire.
  useEffect(() => {
    panneau.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    (async () => {
      // `*` : les colonnes des variantes peuvent ne pas exister encore.
      const { data } = await adsTable().select('*').eq('id', entry.id).maybeSingle();
      if (cancelled) return;
      const lu = (appareil: AdAppareil) => {
        const v = data?.[AD_COLONNE_IMAGE[appareil]];
        return typeof v === 'string' && v ? v : null;
      };
      const visuels = { desktop: lu('desktop'), tablet: lu('tablet'), mobile: lu('mobile') };
      initiales.current = visuels;
      setImages(visuels);
      setImageLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  function format(appareil: AdAppareil): AdFormatVisuel {
    return appareil === 'desktop' ? cfg : cfg.variantes[appareil];
  }

  async function onFile(appareil: AdAppareil, file: File) {
    if (!isAcceptedImage(file)) {
      return dialog.alert(
        isHeic(file)
          ? 'Format HEIC non lisible par le navigateur : convertissez la photo en JPEG ou PNG.'
          : 'Format non pris en charge : choisissez une image JPEG, PNG, WebP ou AVIF.',
      );
    }
    setImageBusy(appareil);
    try {
      const url = await resizeImageToDataUrl(file, format(appareil).maxWidth);
      setImages((prev) => ({ ...prev, [appareil]: url }));
    } catch (e) {
      dialog.alert('Image illisible : ' + (e as Error).message);
    } finally {
      setImageBusy(null);
    }
  }

  const linkInvalid = !!linkUrl.trim() && !/^https?:\/\/\S+$/i.test(linkUrl.trim());
  const datesInvalid = !noEnd && !!startDate && !!endDate && endDate < startDate;
  // Un encart doit avoir quelque chose à montrer : un visuel, ou au moins un
  // titre pour le rendu de repli.
  const contentMissing = !images.desktop && !title.trim();
  // Le visuel « ordinateur » est le repli des deux autres : sans lui, la
  // variante serait ignorée à l'affichage (cf. `adSources`).
  const varianteSansOrdinateur = !images.desktop && (!!images.tablet || !!images.mobile);
  const canSave =
    !!name.trim() &&
    !!startDate &&
    (noEnd || !!endDate) &&
    !datesInvalid &&
    !linkInvalid &&
    !contentMissing &&
    !varianteSansOrdinateur &&
    !imageLoading;

  async function save() {
    if (!canSave) return;

    // `refresh: false` : le panneau se démonte dès onSaved(), c'est au parent
    // (toujours monté) de porter la resynchronisation.
    const ok = await mutate(
      async () => {
        // Chaque visuel est une data-URL fraîchement compressée s'il a
        // changé, ou déjà l'URL de stockage s'il vient de la lecture
        // initiale — televerserImage() ne dépose que dans le premier cas
        // (§ 7.5, lot B2). À l'intérieur de `mutate()` : un échec du dépôt
        // doit être annoncé comme n'importe quel autre échec d'écriture.
        const urls: Visuels = {
          desktop: await televerserImage('publicite', images.desktop),
          tablet: await televerserImage('publicite', images.tablet),
          mobile: await televerserImage('publicite', images.mobile),
        };

        const payload: Record<string, unknown> = {
          slot,
          name: name.trim(),
          link_url: linkUrl.trim() || null,
          image_url: urls.desktop,
          title: title.trim() || null,
          subtitle: subtitle.trim() || null,
          cta_label: ctaLabel.trim() || null,
          start_date: startDate,
          end_date: noEnd ? null : endDate,
          active,
          priority: Number.parseInt(priority, 10) || 0,
        };
        for (const appareil of ['tablet', 'mobile'] as const) {
          if (urls[appareil] !== initiales.current[appareil]) payload[AD_COLONNE_IMAGE[appareil]] = urls[appareil];
        }

        const r = entry ? await adsTable().update(payload).eq('id', entry.id) : await adsTable().insert(payload);
        // Le cache des campagnes doit tomber avant que le parent ne
        // resynchronise (cf. `del` / `toggleActive` plus haut).
        await revalidateReference('ads');
        return r;
      },
      { refresh: false, errorLabel: 'Enregistrement impossible' },
    );
    if (ok) onSaved();
  }

  return (
    <section
      ref={panneau}
      className="scroll-mt-24 bg-surface-container-lowest border border-outline-variant rounded overflow-hidden"
    >
      <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-outline-variant">
        <h3 className="font-headline-md text-lg font-semibold">
          {entry ? `Modifier la publicité « ${entry.name} »` : 'Nouvelle publicité'}
        </h3>
        <button onClick={onClose} className="text-on-surface-variant hover:text-primary" title="Fermer">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="px-6 py-6 flex flex-col gap-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Emplacement *</span>
            <select value={slot} onChange={(e) => setSlot(e.target.value as AdSlotKey)} className={FIELD}>
              {AD_SLOTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-on-surface-variant">
              {cfg.where}
              {cfg.repeated && ' Cet emplacement revient plusieurs fois sur la page : les campagnes en cours y défilent à tour de rôle.'}
            </span>
          </label>

          <label className="flex flex-col gap-2">
            <span className={LABEL}>Nom de la publicité *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} placeholder="Coffrets Maryse — automne" autoFocus />
            <span className="text-[11px] text-on-surface-variant">
              Usage interne (et texte alternatif du visuel) : jamais affiché comme titre sur le site.
            </span>
          </label>

          <label className="flex flex-col gap-2 lg:col-span-2">
            <span className={LABEL}>Lien</span>
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className={FIELD} placeholder="https://exemple.fr/offre" />
            {linkInvalid && <span className="text-xs text-error font-medium">Le lien doit commencer par http:// ou https://</span>}
          </label>
        </div>

        <div className="border-t border-outline-variant pt-6 flex flex-col gap-4">
          <div>
            <span className={LABEL}>Visuels</span>
            <p className="text-[11px] text-on-surface-variant mt-1">
              Le visuel « Ordinateur » est obligatoire pour un encart illustré. Tablette et téléphone sont
              facultatifs : sans visuel propre, le téléphone reprend celui de la tablette, sinon celui de
              l&apos;ordinateur.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3 items-start">
            {AD_APPAREILS.map((a) => (
              <VisuelAppareil
                key={a.key}
                label={a.label}
                icon={a.icon}
                plage={a.plage}
                format={format(a.key)}
                image={images[a.key]}
                repli={
                  a.key === 'desktop'
                    ? null
                    : a.key === 'tablet'
                      ? images.desktop && 'visuel ordinateur'
                      : images.tablet
                        ? 'visuel tablette'
                        : images.desktop && 'visuel ordinateur'
                }
                loading={imageLoading}
                busy={imageBusy === a.key}
                disabled={imageBusy !== null || imageLoading}
                onFile={(f) => void onFile(a.key, f)}
                onRemove={() => setImages((prev) => ({ ...prev, [a.key]: null }))}
              />
            ))}
          </div>
          {varianteSansOrdinateur && (
            <p className="text-xs text-error font-medium">
              Ajoutez le visuel « Ordinateur » : les visuels tablette et téléphone ne s&apos;affichent qu&apos;avec lui.
            </p>
          )}
        </div>

        <div className="border-t border-outline-variant pt-6 flex flex-col gap-4">
          <p className="text-[11px] text-on-surface-variant">
            Sans visuel, l&apos;encart est composé à partir des textes ci-dessous.
          </p>
          <div className="grid gap-6 lg:grid-cols-3">
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Titre</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Accroche</span>
              <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={FIELD} />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Libellé du bouton</span>
              <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className={FIELD} placeholder="Découvrir" />
            </label>
          </div>
          {contentMissing && (
            <p className="text-xs text-error font-medium">Ajoutez un visuel ou, à défaut, un titre.</p>
          )}
        </div>

        <div className="border-t border-outline-variant pt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-4 items-end">
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Du *</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={FIELD} />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Au {noEnd ? '' : '*'}</span>
            <input
              type="date"
              value={endDate}
              disabled={noEnd}
              onChange={(e) => setEndDate(e.target.value)}
              className={`${FIELD} disabled:opacity-40`}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Priorité</span>
            <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className={FIELD} />
          </label>
          <div className="flex flex-col gap-2 pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} />
              <span>Diffusion sans date de fin</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>Diffusion active</span>
            </label>
          </div>
        </div>
        <p className="-mt-4 text-[11px] text-on-surface-variant">
          Priorité : la plus haute passe en premier si plusieurs campagnes se chevauchent.
        </p>
        {datesInvalid && (
          <p className="-mt-4 text-xs text-error font-medium">
            La date de fin doit être postérieure ou égale à la date de début.
          </p>
        )}
      </div>

      <div className="px-6 py-5 border-t border-outline-variant flex justify-end gap-3">
        <button onClick={onClose} className="px-6 py-3 border border-outline-variant rounded text-sm font-medium hover:bg-surface-container-high">
          Annuler
        </button>
        <button
          onClick={save}
          disabled={busy || imageBusy !== null || !canSave}
          className="px-8 py-3 bg-primary text-on-primary rounded text-sm font-semibold hover:opacity-90 disabled:opacity-60"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </section>
  );
}

// Un emplacement de visuel (ordinateur, tablette ou téléphone), avec l'aperçu
// aux proportions conseillées pour cet appareil.
function VisuelAppareil({
  label,
  icon,
  plage,
  format,
  image,
  repli,
  loading,
  busy,
  disabled,
  onFile,
  onRemove,
}: {
  label: string;
  icon: string;
  plage: string;
  format: AdFormatVisuel;
  image: string | null;
  /** Ce qui s'affichera sans visuel propre (variantes seulement). */
  repli: string | null;
  loading: boolean;
  busy: boolean;
  disabled: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
        <span className="material-symbols-outlined text-lg text-on-surface-variant">{icon}</span>
        {label}
      </div>
      <span className="text-[11px] text-on-surface-variant">
        Écrans {plage} — visuel conseillé : {format.hint}.
      </span>
      <div className={`${format.previewAspect} bg-surface-container rounded-lg overflow-hidden border border-outline-variant flex items-center justify-center`}>
        {loading ? (
          <span className="text-xs text-on-surface-variant">Chargement du visuel…</span>
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL ou visuel du stockage objet
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 px-3 text-center">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant">imagesmode</span>
            {repli && <span className="text-[11px] text-on-surface-variant">Affiche le {repli}</span>}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label
          className={`border border-outline-variant rounded px-4 py-2 text-xs font-medium flex items-center gap-2 ${
            disabled ? 'opacity-60' : 'cursor-pointer hover:bg-surface-container-high'
          }`}
        >
          <span className="material-symbols-outlined text-base">upload</span>
          {image ? 'Remplacer' : 'Choisir une image'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </label>
        {image && (
          <button onClick={onRemove} className="text-xs text-on-surface-variant hover:text-error">
            Retirer
          </button>
        )}
        {busy && <span className="text-xs text-on-surface-variant">Compression…</span>}
      </div>
    </div>
  );
}
