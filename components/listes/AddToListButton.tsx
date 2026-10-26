'use client';

// « Ajouter à une liste » (JEP-376, lots 2 et 3) : sur la fiche recette et sur
// les cartes du carnet. Le bouton n'a besoin que de l'identifiant de la recette :
// la fenêtre lit à l'ouverture (`GET /api/listes?recette=`) les listes du
// membre, celles qui contiennent la recette, le favori et les droits — rien
// n'est chargé d'avance pour chaque carte d'une grille.
//
// Une case par liste :
//  - « Favoris » : liste virtuelle, écrite dans `favorites` par le navigateur,
//    exactement comme le cœur (même notification nominative à l'auteur) ;
//  - « CAP » et listes personnelles : écrites par `POST /api/listes/contenu`
//    (droit vérifié côté serveur).
// Sans le droit, une liste reste visible ; on peut en RETIRER la recette, pas
// l'y ajouter (rétrogradation : rien n'est perdu).
//
// Fenêtre modale : ses écritures partent avec `refresh: false`, et c'est le
// bouton — qui reste monté — qui resynchronise à la fermeture, s'il y a eu un
// changement (cf. CLAUDE.md « Une fenêtre modale ne porte jamais sa propre
// resynchronisation »).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { connexionHref } from '@/lib/nav';
import { trackEvent } from '@/lib/analytics';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import {
  LISTE_KIND_CAP,
  NOM_LISTE_MAX,
  erreurNomListe,
  plafondListesAtteint,
  type ListeResume,
} from '@/lib/recipe-lists';

type Donnees = {
  listes: (ListeResume & { contient: boolean })[];
  favori: boolean;
  droits: { cap: boolean; perso: boolean; max: number | null };
};

export function AddToListButton({ recipeId, variante }: { recipeId: string; variante: 'fiche' | 'carte' }) {
  const [ouvert, setOuvert] = useState(false);
  const { busy, refresh } = useMutation();

  function ouvrir(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOuvert(true);
  }

  // Resynchronisation synchrone AVANT le démontage de la fenêtre : le voile du
  // bouton est déjà en place au rendu qui la ferme.
  function fermer(change: boolean) {
    if (change) refresh();
    setOuvert(false);
  }

  return (
    <>
      {variante === 'fiche' ? (
        <button
          type="button"
          onClick={ouvrir}
          aria-label="Ajouter à une liste"
          title="Ajouter à une liste"
          className="flex h-7 items-center gap-1 rounded-full border border-secondary px-2 text-secondary transition-colors hover:bg-secondary-container"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden>playlist_add</span>
          <span className="text-[11px] font-semibold">Listes</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={ouvrir}
          title="Ajouter à une liste"
          aria-label="Ajouter à une liste"
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
        >
          <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden>playlist_add</span>
        </button>
      )}
      <LoadingOverlay visible={busy} />
      {ouvert && createPortal(<AddToListDialog recipeId={recipeId} onClose={fermer} />, document.body)}
    </>
  );
}

