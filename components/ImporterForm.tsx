'use client';

// Formulaire d'import (porté de importer.html) : texte collé ou PDF →
// POST /api/import-url (auth par cookies, plus d'en-tête Bearer). Affiche l'état
// (analyse / succès / erreur) puis rafraîchit la liste serveur (router.refresh).
//
// Le PDF suit exactement le même chemin que le texte collé : il est lu dans le
// navigateur (lib/pdf.ts) et c'est son texte qui part à l'analyse. Les photos
// qu'il contient sont extraites en même temps, puis écrites dans le brouillon
// une fois celui-ci créé (cf. `enregistrerPhotos`).
//
// Pas d'import par URL : le JSON-LD schema.org des pages de recette liste les
// ingrédients à plat pour toute la recette, sans les rattacher à leurs étapes
// — un ingrédient réutilisé dans plusieurs étapes (ex. un chocolat pour un
// croustillant et pour une mousse) y perd sa répartition, et pousse l'IA à
// deviner un partage silencieusement faux. Le texte collé, qui garde la
// structure de la page telle que lue, n'a pas ce problème.
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { affecterPhotos, extrairePdf, type PhotoPdf } from '@/lib/pdf';

type Result = {
  id: number;
  titre: string;
  nbSp: number;
  nbIng: number;
  rendement: string | null;
  alertes: string[];
  photos: number;
};

type Onglet = 'texte' | 'pdf';

const MAX_PDF_OCTETS = 30 * 1024 * 1024;

