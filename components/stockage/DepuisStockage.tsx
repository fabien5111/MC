'use client';

// Bouton « Depuis… » (JEP-408) : choisir une photo, un PDF ou un texte dans un
// stockage en ligne. Un seul composant pour tous les emplacements (ImageSlot,
// photos de fournée, trois onglets de l'import). Le fichier rendu suit ensuite
// le chemin d'un fichier local : l'appelant reçoit des `File`, ou un texte.
//
// Trois façons de choisir, selon ce que chaque fournisseur offre :
//  - un sélecteur officiel affiché par-dessus la page (Google Drive, Dropbox) ;
//  - un choix dans un onglet de Google Photos, attendu ici (deux clics : un
//    onglet ouvert après des appels réseau serait bloqué par le navigateur) ;
//  - un explorateur dans cette fenêtre, après une connexion par fenêtre
//    (OneDrive, OneNote, Notion).
//
// Aucun jeton ne survit à la fenêtre : il vit dans l'état de ce composant le
// temps du choix, et disparaît avec lui.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { LockedAction } from '@/components/LockedAction';
import { useDialog } from '@/components/Dialog';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import { useStockageEnLigne } from '@/components/stockage/StockageEnLigneProvider';
import { sourcesPour, type DefinitionSource, type IdSource, type UsageStockage } from '@/lib/stockage-en-ligne';
import { ErreurStockage, ouvrirFenetreVide, type Element, type Explorateur, type Selection } from './sources/commun';
import {
  choisirDansDrive,
  ouvrirGooglePhotos,
  prechargerGoogle,
  preparerGooglePhotos,
  recupererGooglePhotos,
  type SessionPhotos,
} from './sources/google';
import { choisirDansDropbox, prechargerDropbox } from './sources/dropbox';
import { PORTEE_ONEDRIVE, PORTEE_ONENOTE, connecterMicrosoft, explorateurOneDrive, explorateurOneNote } from './sources/microsoft';
import { connecterNotion, explorateurNotion } from './sources/notion';

export type DepuisStockageProps = {
  usage: UsageStockage;
  /** Nombre de fichiers acceptés en une fois (1 par défaut). */
  max?: number;
  onFichiers?: (fichiers: File[]) => void;
  /** Usage `texte` : texte de la recette et nom du document d'origine. */
  onTexte?: (texte: string, nom: string) => void;
  /** `pastille` : petit rond superposé (emplacement de photo) ; `bouton` : bouton secondaire. */
  variante?: 'pastille' | 'bouton';
  className?: string;
  disabled?: boolean;
};

const LIBELLE = 'Depuis un stockage en ligne';
const MESSAGE_VERROU =
  "Choisir une photo ou une recette dans Google Drive, Dropbox, Google Photos, OneDrive, OneNote ou Notion n'est pas inclus dans votre formule.";

type Etat =
  | { vue: 'sources' }
  | { vue: 'externe' }
  | { vue: 'photos'; session: SessionPhotos; attente: boolean }
  | { vue: 'explorer'; source: DefinitionSource; explorateur: Explorateur };

