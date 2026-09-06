'use client';

// Formulaire d'import (porté de importer.html) : texte collé, PDF ou photos →
// POST /api/import-url (auth par cookies, plus d'en-tête Bearer). Affiche l'état
// (analyse / succès / erreur) puis rafraîchit la liste serveur (router.refresh).
//
// Le PDF suit exactement le même chemin que le texte collé : il est lu dans le
// navigateur (lib/pdf.ts) et c'est son texte qui part à l'analyse. Les photos
// qu'il contient sont extraites en même temps, puis écrites dans le brouillon
// une fois celui-ci créé (cf. `enregistrerPhotos`).
//
// L'import par photo se fait en deux temps, dans des requêtes distinctes :
// chaque page part seule à /api/transcribe-photo — toutes en parallèle —, puis
// le texte assemblé suit le chemin du texte collé. Une photo par requête n'est
// pas un détail : groupées, elles devaient tenir ensemble sous la limite de
// corps de requête de l'hébergeur, ce qui les réduisait à une définition où le
// texte d'une page de livre devenait illisible pour l'IA.
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
import { resizePhotoForAi } from '@/lib/images';
import { PhotoOrderList, type PhotoChoisie } from '@/components/importer/PhotoOrderList';
import { useDialog } from '@/components/Dialog';

type Result = {
  id: number;
  titre: string;
  nbSp: number;
  nbIng: number;
  rendement: string | null;
  alertes: string[];
  photos: number;
};

type Onglet = 'texte' | 'pdf' | 'photo';

const MAX_PDF_OCTETS = 30 * 1024 * 1024;
// Doit rester aligné sur les plafonds de la route : c'est elle qui refuse.
const MAX_PHOTOS = 8;