const tailleLisible = (octets: number): string =>
  octets < 1024 * 1024
    ? `${Math.max(1, Math.round(octets / 1024))} Ko`
    : `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;

export function ImporterForm() {
  const router = useRouter();
  const [onglet, setOnglet] = useState<Onglet>('texte');
  const [texte, setTexte] = useState('');
  const [busy, setBusy] = useState(false);
  const [etape, setEtape] = useState('Analyse en cours…');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pdf, setPdf] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Écriture des photos extraites dans le brouillon, une fois celui-ci créé.
  // Elle passe par Supabase (RLS) plutôt que par la route : des data-URL
  // représentent vite plus d'un mégaoctet, à ne pas faire transiter par une
  // fonction serverless. Un échec ici ne perd que les photos, pas l'import.
  async function enregistrerPhotos(
    importRow: { id: number; recette: Record<string, any>; alertes?: unknown },
    photos: PhotoPdf[],
    ecartees: number,
    tronquee: boolean,
  ): Promise<{ pivot: Record<string, any>; alertes: string[]; nbPhotos: number }> {
    const pivot = { ...(importRow.recette || {}) };
    const alertes = Array.isArray(importRow.alertes) ? [...(importRow.alertes as string[])] : [];
    const { affectees, enBanque } = affecterPhotos(pivot, photos);
    const total = affectees + enBanque + (pivot.photo_principale ? 1 : 0);
    if (total > 0) {
      alertes.push(
        `${total} photo${total > 1 ? 's' : ''} extraite${total > 1 ? 's' : ''} du PDF : le rattachement aux étapes est déduit du numéro de page, à vérifier ci-dessous.`,
      );
    }
    // Le filtrage des éléments de mise en page ne doit pas être silencieux :
    // s'il écarte une photo d'étape, l'utilisateur doit pouvoir le constater.
    if (ecartees > 0) {
      alertes.push(
        `${ecartees} image${ecartees > 1 ? 's' : ''} du PDF écartée${ecartees > 1 ? 's' : ''} (jugée${ecartees > 1 ? 's' : ''} décorative${ecartees > 1 ? 's' : ''} : trop petite${ecartees > 1 ? 's' : ''} ou trop allongée${ecartees > 1 ? 's' : ''}).`,
      );
    }
    if (tronquee) {
      alertes.push(
        'Toutes les photos du PDF n’ont pas pu être reprises : le nombre ou le poids maximal a été atteint.',
      );
    }

    const supabase = createClient();
    const { error: err } = await supabase
      .from('imports')
      .update({ recette: pivot, alertes })
      .eq('id', importRow.id);
    if (err) {
      // Le brouillon existe déjà : on le signale sans faire échouer l'import.
      console.error('[import] photos non enregistrées :', err.message);
      return { pivot: importRow.recette || {}, alertes, nbPhotos: 0 };
    }
    return { pivot, alertes, nbPhotos: total };
  }

  async function launch(
    payload: { texte: string; source?: 'pdf'; fichier?: string },
    images: { photos: PhotoPdf[]; ecartees: number; tronquee: boolean },
    clear: () => void,
  ) {
    setEtape('Analyse en cours… (1 à 2 minutes pour les recettes longues)');
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/import-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({
        erreur:
          r.status === 504
            ? "L'analyse a dépassé le temps imparti — réessayez, la seconde tentative est souvent plus rapide."
            : `Réponse invalide du serveur (HTTP ${r.status}).`,
      }));
      if (!r.ok) throw new Error(data.erreur || `Erreur ${r.status}`);

      let pivot = data.import.recette || {};
      let alertes: string[] = data.alertes || [];
      let nbPhotos = 0;
      if (images.photos.length || images.ecartees || images.tronquee) {
        setEtape('Enregistrement des photos…');
        const maj = await enregistrerPhotos(data.import, images.photos, images.ecartees, images.tronquee);
        pivot = maj.pivot;
        alertes = maj.alertes;
        nbPhotos = maj.nbPhotos;
      }

      const sps = pivot.sous_preparations || [];
      setResult({
        id: data.import.id,
        titre: pivot.titre || 'Sans titre',
        nbSp: sps.length,
        nbIng: sps.reduce((n: number, sp: { ingredients?: unknown[] }) => n + (sp.ingredients?.length || 0), 0),
        // Rendement extrait en texte libre (le moule structuré se saisit à la relecture).
        rendement: pivot.rendement?.libelle_corrige || null,
        alertes,
        photos: nbPhotos,
      });
      clear();
      router.refresh(); // met à jour « Mes imports » + quota (rendus serveur)
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function submitText() {
    if (texte.trim().length < 80) {
      alert('Collez la recette complète (titre, ingrédients, étapes).');
      return;
    }
    setBusy(true);
    void launch({ texte: texte.trim() }, { photos: [], ecartees: 0, tronquee: false }, () => setTexte('')).finally(() =>
      setBusy(false),
    );
  }

  // Le fichier est retenu au dépôt, l'analyse n'est lancée qu'au clic sur
  // « Importer » : elle consomme le quota journalier, elle ne doit pas partir
  // sur un fichier déposé par erreur.
  function choisirPdf(f: File) {
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      alert('Choisissez un fichier PDF.');
      return;
    }
    if (f.size > MAX_PDF_OCTETS) {
      alert('Ce PDF dépasse 30 Mo. Réduisez-le ou extrayez-en les pages de la recette.');
      return;
    }
    setError(null);
    setResult(null);
    setPdf(f);
  }

  async function submitPdf() {
    if (!pdf) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setEtape('Lecture du PDF…');
      const extraction = await extrairePdf(pdf, (page, total) =>
        setEtape(`Lecture du PDF… page ${page} / ${total}`),
      );
      if (extraction.texte.replace(/--- page \d+ ---/g, '').trim().length < 80) {
        throw new Error(
          "Ce PDF ne contient pas de texte exploitable : c'est probablement un scan ou une suite d'images. Copiez-collez la recette dans l'onglet « Texte collé ».",
        );
      }
      await launch(
        { texte: extraction.texte, source: 'pdf', fichier: pdf.name },
        { photos: extraction.photos, ecartees: extraction.ecartees, tronquee: extraction.tronquee },
        () => setPdf(null),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ongletCls = (actif: boolean) =>
    `px-6 py-3 font-label-md whitespace-nowrap border-b-2 ${
      actif ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-primary'
    }`;

  return (
    <>
      <LoadingOverlay visible={busy} label={etape} />

      <div className="flex border-b border-outline-variant mb-8 overflow-x-auto">
        <button type="button" onClick={() => setOnglet('texte')} className={ongletCls(onglet === 'texte')}>
          Texte collé
        </button>
        <button type="button" onClick={() => setOnglet('pdf')} className={ongletCls(onglet === 'pdf')}>
          PDF
        </button>
        <button
          type="button"
          disabled
          className="px-6 py-3 font-label-md text-on-surface-variant/50 cursor-not-allowed whitespace-nowrap"
          title="Bientôt disponible"
        >
          Photo <span className="text-[10px] uppercase bg-outline-variant/50 px-1.5 py-0.5 rounded ml-1">bientôt</span>
        </button>
      </div>

      {onglet === 'texte' ? (
        <div className="mb-4">
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">
              Texte de la recette
            </span>
            <textarea
              rows={12}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder="Collez ici la recette complète : titre, ingrédients, étapes… (depuis un livre, un e-mail, un document, ou copié depuis une page web)"
              className="border border-outline-variant rounded px-4 py-3 font-body-md bg-white focus:ring-1 focus:ring-primary focus:border-primary w-full"
            />
          </label>
          <button
            type="button"
            onClick={submitText}
            disabled={busy}
            className="mt-3 bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md flex items-center gap-2 hover:shadow-lg transition-all active:scale-95 disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px]">content_paste_go</span> Importer
          </button>
        </div>
      ) : (
        <div className="mb-4">
          <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">
            Fichier PDF
          </span>
          {pdf ? (
            <div className="mt-1 flex items-center gap-3 border border-outline-variant rounded-xl px-4 py-3 bg-surface-container-lowest">
              <span className="material-symbols-outlined text-primary">picture_as_pdf</span>
              <span className="font-body-md flex-1 min-w-0 truncate" title={pdf.name}>
                {pdf.name}
              </span>
              <span className="text-sm text-on-surface-variant whitespace-nowrap">{tailleLisible(pdf.size)}</span>
              <button
                type="button"
                onClick={() => setPdf(null)}
                disabled={busy}
                title="Retirer ce fichier"
                aria-label="Retirer ce fichier"
                className="shrink-0 w-9 h-9 rounded-full text-error flex items-center justify-center hover:bg-error hover:text-on-error transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label="Déposer un PDF ou choisir un fichier"
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) choisirPdf(f);
              }}
              className={`mt-1 flex flex-col items-center justify-center gap-2 border border-dashed rounded-xl px-6 py-12 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-lowest'
              }`}
            >
              <span className="material-symbols-outlined text-4xl text-primary opacity-70">picture_as_pdf</span>
              <p className="font-label-md text-label-md text-primary">Déposez un PDF ou cliquez pour le choisir</p>
              <p className="text-sm text-on-surface-variant max-w-[420px]">
                La recette est lue dans votre navigateur : le fichier ne quitte pas votre appareil, seul son texte
                est analysé. Les photos qu&apos;il contient sont récupérées et rattachées aux étapes.
              </p>
              <p className="text-xs text-on-surface-variant/80">30 Mo maximum, 40 pages analysées au plus</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) choisirPdf(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => void submitPdf()}
            disabled={busy || !pdf}
            className="mt-3 bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md flex items-center gap-2 hover:shadow-lg transition-all active:scale-95 disabled:opacity-60 disabled:hover:shadow-none disabled:active:scale-100"
          >
            <span className="material-symbols-outlined text-[18px]">content_paste_go</span> Importer
          </button>
        </div>
      )}

      <div className="mb-8">
        {!busy && result && (
          <div className="border border-green-700/40 rounded-xl bg-surface-container-lowest p-5">
            <p className="font-label-md text-label-md text-green-700 flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[18px]">check_circle</span> Recette importée en
              brouillon privé
            </p>
            <p className="font-headline-md text-[20px] text-primary">{result.titre}</p>
            <p className="text-sm text-on-surface-variant mt-1">
              {result.nbSp} étape{result.nbSp > 1 ? 's' : ''} · {result.nbIng} ingrédient
              {result.nbIng > 1 ? 's' : ''}
              {result.rendement ? ' · ' + result.rendement : ''}
              {result.photos > 0 ? ` · ${result.photos} photo${result.photos > 1 ? 's' : ''}` : ''}
            </p>
            {result.alertes.length > 0 && (
              <div className="mt-3 p-3 bg-error-container/40 rounded">
                <p className="font-label-md text-[11px] uppercase tracking-widest text-error mb-1">
                  À vérifier à la relecture
                </p>
                {result.alertes.map((a, k) => (
                  <p key={k} className="text-sm">
                    • {a}
                  </p>
                ))}
              </div>
            )}
            <Link
              href={`/relecture/${result.id}`}
              className="inline-flex items-center gap-2 mt-3 text-primary font-label-md text-label-md hover:underline"
            >
              <span className="material-symbols-outlined text-[18px]">fact_check</span> Relire et créer la
              recette
            </Link>
          </div>
        )}
        {!busy && error && (
          <div className="border border-error/40 rounded-xl bg-error-container/30 p-5">
            <p className="font-label-md text-label-md text-error flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span> {error}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
