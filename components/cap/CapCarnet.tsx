'use client';

// Aperçu et impression du carnet CAP (JEP-6) : une recette, une fournée ou
// plusieurs recettes du carnet. Ne rend QUE ce que `lib/carnet-cap.ts` a
// retenu (titre, rendement, préparations, ingrédient / quantité / unité) —
// aucune autre donnée de la recette n'arrive jusqu'ici.
//
// Les noms de préparation sont modifiables à l'écran, sans être enregistrés :
// ils viennent du titre de l'étape (« Monter les blancs » décrirait une
// technique, motif de retrait du carnet par le jury). Un repère signale un nom
// suspect (`nomPreparationSuspect`), sans jamais bloquer l'impression.
import { useState } from 'react';
import Link from 'next/link';
import { fmtPoids, nomPreparationSuspect, poidsTotalCap, type CapFiche } from '@/lib/carnet-cap';

type Props = {
  fiches: CapFiche[];
  /** Titre de l'écran (jamais imprimé). */
  titreEcran: string;
  retour: { href: string; label: string };
  /** Carnet de plusieurs recettes : sommaire et « une recette par page ». */
  carnet?: boolean;
};

export function CapCarnet({ fiches, titreEcran, retour, carnet = false }: Props) {
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [poidsTotal, setPoidsTotal] = useState(true);
  const [sommaire, setSommaire] = useState(carnet);
  const [unParPage, setUnParPage] = useState(false);

  const nomDe = (fiche: CapFiche, cle: string, defaut: string) => noms[`${fiche.cle}/${cle}`] ?? defaut;
  const suspects = fiches.reduce(
    (n, f) => n + (f.preparations.length > 1 ? f.preparations.filter((p) => nomPreparationSuspect(nomDe(f, p.cle, p.nom))).length : 0),
    0,
  );

  return (
    <div className="mx-auto max-w-[900px] px-margin-mobile pb-24 pt-8 md:px-margin-desktop print:max-w-none print:p-0">
      <div className="no-print mb-8 space-y-4">
        <Link href={retour.href} prefetch={false} className="inline-flex items-center gap-1 text-[13px] text-on-surface-variant hover:text-primary">
          <span className="material-symbols-outlined text-[18px]" aria-hidden>
            arrow_back
          </span>
          {retour.label}
        </Link>
        <h1 className="font-headline-lg text-[26px] font-bold leading-tight text-primary md:text-[32px]">{titreEcran}</h1>
        <div className="space-y-2 rounded-lg border border-outline-variant bg-surface-container-low p-4 text-[14px] text-on-surface">
          <p>
            Au CAP Pâtissier (EP1 / EP2), le carnet de recettes papier ne doit contenir{' '}
            <strong>que les ingrédients et leurs quantités</strong> : aucune technique, aucun procédé, aucune température.
            Cette feuille n’imprime que cela, chaque quantité une seule fois.
          </p>
          <p>
            Les noms des préparations viennent des titres de vos étapes : relisez-les et corrigez ceux qui décrivent un
            geste (« Monter les blancs » → « Meringue »). La correction ne sert qu’à cette impression.
          </p>
          <p className="text-[12px] text-on-surface-variant">
            Le jury reste seul juge de la conformité de votre carnet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px]">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={poidsTotal} onChange={(e) => setPoidsTotal(e.target.checked)} className="accent-primary" />
            Poids total des préparations
          </label>
          {carnet && (
            <>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={sommaire} onChange={(e) => setSommaire(e.target.checked)} className="accent-primary" />
                Sommaire
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={unParPage} onChange={(e) => setUnParPage(e.target.checked)} className="accent-primary" />
                Une recette par page
              </label>
            </>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!fiches.length}
            className="ml-auto flex items-center gap-1.5 rounded-pill bg-primary px-5 py-2.5 text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              print
            </span>
            Imprimer
          </button>
        </div>
        {suspects > 0 && (
          <p className="rounded border border-amber-600 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            {suspects === 1
              ? '1 nom de préparation ressemble à une technique (verbe, température ou durée) : vérifiez-le ci-dessous.'
              : `${suspects} noms de préparation ressemblent à une technique (verbe, température ou durée) : vérifiez-les ci-dessous.`}
          </p>
        )}
      </div>

      {!fiches.length && <p className="text-on-surface-variant">Aucune recette à imprimer.</p>}

      {carnet && sommaire && fiches.length > 1 && (
        <nav className="cap-sommaire mb-8 break-after-page">
          <h2 className="mb-3 text-center text-[20px] font-bold text-black">Carnet de recettes — CAP Pâtissier</h2>
          <ol className="columns-1 gap-8 text-[13px] text-black sm:columns-2 print:columns-2">
            {fiches.map((f) => (
              <li key={f.cle} className="break-inside-avoid border-b border-dotted border-black/30 py-0.5">
                {f.titre}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="space-y-6 print:space-y-4">
        {fiches.map((f, i) => (
          <article
            key={f.cle}
            className={`cap-fiche break-inside-avoid border border-dashed border-black/70 bg-white p-5 text-black print:p-4 ${
              unParPage && i > 0 ? 'break-before-page' : ''
            }`}
          >
            <header className="mb-4 border-b border-black pb-2 text-center">
              <h2 className="text-[18px] font-bold">{f.titre}</h2>
              {f.rendement && <p className="text-[13px]">({f.rendement})</p>}
            </header>
            {!f.preparations.length && <p className="text-[13px] italic">Aucun ingrédient saisi.</p>}
            <div className={`grid gap-x-10 gap-y-5 ${f.preparations.length > 1 ? 'sm:grid-cols-2 print:grid-cols-2' : 'mx-auto max-w-sm'}`}>
              {f.preparations.map((p) => {
                const nom = nomDe(f, p.cle, p.nom);
                const plusieurs = f.preparations.length > 1;
                const suspect = plusieurs && nomPreparationSuspect(nom);
                const poids = poidsTotal ? poidsTotalCap(p) : null;
                return (
                  <section key={p.cle} className="break-inside-avoid">
                    {plusieurs && (
                      <>
                        <input
                          value={nom}
                          onChange={(e) => setNoms((n) => ({ ...n, [`${f.cle}/${p.cle}`]: e.target.value }))}
                          aria-label={`Nom de la préparation « ${p.nom} »`}
                          className={`no-print mb-1 w-full border-0 border-b border-dashed bg-transparent px-0 py-0.5 text-[14px] font-bold underline focus:outline-none ${
                            suspect ? 'border-amber-600 bg-amber-50' : 'border-black/40'
                          }`}
                        />
                        {suspect && (
                          <p className="no-print mb-1 text-[11px] text-amber-800">Ressemble à une technique : renommez la préparation.</p>
                        )}
                        <h3 className="mb-1 hidden text-[14px] font-bold underline print:block">{nom}</h3>
                      </>
                    )}
                    <table className="w-full text-[13px] leading-snug">
                      <tbody>
                        {p.lignes.map((l, k) => (
                          // Filet pointillé sous chaque ingrédient : il guide l'œil du
                          // nom à sa quantité. Pas sous la dernière ligne quand « Poids
                          // total » suit, dont le trait plein joue déjà ce rôle.
                          <tr
                            key={k}
                            className={poids != null && k === p.lignes.length - 1 ? '' : 'border-b border-dotted border-black/50'}
                          >
                            <td className="py-0.5 pr-3 align-top">{l.nom}</td>
                            <td className="whitespace-nowrap py-0.5 text-right align-top tabular-nums">
                              {[l.quantite, l.unite].filter(Boolean).join(' ')}
                            </td>
                          </tr>
                        ))}
                        {poids != null && (
                          <tr className="border-t border-black/40 font-bold">
                            <td className="pt-1 pr-3">Poids total</td>
                            <td className="whitespace-nowrap pt-1 text-right tabular-nums">{fmtPoids(poids)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </section>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
