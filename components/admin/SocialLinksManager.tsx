'use client';

// Gestion des liens vers les réseaux sociaux de l'en-tête (JEP-15). Une ligne
// par réseau, dans l'ordre d'affichage ; l'écran ne crée ni ne supprime de
// ligne (les cinq sont posées par la migration). Écriture directe sous la
// session (RLS : écriture admin), puis invalidation du cache de
// `lib/data/reference.ts` AVANT la resynchronisation (cf. CLAUDE.md).
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { revalidateReference } from '@/lib/revalidate-reference';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { SocialRondsApercu } from '@/components/admin/SocialRondsApercu';
import {
  EXEMPLE_URL,
  NOM_RESEAU,
  RESEAUX,
  erreurUrlReseau,
  liensAffichables,
  nettoyerUrl,
  type LienSocial,
  type ReseauSocial,
} from '@/lib/social-links';
import { TRACES_RESEAUX } from '@/lib/social-icons';

type Brouillon = Record<ReseauSocial, { url: string; visible: boolean }>;

export function SocialLinksManager({ initial, tableAbsente }: { initial: LienSocial[]; tableAbsente: boolean }) {
  const { mutate, busy, refresh } = useMutation();
  const depart = useMemo<Brouillon>(
    () =>
      Object.fromEntries(
        RESEAUX.map((r) => {
          const l = initial.find((x) => x.network === r);
          return [r, { url: l?.url ?? '', visible: l?.is_visible ?? true }];
        }),
      ) as Brouillon,
    [initial],
  );
  const [champs, setChamps] = useState<Brouillon>(depart);
  const [enregistre, setEnregistre] = useState(false);

  const erreurs = Object.fromEntries(RESEAUX.map((r) => [r, erreurUrlReseau(r, champs[r].url)])) as Record<
    ReseauSocial,
    string | null
  >;
  const invalide = RESEAUX.some((r) => erreurs[r]);

  // Aperçu en direct : ne montre que ce qui s'afficherait réellement, c'est-à-
  // dire une adresse VALIDE, non vide, sur un réseau visible.
  const apercu = liensAffichables(
    RESEAUX.map((r) => ({
      network: r,
      url: erreurs[r] ? null : nettoyerUrl(champs[r].url),
      is_visible: champs[r].visible,
    })),
  );

  function modifier(r: ReseauSocial, patch: Partial<Brouillon[ReseauSocial]>) {
    setEnregistre(false);
    setChamps((c) => ({ ...c, [r]: { ...c[r], ...patch } }));
  }

  async function enregistrer() {
    if (invalide) return;
    const sb = createClient();
    const ok = await mutate(
      async () => {
        // Un `update` par réseau (clé primaire = network) : l'écran ne crée
        // jamais de ligne, une ligne manquante reste manquante.
        const q = sb.from('social_links' as never) as unknown as {
          update: (v: object) => {
            eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
        for (const r of RESEAUX) {
          const url = nettoyerUrl(champs[r].url);
          const { error } = await q.update({ url: url || null, is_visible: champs[r].visible }).eq('network', r);
          if (error) return { error };
        }
        return { error: null };
      },
      { errorLabel: 'Erreur lors de l’enregistrement', refresh: false },
    );
    if (!ok) return;
    setChamps((c) =>
      Object.fromEntries(RESEAUX.map((r) => [r, { ...c[r], url: nettoyerUrl(c[r].url) }])) as Brouillon,
    );
    setEnregistre(true);
    await revalidateReference('social_links');
    refresh();
  }

  return (
    <div className="p-margin-desktop flex flex-col gap-gutter max-w-3xl">
      <LoadingOverlay visible={busy} label="Enregistrement…" />

      {tableAbsente && (
        <p className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
          La table <code>social_links</code> est introuvable ou vide : la migration n’a pas encore été jouée.
          L’enregistrement ne pourra rien modifier tant qu’elle ne l’est pas.
        </p>
      )}

      <p className="text-sm text-on-surface-variant">
        Liens affichés dans l’en-tête du site. Un réseau sans adresse, ou masqué, n’est pas affiché ; sans aucun
        lien, le groupe entier disparaît.
      </p>

      <ul className="flex flex-col gap-3">
        {RESEAUX.map((r) => {
          const e = erreurs[r];
          const url = nettoyerUrl(champs[r].url);
          return (
            <li key={r} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-2 w-32 shrink-0 text-primary">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width={18} height={18} fill="currentColor">
                    <path d={TRACES_RESEAUX[r]} />
                  </svg>
                  <span className="font-label-md text-label-md">{NOM_RESEAU[r]}</span>
                </span>
                <input
                  type="url"
                  value={champs[r].url}
                  onChange={(ev) => modifier(r, { url: ev.target.value })}
                  placeholder={EXEMPLE_URL[r]}
                  aria-label={`Adresse ${NOM_RESEAU[r]}`}
                  aria-invalid={e ? true : undefined}
                  className={`flex-1 min-w-[14rem] rounded-xl border bg-transparent px-3 py-2 text-sm ${
                    e ? 'border-error' : 'border-[#d6c2c3]'
                  }`}
                />
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={champs[r].visible}
                    onChange={(ev) => modifier(r, { visible: ev.target.checked })}
                  />
                  Afficher
                </label>
                {url && !e ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline underline-offset-2"
                  >
                    Tester
                  </a>
                ) : (
                  <span className="text-sm text-on-surface-variant/50">Tester</span>
                )}
              </div>
              {e && <p className="mt-2 text-sm text-error">{e}</p>}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={enregistrer}
          disabled={invalide || busy}
          className="font-label-md bg-primary text-on-primary px-5 py-2 rounded-pill text-sm hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        >
          Enregistrer
        </button>
        {enregistre && <span className="text-sm text-on-surface-variant">Enregistré ✓</span>}
      </div>

      <section aria-label="Aperçu de l’en-tête" className="flex flex-col gap-2">
        <span className="text-[10px] font-label-md uppercase tracking-widest text-on-surface-variant">Aperçu</span>
        <div className="rounded-xl border border-outline-variant bg-surface p-4 min-h-[3.5rem] flex items-center">
          {apercu.length ? (
            <SocialRondsApercu liens={apercu} />
          ) : (
            <span className="text-sm text-on-surface-variant">Aucun lien à afficher : le groupe est masqué.</span>
          )}
        </div>
      </section>
    </div>
  );
}