export function DepuisStockage({
  usage,
  max = 1,
  onFichiers,
  onTexte,
  variante = 'bouton',
  className = '',
  disabled = false,
}: DepuisStockageProps) {
  const valeur = useStockageEnLigne();
  const peutEcrire = useWriteGuard();
  const [ouvert, setOuvert] = useState(false);
  const sources = valeur ? sourcesPour(usage, valeur.config) : [];
  if (!valeur || !sources.length || max < 1) return null;

  const contenu =
    variante === 'pastille' ? (
      <span className="material-symbols-outlined text-[18px]" aria-hidden>
        cloud_download
      </span>
    ) : (
      <>
        <span className="material-symbols-outlined text-[18px]" aria-hidden>
          cloud_download
        </span>
        Depuis…
      </>
    );
  const classes =
    variante === 'pastille'
      ? `w-8 h-8 rounded-full bg-surface/90 text-on-surface flex items-center justify-center shadow-md hover:bg-primary hover:text-on-primary transition-colors ${className}`
      : `inline-flex items-center gap-2 border border-primary text-primary rounded-full px-5 py-2 font-label-md text-label-md hover:bg-primary/5 transition-colors disabled:opacity-60 ${className}`;

  if (!valeur.autorise) {
    return (
      <span onClick={(e) => e.stopPropagation()} className={variante === 'pastille' ? className : ''}>
        <LockedAction label={LIBELLE} message={MESSAGE_VERROU} className={variante === 'pastille' ? 'rounded-full bg-surface/90 p-1.5 shadow-md' : ''}>
          {variante === 'bouton' ? 'Depuis…' : null}
        </LockedAction>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={`${LIBELLE} (${sources.map((s) => s.nom).join(', ')})`}
        aria-label={LIBELLE}
        className={classes}
        onClick={(e) => {
          e.stopPropagation();
          if (!peutEcrire('Stockage en ligne')) return;
          setOuvert(true);
        }}
      >
        {contenu}
      </button>
      {ouvert &&
        createPortal(
          <FenetreStockage
            usage={usage}
            max={max}
            sources={sources}
            onClose={() => setOuvert(false)}
            onSelection={(sel) => {
              setOuvert(false);
              if (!sel) return;
              if ('fichiers' in sel) onFichiers?.(sel.fichiers.slice(0, max));
              else onTexte?.(sel.texte, sel.nom);
            }}
          />,
          document.body,
        )}
    </>
  );
}

function FenetreStockage({
  usage,
  max,
  sources,
  onClose,
  onSelection,
}: {
  usage: UsageStockage;
  max: number;
  sources: DefinitionSource[];
  onClose: () => void;
  onSelection: (sel: Selection) => void;
}) {
  const valeur = useStockageEnLigne()!;
  const config = valeur.config;
  const dialog = useDialog();
  const [etat, setEtat] = useState<Etat>({ vue: 'sources' });
  const [busy, setBusy] = useState(false);
  const pressionSurVoile = useRef(false);
  const attentePhotos = useRef<AbortController | null>(null);
  const monte = useRef(true);

  useEffect(() => {
    monte.current = true;
    // Les scripts des sélecteurs sont chargés dès l'ouverture : au clic, la
    // fenêtre du fournisseur doit s'ouvrir sans attente, sinon le navigateur
    // la bloque (elle ne serait plus liée au geste du membre).
    const ids = new Set(sources.map((s) => s.id));
    if (config.google && ids.has('google_drive')) void prechargerGoogle(true).catch(() => {});
    else if (config.googlePhotos && ids.has('google_photos')) void prechargerGoogle(false).catch(() => {});
    if (config.dropbox && ids.has('dropbox')) void prechargerDropbox(config.dropbox).catch(() => {});
    return () => {
      monte.current = false;
      attentePhotos.current?.abort();
    };
  }, [config, sources]);

  const echec = useCallback(
    (e: unknown) => {
      if (!monte.current) return;
      setBusy(false);
      setEtat({ vue: 'sources' });
      const message = e instanceof ErreurStockage ? e.message : 'Le choix a échoué. Réessayez.';
      void dialog.alert(message);
    },
    [dialog],
  );

  const terminer = useCallback(
    (sel: Selection) => {
      if (!monte.current) return;
      setBusy(false);
      if (!sel) {
        setEtat({ vue: 'sources' });
        return;
      }
      if ('texte' in sel && !sel.texte.trim()) {
        setEtat({ vue: 'sources' });
        void dialog.alert(`« ${sel.nom} » ne contient aucun texte à importer.`);
        return;
      }
      onSelection(sel);
    },
    [dialog, onSelection],
  );

  // Connexion par fenêtre (Microsoft, Notion) : la fenêtre s'ouvre ICI, dans
  // le geste du clic, avant tout `await`.
  function connecterPuisExplorer(source: DefinitionSource, connecter: (f: Window) => Promise<Explorateur | null>) {
    const fenetre = ouvrirFenetreVide();
    if (!fenetre) {
      void dialog.alert('La fenêtre de connexion a été bloquée : autorisez les fenêtres pour ce site et réessayez.');
      return;
    }
    setBusy(true);
    connecter(fenetre)
      .then((explorateur) => {
        if (!monte.current) return;
        setBusy(false);
        if (explorateur) setEtat({ vue: 'explorer', source, explorateur });
      })
      .catch((e) => {
        try {
          fenetre.close();
        } catch {
          /* déjà fermée */
        }
        echec(e);
      });
  }

  function choisir(id: IdSource) {
    const source = sources.find((s) => s.id === id)!;
    switch (id) {
      case 'google_drive':
        choisirDansDrive(config.google!, usage, max, {
          avantAffichage: () => setEtat({ vue: 'externe' }),
          avantTelechargement: () => setBusy(true),
        }).then(terminer, echec);
        return;
      case 'dropbox':
        setEtat({ vue: 'externe' });
        choisirDansDropbox(config.dropbox!, usage, max, () => setBusy(true)).then(terminer, echec);
        return;
      case 'google_photos':
        setBusy(true);
        preparerGooglePhotos(config.googlePhotos!, max).then((session) => {
          if (!monte.current) return;
          setBusy(false);
          if (session) setEtat({ vue: 'photos', session, attente: false });
        }, echec);
        return;
      case 'onedrive':
        connecterPuisExplorer(source, async (f) => {
          const jeton = await connecterMicrosoft(config.microsoft!.clientId, PORTEE_ONEDRIVE, f);
          return jeton ? explorateurOneDrive(jeton, usage) : null;
        });
        return;
      case 'onenote':
        connecterPuisExplorer(source, async (f) => {
          const jeton = await connecterMicrosoft(config.microsoft!.clientId, PORTEE_ONENOTE, f);
          return jeton ? explorateurOneNote(jeton) : null;
        });
        return;
      case 'notion':
        connecterPuisExplorer(source, async (f) => {
          const jeton = await connecterNotion(config.notion!.clientId, f);
          return jeton ? explorateurNotion(jeton) : null;
        });
        return;
    }
  }

  function ouvrirPhotos(session: SessionPhotos) {
    ouvrirGooglePhotos(session);
    setEtat({ vue: 'photos', session, attente: true });
    attentePhotos.current?.abort();
    const ctrl = new AbortController();
    attentePhotos.current = ctrl;
    recupererGooglePhotos(session, max, ctrl.signal, () => setBusy(true)).then(terminer, echec);
  }

  const fermer = useCallback(() => {
    if (busy) return;
    attentePhotos.current?.abort();
    onClose();
  }, [busy, onClose]);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer();
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [fermer]);

  // Enveloppé : un portail propage ses clics aux ancêtres React (l'emplacement
  // de photo ouvrirait sinon le sélecteur de fichiers de l'appareil).
  if (busy)
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <LoadingOverlay visible label="Récupération en cours…" showLabel />
      </div>
    );
  // Sélecteur du fournisseur affiché : la fenêtre du site s'efface.
  if (etat.vue === 'externe') return null;

  const titre =
    etat.vue === 'explorer'
      ? etat.source.nom
      : etat.vue === 'photos'
        ? 'Google Photos'
        : usage === 'texte'
          ? 'Importer un texte depuis…'
          : usage === 'pdf'
            ? 'Importer un PDF depuis…'
            : max > 1
              ? 'Ajouter des photos depuis…'
              : 'Ajouter une photo depuis…';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      className="fixed inset-0 z-[105] flex items-start justify-center overflow-y-auto bg-background/60 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        e.stopPropagation();
        const surVoile = pressionSurVoile.current && e.target === e.currentTarget;
        pressionSurVoile.current = false;
        if (surVoile) fermer();
      }}
      onPointerDown={(e) => {
        pressionSurVoile.current = e.target === e.currentTarget;
      }}
    >
      <div className="my-12 flex w-full max-w-lg flex-col rounded-xl border border-outline-variant bg-surface-container-low shadow-lg">
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant p-5">
          <h3 className="flex items-center gap-2 font-headline-md text-[20px] text-primary">
            <span className="material-symbols-outlined" aria-hidden>
              cloud_download
            </span>
            {titre}
          </h3>
          <button type="button" onClick={fermer} aria-label="Fermer" className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {etat.vue === 'sources' && (
          <div className="p-5">
            <ul className="flex flex-col gap-2">
              {sources.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => choisir(s.id)}
                    className="w-full flex items-center gap-3 rounded-lg border border-outline-variant bg-surface px-4 py-3 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-primary" aria-hidden>
                      {s.icon}
                    </span>
                    <span className="font-body-md flex-1">{s.nom}</span>
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]" aria-hidden>
                      chevron_right
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-on-surface-variant">
              Vous vous connectez directement chez le service choisi. Je pâtisse ! ne lit que ce que vous sélectionnez
              et ne garde aucun accès à votre compte.
            </p>
          </div>
        )}

        {etat.vue === 'photos' && (
          <div className="p-5 flex flex-col gap-4">
            {etat.attente ? (
              <>
                <p className="font-body-md">
                  Choisissez vos photos dans l&apos;onglet Google Photos, puis validez : elles arriveront ici
                  automatiquement.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => ouvrirGooglePhotos(etat.session)}
                    className="inline-flex items-center gap-2 border border-primary text-primary rounded-full px-5 py-2 font-label-md text-label-md"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden>
                      open_in_new
                    </span>
                    Rouvrir Google Photos
                  </button>
                  <button type="button" onClick={fermer} className="px-5 py-2 font-label-md text-label-md text-on-surface-variant">
                    Annuler
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="font-body-md">
                  Connexion réussie. Google Photos va s&apos;ouvrir dans un nouvel onglet
                  {max > 1 ? ` : choisissez jusqu'à ${max} photos.` : ' : choisissez une photo.'}
                </p>
                <button
                  type="button"
                  onClick={() => ouvrirPhotos(etat.session)}
                  className="self-start inline-flex items-center gap-2 bg-primary text-on-primary rounded-full px-6 py-2.5 font-label-md text-label-md"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden>
                    photo_library
                  </span>
                  Ouvrir Google Photos
                </button>
              </>
            )}
          </div>
        )}

        {etat.vue === 'explorer' && (
          <NavigateurElements
            explorateur={etat.explorateur}
            max={usage === 'texte' ? 1 : max}
            onRetour={() => setEtat({ vue: 'sources' })}
            onValider={(choisis) => {
              setBusy(true);
              etat.explorateur.recuperer(choisis).then(terminer, echec);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Explorateur d'une source parcourue dans la fenêtre du site (OneDrive, OneNote, Notion). */
function NavigateurElements({
  explorateur,
  max,
  onRetour,
  onValider,
}: {
  explorateur: Explorateur;
  max: number;
  onRetour: () => void;
  onValider: (choisis: Element[]) => void;
}) {
  const [chemin, setChemin] = useState<Element[]>([]);
  const [recherche, setRecherche] = useState('');
  const [elements, setElements] = useState<Element[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [choisis, setChoisis] = useState<Element[]>([]);
  const parent = chemin[chemin.length - 1] ?? null;

  useEffect(() => {
    let annule = false;
    const delai = window.setTimeout(
      () => {
        setChargement(true);
        setErreur(null);
        explorateur
          .lister(parent, recherche)
          .then((liste) => {
            if (!annule) setElements(liste);
          })
          .catch((e) => {
            if (!annule) setErreur(e instanceof ErreurStockage ? e.message : 'La liste ne peut pas être lue.');
          })
          .finally(() => {
            if (!annule) setChargement(false);
          });
      },
      recherche ? 350 : 0,
    );
    return () => {
      annule = true;
      window.clearTimeout(delai);
    };
  }, [explorateur, parent, recherche]);

  function basculer(el: Element) {
    if (max === 1) {
      onValider([el]);
      return;
    }
    setChoisis((prev) => {
      if (prev.some((c) => c.id === el.id)) return prev.filter((c) => c.id !== el.id);
      if (prev.length >= max) return prev;
      return [...prev, el];
    });
  }

  return (
    <div className="p-5 flex flex-col gap-3">
      <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Emplacement">
        <button type="button" onClick={onRetour} className="inline-flex items-center gap-1 text-on-surface-variant hover:text-primary">
          <span className="material-symbols-outlined text-[18px]" aria-hidden>
            arrow_back
          </span>
          Sources
        </button>
        <span className="text-on-surface-variant">/</span>
        <button
          type="button"
          onClick={() => {
            setChemin([]);
            setRecherche('');
          }}
          className="text-primary hover:underline"
        >
          {explorateur.racine}
        </button>
        {chemin.map((d, i) => (
          <span key={d.id} className="inline-flex items-center gap-1">
            <span className="text-on-surface-variant">/</span>
            <button type="button" onClick={() => setChemin(chemin.slice(0, i + 1))} className="text-primary hover:underline">
              {d.nom}
            </button>
          </span>
        ))}
      </nav>

      {explorateur.recherche && (
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher…"
          className="border border-outline-variant rounded px-3 py-2 font-body-md bg-white focus:ring-1 focus:ring-primary focus:border-primary"
        />
      )}

      <div className={`max-h-[50vh] overflow-y-auto rounded-lg border border-outline-variant bg-surface ${chargement ? 'opacity-60' : ''}`}>
        {erreur ? (
          <p className="p-4 text-sm text-error">{erreur}</p>
        ) : elements === null ? (
          <p className="p-4 text-sm text-on-surface-variant">Lecture…</p>
        ) : elements.length === 0 ? (
          <p className="p-4 text-sm text-on-surface-variant">
            {recherche ? 'Aucun résultat pour cette recherche.' : 'Rien à choisir ici.'}
          </p>
        ) : (
          <ul>
            {elements.map((el) => {
              const coche = choisis.some((c) => c.id === el.id);
              return (
                <li key={el.id} className="border-b border-outline-variant last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (el.dossier) {
                        setRecherche('');
                        setChemin([...chemin, el]);
                      } else basculer(el);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-primary/5 ${coche ? 'bg-primary/10' : ''}`}
                  >
                    {el.vignette && !el.dossier ? (
                      // eslint-disable-next-line @next/next/no-img-element -- vignette du fournisseur
                      <img src={el.vignette} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                    ) : (
                      <span className="material-symbols-outlined text-primary w-10 text-center shrink-0" aria-hidden>
                        {el.dossier ? 'folder' : 'description'}
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-body-md">{el.nom}</span>
                      {el.detail && <span className="block truncate text-xs text-on-surface-variant">{el.detail}</span>}
                    </span>
                    {el.dossier ? (
                      <span className="material-symbols-outlined text-on-surface-variant text-[18px]" aria-hidden>
                        chevron_right
                      </span>
                    ) : max > 1 ? (
                      <span className="material-symbols-outlined text-primary text-[20px]" aria-hidden>
                        {coche ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {max > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-on-surface-variant">
            {choisis.length} / {max} sélectionné{choisis.length > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            disabled={!choisis.length}
            onClick={() => onValider(choisis)}
            className="bg-primary text-on-primary rounded-full px-6 py-2 font-label-md text-label-md disabled:opacity-60"
          >
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}