const tailleLisible = (octets: number): string =>
  octets < 1024 * 1024
    ? `${Math.max(1, Math.round(octets / 1024))} Ko`
    : `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;

export function ImporterForm({
  quotaImport = null,
}: {
  // État du quota `import_ia_mensuel` (`mc_check_quota`, affichage seulement
  // — le vrai refus reste porté par `mc_consume` dans /api/import-url) :
  // `null` si la lecture a échoué ou n'a pas eu lieu (best-effort, cf.
  // lib/entitlements-data.ts). Sert à griser les boutons « Importer » une
  // fois le quota mensuel épuisé, plutôt que de laisser découvrir le refus
  // après une tentative (JEP-77, même motif que BatchWidget).
  quotaImport?: { allowed: boolean; limit?: number; usage?: number } | null;
} = {}) {
  const router = useRouter();
  const dialog = useDialog();
  const [onglet, setOnglet] = useState<Onglet>('texte');
  const [texte, setTexte] = useState('');
  const [busy, setBusy] = useState(false);
  const [etape, setEtape] = useState('Analyse en cours…');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pdf, setPdf] = useState<File | null>(null);
  const [photos, setPhotos] = useState<PhotoChoisie[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const quotaEpuise = quotaImport != null && !quotaImport.allowed;
  const quotaTooltip = quotaEpuise
    ? `Quota d'imports par IA atteint ce mois-ci (${quotaImport?.usage ?? quotaImport?.limit}/${quotaImport?.limit}).`
    : undefined;

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
    payload: {
      texte?: string;
      source?: 'pdf' | 'photo';
      fichier?: string;
      fichiers?: string[];
      nb_photos?: number;
      usage_transcription?: { inputTokens: number; outputTokens: number };
    },
    images: { photos: PhotoPdf[]; ecartees: number; tronquee: boolean },
    clear: () => void,
  ) {
    setEtape('Analyse de la recette… (1 à 2 minutes pour les recettes longues)');
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
      dialog.alert('Collez la recette complète (titre, ingrédients, étapes).');
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
      dialog.alert('Choisissez un fichier PDF.');
      return;
    }
    if (f.size > MAX_PDF_OCTETS) {
      dialog.alert('Ce PDF dépasse 30 Mo. Réduisez-le ou extrayez-en les pages de la recette.');
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

  // ── Photos ──

  async function ajouterPhotos(fichiers: File[]) {
    // L'ordre d'un `FileList` ne reflète pas l'ordre de sélection : selon le
    // système, le sélecteur renvoie les fichiers dans l'ordre du dossier ou à
    // l'envers. On classe donc le lot par nom, en comparaison numérique pour
    // que « IMG_2 » précède « IMG_10 » — les photos de pages successives sont
    // presque toujours nommées en séquence. Chaque lot est classé pour
    // lui-même : un ordre déjà réglé à la main ne doit pas être défait par un
    // ajout ultérieur.
    const images = fichiers
      .filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|hei[cf])$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true, sensitivity: 'base' }));
    if (!images.length) {
      dialog.alert('Choisissez des photos (JPEG, PNG ou WebP).');
      return;
    }
    const libres = MAX_PHOTOS - photos.length;
    if (libres <= 0) {
      dialog.alert(`${MAX_PHOTOS} photos au maximum par import.`);
      return;
    }
    const aTraiter = images.slice(0, libres);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setEtape('Préparation des photos…');
      const nouvelles: PhotoChoisie[] = [];
      const echecs: string[] = [];
      for (const f of aTraiter) {
        try {
          const url = await resizePhotoForAi(f);
          nouvelles.push({
            id: `${f.name}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
            nom: f.name,
            url,
            octets: url.length,
          });
        } catch (e) {
          echecs.push(`${f.name} (${(e as Error).message})`);
        }
      }

      setPhotos([...photos, ...nouvelles]);

      const messages: string[] = [];
      if (echecs.length) messages.push(`Photo(s) non lisible(s) : ${echecs.join(', ')}.`);
      if (images.length > libres) {
        messages.push(`${MAX_PHOTOS} photos au maximum : les suivantes n’ont pas été ajoutées.`);
      }
      setError(messages.length ? messages.join(' ') : null);
    } finally {
      setBusy(false);
    }
  }

  function deplacerPhoto(de: number, vers: number) {
    setPhotos((prev) => {
      if (de === vers || de < 0 || vers < 0 || de >= prev.length || vers >= prev.length) return prev;
      const copie = [...prev];
      const [item] = copie.splice(de, 1);
      copie.splice(vers, 0, item);
      return copie;
    });
  }

  // Passe 1 : chaque page part seule, toutes en parallèle. Une requête par
  // photo lui laisse la limite entière de corps de requête, donc une définition
  // où le texte reste lisible par l'IA.
  async function transcrirePhotos(): Promise<{ texte: string; usage: { inputTokens: number; outputTokens: number } }> {
    let faites = 0;
    const total = photos.length;
    setEtape(`Lecture des photos… 0/${total}`);

    const resultats = await Promise.all(
      photos.map(async (p, i) => {
        const r = await fetch('/api/transcribe-photo', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image: p.url, page: i + 1 }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.erreur || `Photo ${i + 1} : erreur ${r.status}`);
        faites++;
        setEtape(`Lecture des photos… ${faites}/${total}`);
        return data as { texte: string; usage: { inputTokens: number; outputTokens: number } };
      }),
    );

    return {
      // `Promise.all` préserve l'ordre des entrées, quel que soit l'ordre
      // d'arrivée des réponses : les pages restent dans l'ordre de la liste.
      texte: resultats.map((r) => r.texte).join('\n\n'),
      usage: resultats.reduce(
        (acc, r) => ({
          inputTokens: acc.inputTokens + (r.usage?.inputTokens || 0),
          outputTokens: acc.outputTokens + (r.usage?.outputTokens || 0),
        }),
        { inputTokens: 0, outputTokens: 0 },
      ),
    };
  }

  async function submitPhotos() {
    if (!photos.length) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // Une page illisible retirerait silencieusement des ingrédients de la
      // recette : l'échec d'une seule interrompt l'import.
      const lu = await transcrirePhotos();
      await launch(
        {
          source: 'photo',
          texte: lu.texte,
          nb_photos: photos.length,
          usage_transcription: lu.usage,
          fichiers: photos.map((p) => p.nom),
        },
        { photos: [], ecartees: 0, tronquee: false },
        () => setPhotos([]),
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
      <LoadingOverlay visible={busy} label={etape} showLabel />

      <div className="flex border-b border-outline-variant mb-8 overflow-x-auto">
        <button type="button" onClick={() => setOnglet('texte')} className={ongletCls(onglet === 'texte')}>
          Texte collé
        </button>
        <button type="button" onClick={() => setOnglet('pdf')} className={ongletCls(onglet === 'pdf')}>
          PDF
        </button>
        <button type="button" onClick={() => setOnglet('photo')} className={ongletCls(onglet === 'photo')}>
          Photo
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
            disabled={busy || quotaEpuise}
            title={quotaTooltip}
            className="mt-3 bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md flex items-center gap-2 hover:shadow-lg transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">content_paste_go</span> Importer
          </button>
        </div>
      ) : onglet === 'pdf' ? (
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
            disabled={busy || !pdf || quotaEpuise}
            title={quotaTooltip}
            className="mt-3 bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md flex items-center gap-2 hover:shadow-lg transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:active:scale-100"
          >
            <span className="material-symbols-outlined text-[18px]">content_paste_go</span> Importer
          </button>
        </div>
      ) : (
        <div className="mb-4">
          <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">
            Photos de la recette
          </span>

          <PhotoOrderList
            photos={photos}
            onDeplacer={deplacerPhoto}
            onSupprimer={(id) => setPhotos((prev) => prev.filter((p) => p.id !== id))}
            disabled={busy}
          />

          {photos.length < MAX_PHOTOS && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Déposer des photos ou les choisir"
              onClick={() => photoRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') photoRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const fs = Array.from(e.dataTransfer.files || []);
                if (fs.length) void ajouterPhotos(fs);
              }}
              className={`mt-2 flex flex-col items-center justify-center gap-2 border border-dashed rounded-xl px-6 text-center cursor-pointer transition-colors ${
                photos.length ? 'py-6' : 'py-12'
              } ${dragOver ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-lowest'}`}
            >
              <span className="material-symbols-outlined text-4xl text-primary opacity-70">add_a_photo</span>
              <p className="font-label-md text-label-md text-primary">
                {photos.length ? 'Ajouter des photos' : 'Déposez vos photos ou cliquez pour les choisir'}
              </p>
              {!photos.length && (
                <p className="text-sm text-on-surface-variant max-w-[440px]">
                  Photographiez chaque page de la recette. L&apos;IA les lit dans l&apos;ordre de la liste :
                  réordonnez-les si besoin avant de lancer l&apos;import.
                </p>
              )}
              <p className="text-xs text-on-surface-variant/80">
                {MAX_PHOTOS} photos au maximum{photos.length ? ` — ${photos.length} ajoutée${photos.length > 1 ? 's' : ''}` : ''}
              </p>
            </div>
          )}

          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files || []);
              if (fs.length) void ajouterPhotos(fs);
              e.target.value = '';
            }}
          />

          <p className="text-sm text-on-surface-variant mt-3">
            Une photo se déchiffre, là où un texte se structure : relisez attentivement les quantités et les
            températures du brouillon obtenu.
          </p>

          <button
            type="button"
            onClick={() => void submitPhotos()}
            disabled={busy || !photos.length || quotaEpuise}
            title={quotaTooltip}
            className="mt-3 bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md flex items-center gap-2 hover:shadow-lg transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:active:scale-100"
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
