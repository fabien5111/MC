'use client';

// Formulaire d'import (porté de importer.html) : onglets URL / texte collé →
// POST /api/import-url (auth par cookies, plus d'en-tête Bearer). Affiche l'état
// (analyse / succès / erreur) puis rafraîchit la liste serveur (router.refresh).
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Result = {
  id: number;
  titre: string;
  categorie: string;
  nbSp: number;
  nbIng: number;
  moule: string | null;
  alertes: string[];
};

export function ImporterForm() {
  const router = useRouter();
  const [tab, setTab] = useState<'url' | 'texte'>('url');
  const [url, setUrl] = useState('');
  const [texte, setTexte] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function launch(payload: { url: string } | { texte: string }, clear: () => void) {
    setBusy(true);
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

      const p = data.import.recette || {};
      const sps = p.sous_preparations || [];
      setResult({
        id: data.import.id,
        titre: p.titre || 'Sans titre',
        categorie: p.categorie || '—',
        nbSp: sps.length,
        nbIng: sps.reduce((n: number, sp: { ingredients?: unknown[] }) => n + (sp.ingredients?.length || 0), 0),
        moule: p.rendement?.moule?.libelle || null,
        alertes: data.alertes || [],
      });
      clear();
      router.refresh(); // met à jour « Mes imports » + quota (rendus serveur)
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submitUrl() {
    if (!url.trim()) {
      alert('Collez une adresse de recette.');
      return;
    }
    void launch({ url: url.trim() }, () => setUrl(''));
  }

  function submitText() {
    if (texte.trim().length < 80) {
      alert('Collez la recette complète (titre, ingrédients, étapes).');
      return;
    }
    void launch({ texte: texte.trim() }, () => setTexte(''));
  }

  const tabCls = (on: boolean) =>
    `px-6 py-3 font-label-md whitespace-nowrap ${
      on ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-primary'
    }`;

  return (
    <>
      <div className="flex border-b border-outline-variant mb-8 overflow-x-auto">
        <button onClick={() => setTab('url')} className={tabCls(tab === 'url')}>
          Depuis une URL
        </button>
        <button onClick={() => setTab('texte')} className={tabCls(tab === 'texte')}>
          Texte collé
        </button>
        <button className="px-6 py-3 font-label-md text-on-surface-variant/50 cursor-not-allowed whitespace-nowrap" title="Bientôt disponible">
          Photo <span className="text-[10px] uppercase bg-outline-variant/50 px-1.5 py-0.5 rounded ml-1">bientôt</span>
        </button>
        <button className="px-6 py-3 font-label-md text-on-surface-variant/50 cursor-not-allowed whitespace-nowrap" title="Bientôt disponible">
          PDF <span className="text-[10px] uppercase bg-outline-variant/50 px-1.5 py-0.5 rounded ml-1">bientôt</span>
        </button>
      </div>

      {tab === 'url' ? (
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="flex flex-col gap-1 flex-1 min-w-[260px]">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">
              Adresse de la recette
            </span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.exemple.fr/recette-paris-brest"
              className="border border-outline-variant rounded px-4 py-3 font-body-md bg-white focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </label>
          <button
            type="button"
            onClick={submitUrl}
            disabled={busy}
            className="bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md flex items-center gap-2 hover:shadow-lg transition-all active:scale-95 disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px]">download</span> Importer
          </button>
        </div>
      ) : (
        <div className="mb-4">
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">
              Texte de la recette
            </span>
            <textarea
              rows={12}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder="Collez ici la recette complète : titre, ingrédients, étapes… (depuis un livre, un e-mail, un document)"
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
      )}

      <div className="mb-8">
        {busy && (
          <div className="border border-outline-variant rounded-xl bg-surface-container-low p-5 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary animate-spin">progress_activity</span>
            <span className="font-body-md">Analyse en cours… (1 à 2 minutes pour les recettes longues)</span>
          </div>
        )}
        {!busy && result && (
          <div className="border border-green-700/40 rounded-xl bg-surface-container-lowest p-5">
            <p className="font-label-md text-label-md text-green-700 flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[18px]">check_circle</span> Recette importée en
              brouillon privé
            </p>
            <p className="font-headline-md text-[20px] text-primary">{result.titre}</p>
            <p className="text-sm text-on-surface-variant mt-1">
              {result.categorie} · {result.nbSp} sous-préparation{result.nbSp > 1 ? 's' : ''} · {result.nbIng}{' '}
              ingrédient{result.nbIng > 1 ? 's' : ''}
              {result.moule ? ' · ' + result.moule : ''}
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
