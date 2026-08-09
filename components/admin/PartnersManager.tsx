'use client';

// Gestion des campagnes publicitaires : un tableau par emplacement + un tiroir
// de saisie, calqué sur FeaturedRecipesManager (recette à la une).
//
// Différence assumée avec la recette à la une : le chevauchement de plages est
// autorisé. L'interdire obligerait à carreler les dates au jour près et
// empêcherait toute rotation ; l'ordre `priorité ↓, début ↓, id ↑` départage
// (cf. lib/ads.ts).
//
// `ads` n'étant pas encore dans lib/database.types.ts, les écritures passent
// par un cast local — même motif que FeaturedRecipesManager.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { formatDate } from '@/lib/format';
import { resizeImageToDataUrl, isAcceptedImage, isHeic } from '@/lib/images';
import { AD_SLOTS, adSlotConfig, adStatus, type AdRow, type AdSlotKey } from '@/lib/ads-config';

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
      maybeSingle: () => PromiseLike<{ data: { image_url: string | null } | null; error: { message: string } | null }>;
    };
  };
};

function adsTable(): AdsTable {
  return createClient().from('ads' as never) as unknown as AdsTable;
}

export function PartnersManager({ items }: { items: AdRow[] }) {
  const router = useRouter();
  const { mutate } = useMutation();
  const [editing, setEditing] = useState<AdRow | null | undefined>(undefined); // undefined = tiroir fermé
  const [filter, setFilter] = useState<AdSlotKey | 'all'>('all');

  const rows = useMemo(
    () => (filter === 'all' ? items : items.filter((a) => a.slot === filter)),
    [items, filter],
  );

  async function del(row: AdRow) {
    await mutate(() => adsTable().delete().eq('id', row.id), {
      confirm: `Supprimer la publicité « ${row.name} » ? Cette action est définitive.`,
      errorLabel: 'Suppression impossible',
    });
  }

  async function toggleActive(row: AdRow) {
    await mutate(() => adsTable().update({ active: !row.active }).eq('id', row.id), {
      errorLabel: 'Modification impossible',
    });
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
                  {s.label}
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
                    <tr key={row.id} className="hover:bg-surface-container-low transition-colors">
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
  const [image, setImage] = useState<string | null>(null);
  // Le visuel n'est pas chargé avec la liste (data-URL trop lourdes) : on le
  // récupère à l'ouverture du tiroir, pour la campagne éditée seulement.
  const [imageLoading, setImageLoading] = useState(!!entry);
  const [imageBusy, setImageBusy] = useState(false);

  const cfg = adSlotConfig(slot) ?? AD_SLOTS[0];

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    (async () => {
      const { data } = await adsTable().select('image_url').eq('id', entry.id).maybeSingle();
      if (!cancelled) {
        setImage(data?.image_url ?? null);
        setImageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  async function onFile(file: File) {
    if (!isAcceptedImage(file)) {
      return dialog.alert(
        isHeic(file)
          ? 'Format HEIC non lisible par le navigateur : convertissez la photo en JPEG ou PNG.'
          : 'Format non pris en charge : choisissez une image JPEG, PNG, WebP ou AVIF.',
      );
    }
    setImageBusy(true);
    try {
      setImage(await resizeImageToDataUrl(file, cfg.maxWidth));
    } catch (e) {
      dialog.alert('Image illisible : ' + (e as Error).message);
    } finally {
      setImageBusy(false);
    }
  }

  const linkInvalid = !!linkUrl.trim() && !/^https?:\/\/\S+$/i.test(linkUrl.trim());
  const datesInvalid = !noEnd && !!startDate && !!endDate && endDate < startDate;
  // Un encart doit avoir quelque chose à montrer : un visuel, ou au moins un
  // titre pour le rendu de repli.
  const contentMissing = !image && !title.trim();
  const canSave =
    !!name.trim() && !!startDate && (noEnd || !!endDate) && !datesInvalid && !linkInvalid && !contentMissing && !imageLoading;

  async function save() {
    if (!canSave) return;

    const payload = {
      slot,
      name: name.trim(),
      link_url: linkUrl.trim() || null,
      image_url: image,
      title: title.trim() || null,
      subtitle: subtitle.trim() || null,
      cta_label: ctaLabel.trim() || null,
      start_date: startDate,
      end_date: noEnd ? null : endDate,
      active,
      priority: Number.parseInt(priority, 10) || 0,
    };

    // `refresh: false` : le tiroir se démonte dès onSaved(), c'est au parent
    // (toujours monté) de porter la resynchronisation.
    const ok = await mutate(
      () => (entry ? adsTable().update(payload).eq('id', entry.id) : adsTable().insert(payload)),
      { refresh: false, errorLabel: 'Enregistrement impossible' },
    );
    if (ok) onSaved();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-bright border-l border-outline-variant z-50 flex flex-col">
        <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant">
          <h3 className="font-headline-md text-xl font-semibold">
            {entry ? 'Modifier la publicité' : 'Nouvelle publicité'}
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
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
              {cfg.where} Visuel conseillé : {cfg.hint}.
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

          <label className="flex flex-col gap-2">
            <span className={LABEL}>Lien</span>
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className={FIELD} placeholder="https://exemple.fr/offre" />
            {linkInvalid && <span className="text-xs text-error font-medium">Le lien doit commencer par http:// ou https://</span>}
          </label>

          <div className="flex flex-col gap-2">
            <span className={LABEL}>Visuel</span>
            <div className={`${cfg.previewAspect} bg-surface-container rounded-lg overflow-hidden border border-outline-variant flex items-center justify-center`}>
              {imageLoading ? (
                <span className="text-xs text-on-surface-variant">Chargement du visuel…</span>
              ) : image ? (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL
                <img src={image} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-4xl text-on-surface-variant">imagesmode</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer border border-outline-variant rounded px-4 py-2 text-xs font-medium hover:bg-surface-container-high flex items-center gap-2">
                <span className="material-symbols-outlined text-base">upload</span>
                {image ? 'Remplacer' : 'Choisir une image'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={imageBusy || imageLoading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {image && (
                <button onClick={() => setImage(null)} className="text-xs text-on-surface-variant hover:text-error">
                  Retirer
                </button>
              )}
              {imageBusy && <span className="text-xs text-on-surface-variant">Compression…</span>}
            </div>
          </div>

          <div className="border-t border-outline-variant pt-6 space-y-4">
            <p className="text-[11px] text-on-surface-variant">
              Sans visuel, l&apos;encart est composé à partir des textes ci-dessous.
            </p>
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
            {contentMissing && (
              <p className="text-xs text-error font-medium">Ajoutez un visuel ou, à défaut, un titre.</p>
            )}
          </div>

          <div className="border-t border-outline-variant pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} />
              <span>Diffusion sans date de fin</span>
            </label>
            {datesInvalid && (
              <p className="text-xs text-error font-medium">
                La date de fin doit être postérieure ou égale à la date de début.
              </p>
            )}
          </div>

          <div className="border-t border-outline-variant pt-6 grid grid-cols-2 gap-4 items-end">
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Priorité</span>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={FIELD}
              />
              <span className="text-[11px] text-on-surface-variant">
                La plus haute passe en premier si plusieurs campagnes se chevauchent.
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm pb-2">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>Diffusion active</span>
            </label>
          </div>
        </div>

        <div className="px-8 py-6 border-t border-outline-variant flex gap-3">
          <button
            onClick={save}
            disabled={busy || imageBusy || !canSave}
            className="flex-1 bg-primary text-on-primary py-3 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={onClose} className="px-6 py-3 border border-outline-variant rounded text-sm font-medium hover:bg-surface-container-high">
            Annuler
          </button>
        </div>
      </aside>
    </>
  );
}