function AddToListDialog({ recipeId, onClose }: { recipeId: string; onClose: (change: boolean) => void }) {
  const router = useRouter();
  const { busy, mutate } = useMutation();
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [change, setChange] = useState(false);
  const [nom, setNom] = useState('');
  const [erreurNom, setErreurNom] = useState<string | null>(null);
  const pressionSurVoile = useRef(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      const res = await fetch(`/api/listes?recette=${encodeURIComponent(recipeId)}`, { cache: 'no-store' });
      if (annule) return;
      if (res.status === 401) {
        router.push(connexionHref(window.location.pathname + window.location.search));
        return;
      }
      if (!res.ok) {
        setErreur('Vos listes ne peuvent pas être lues pour le moment.');
        return;
      }
      setDonnees((await res.json()) as Donnees);
    })().catch(() => !annule && setErreur('Vos listes ne peuvent pas être lues pour le moment.'));
    return () => {
      annule = true;
    };
  }, [recipeId, router]);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose(change);
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [busy, change, onClose]);

  const ecrireApi = (url: string, corps: unknown) => async () => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { error: null, json } : { error: { message: json?.erreur || 'Enregistrement impossible.' }, json };
  };

  async function basculerFavori() {
    if (!donnees || busy) return;
    const next = !donnees.favori;
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;
        return next
          ? supabase.from('favorites').upsert({ user_id: user.id, recipe_id: recipeId }, { onConflict: 'user_id,recipe_id', ignoreDuplicates: true })
          : supabase.from('favorites').delete().eq('user_id', user.id).eq('recipe_id', recipeId);
      },
      { errorLabel: next ? 'Favori non enregistré' : 'Favori non retiré', refresh: false },
    );
    if (!ok) return;
    trackEvent(next ? 'ajouter_favori' : 'retirer_favori', { recipe_id: recipeId });
    setDonnees({ ...donnees, favori: next });
    setChange(true);
  }

  async function basculerListe(l: Donnees['listes'][number]) {
    if (!donnees || busy) return;
    const next = !l.contient;
    const ok = await mutate(
      ecrireApi('/api/listes/contenu', { recipeId, liste: l.kind === LISTE_KIND_CAP ? LISTE_KIND_CAP : l.id, dans: next }),
      { errorLabel: next ? 'Ajout impossible' : 'Retrait impossible', refresh: false },
    );
    if (!ok) return;
    setDonnees({
      ...donnees,
      listes: donnees.listes.map((x) => (x.id === l.id ? { ...x, contient: next, nombre: x.nombre + (next ? 1 : -1) } : x)),
    });
    setChange(true);
  }

  // Liste CAP pas encore créée (aucun ajout jusqu'ici) : une ligne virtuelle,
  // que le premier ajout fait exister côté serveur.
  async function ajouterCapNouvelle() {
    if (!donnees || busy) return;
    const ok = await mutate(ecrireApi('/api/listes/contenu', { recipeId, liste: LISTE_KIND_CAP, dans: true }), {
      errorLabel: 'Ajout impossible',
      refresh: false,
    });
    if (!ok) return;
    setDonnees({
      ...donnees,
      listes: [{ id: LISTE_KIND_CAP, nom: 'CAP', kind: LISTE_KIND_CAP, position: 0, nombre: 1, contient: true }, ...donnees.listes],
    });
    setChange(true);
  }

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (!donnees || busy) return;
    const msg = erreurNomListe(nom);
    setErreurNom(msg);
    if (msg) return;
    let creee: ListeResume | null = null;
    const ok = await mutate(
      async () => {
        const r = await ecrireApi('/api/listes', { nom })();
        if (r.error) return r;
        creee = (r.json as { liste: ListeResume }).liste;
        // La recette entre aussitôt dans la liste qu'on vient de créer pour elle.
        return ecrireApi('/api/listes/contenu', { recipeId, liste: creee.id, dans: true })();
      },
      { errorLabel: 'Liste non créée', refresh: false },
    );
    setChange(true);
    const nouvelle = creee as ListeResume | null;
    if (!nouvelle) return;
    setDonnees({ ...donnees, listes: [...donnees.listes, { ...nouvelle, nombre: ok ? 1 : 0, contient: ok }] });
    setNom('');
  }

  const cap = donnees?.listes.find((l) => l.kind === LISTE_KIND_CAP) ?? null;
  const perso = donnees?.listes.filter((l) => l.kind !== LISTE_KIND_CAP) ?? [];
  const plafond = donnees ? plafondListesAtteint(perso.length, donnees.droits.max) : false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ajouter à une liste"
      className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-background/60 p-4 backdrop-blur-[2px]"
      onPointerDown={(e) => {
        pressionSurVoile.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const surVoile = pressionSurVoile.current && e.target === e.currentTarget;
        pressionSurVoile.current = false;
        if (surVoile && !busy) onClose(change);
      }}
    >
      <div className="my-12 flex w-full max-w-md flex-col rounded-xl border border-outline-variant bg-surface-container-low shadow-lg">
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant p-5">
          <h3 className="flex items-center gap-2 font-headline-md text-[20px] text-primary">
            <span className="material-symbols-outlined" aria-hidden>playlist_add</span>
            Ajouter à une liste
          </h3>
          <button type="button" onClick={() => onClose(change)} disabled={busy} aria-label="Fermer" className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {erreur && <p className="text-[14px] text-error">{erreur}</p>}
          <LoadingOverlay visible={(!donnees && !erreur) || busy} />
          {donnees && (
            <>
              <ul className="flex flex-col gap-2">
                <Ligne
                  icon="favorite"
                  nom="Favoris"
                  coche={donnees.favori}
                  onChange={basculerFavori}
                  disabled={busy}
                />
                {cap ? (
                  <Ligne
                    icon="school"
                    nom="CAP"
                    nombre={cap.nombre}
                    coche={cap.contient}
                    onChange={() => basculerListe(cap)}
                    disabled={busy || (!donnees.droits.cap && !cap.contient)}
                    verrou={donnees.droits.cap ? null : 'Le carnet CAP n’est pas inclus dans votre formule.'}
                  />
                ) : (
                  <Ligne
                    icon="school"
                    nom="CAP"
                    coche={false}
                    onChange={ajouterCapNouvelle}
                    disabled={busy || !donnees.droits.cap}
                    verrou={donnees.droits.cap ? null : 'Le carnet CAP n’est pas inclus dans votre formule.'}
                  />
                )}
                {perso.map((l) => (
                  <Ligne
                    key={l.id}
                    icon="list"
                    nom={l.nom}
                    nombre={l.nombre}
                    coche={l.contient}
                    onChange={() => basculerListe(l)}
                    disabled={busy || (!donnees.droits.perso && !l.contient)}
                    verrou={donnees.droits.perso ? null : 'Ajouter à cette liste demande une formule qui inclut les listes.'}
                  />
                ))}
              </ul>

              {donnees.droits.perso ? (
                plafond ? (
                  <p className="text-[13px] text-on-surface-variant">
                    Vous avez atteint les {donnees.droits.max} listes de votre formule. Supprimez-en une depuis Mon carnet → Mes listes pour en créer une autre.
                  </p>
                ) : (
                  <form onSubmit={creer} className="flex flex-col gap-1.5">
                    <label htmlFor={`nouvelle-liste-${recipeId}`} className="font-label-md text-[11px] font-semibold uppercase tracking-[0.12em] text-outline">
                      Nouvelle liste
                    </label>
                    <div className="flex gap-2">
                      <input
                        id={`nouvelle-liste-${recipeId}`}
                        type="text"
                        value={nom}
                        maxLength={NOM_LISTE_MAX}
                        onChange={(e) => {
                          setNom(e.target.value);
                          if (erreurNom) setErreurNom(null);
                        }}
                        placeholder="Noël, À tester, Examen blanc…"
                        className={`min-w-0 flex-1 rounded border bg-white px-3 py-2 text-[14px] outline-none focus:ring-1 focus:ring-primary ${
                          erreurNom ? 'border-error' : 'border-outline-variant'
                        }`}
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="shrink-0 rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary disabled:opacity-60"
                      >
                        Créer
                      </button>
                    </div>
                    {erreurNom && <p className="text-[12px] text-error">{erreurNom}</p>}
                  </form>
                )
              ) : (
                <p className="text-[13px] text-on-surface-variant">
                  Créer vos propres listes (Noël, À tester…) est inclus dans la formule Plus.{' '}
                  <Link href="/plans" prefetch={false} className="font-semibold text-primary underline">
                    Voir les formules
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// `icon` (et non un autre nom de prop) : `scripts/material-symbols.mjs` ne
// recense que les noms écrits sous `icon=` ou dans l'élément de l'icône.
function Ligne({
  icon,
  nom,
  nombre,
  coche,
  onChange,
  disabled,
  verrou = null,
}: {
  icon: string;
  nom: string;
  nombre?: number;
  coche: boolean;
  onChange: () => void;
  disabled: boolean;
  verrou?: string | null;
}) {
  return (
    <li>
      <label
        className={`flex items-center gap-3 rounded border border-outline-variant bg-white px-3 py-2.5 ${
          disabled ? 'opacity-60' : 'cursor-pointer hover:border-primary'
        }`}
        title={verrou ?? undefined}
      >
        <input type="checkbox" checked={coche} onChange={onChange} disabled={disabled} className="h-4 w-4 accent-primary" />
        <span className="material-symbols-outlined text-[18px] text-secondary" aria-hidden>
          {verrou ? 'block' : icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] text-on-surface">{nom}</span>
        {nombre != null && <span className="text-[12px] tabular-nums text-on-surface-variant">{nombre}</span>}
      </label>
    </li>
  );
}
