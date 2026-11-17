'use client';

// Registre des sections enregistrables du mode projet v2, et enregistrement
// AUTOMATIQUE (JEP-403).
//
// Chaque éditeur de la page (intention, dessert, format, photo, catégories,
// ustensiles / difficulté / temps, conseils, photos d'étape) DÉCLARE ici s'il a
// une modification en attente (`dirty`), l'empreinte de sa saisie courante
// (`signature`) et comment l'écrire (`save`). Le registre n'écrit rien lui-même :
//  - il rappelle ces fonctions, l'une après l'autre (jamais deux écritures en
//    même temps : une file) ;
//  - avec `auto`, il lance cet enregistrement tout seul, `delaiMs` après la
//    DERNIÈRE modification (la frappe repousse l'échéance), en mode silencieux :
//    pas de voile, pas de fenêtre d'alerte, le focus du champ en cours reste en
//    place. Un échec ne se répète pas en boucle : l'enregistrement ne repart que
//    si la saisie change encore, ou au clic sur « Réessayer » ;
//  - il enregistre aussi dès que l'onglet passe à l'arrière-plan et au démontage
//    de la page (navigation interne) ;
//  - `apresEnregistrement` est appelé après des écritures silencieuses réussies :
//    c'est à l'appelant de resynchroniser le rendu serveur au bon moment.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type OptionsSauvegarde = { silencieux?: boolean };

export type SectionEntry = {
  label: string;
  dirty: boolean;
  // Empreinte de la saisie courante : un changement repousse l'enregistrement
  // automatique, une valeur identique ne le relance pas.
  signature?: string;
  // Vrai si l'écriture a réussi (comme `mutate`).
  save: (options?: OptionsSauvegarde) => Promise<boolean>;
};

export type SectionRegistry = {
  register: (key: string, entry: SectionEntry) => void;
  unregister: (key: string) => void;
};

export type EtatAuto = { etat: 'repos' | 'enregistrement' | 'echec'; echecs: string[] };

type Options = {
  auto?: boolean;
  delaiMs?: number;
  apresEnregistrement?: () => void;
};

export function useSectionRegistry({ auto = false, delaiMs = 2000, apresEnregistrement }: Options = {}) {
  const map = useRef(new Map<string, SectionEntry>());
  // Re-rendu du parent seulement quand l'état « modifié » d'une section change.
  const [, bump] = useState(0);
  const [etatAuto, setEtatAuto] = useState<EtatAuto>({ etat: 'repos', echecs: [] });
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verrou = useRef<Promise<unknown>>(Promise.resolve());
  const rappel = useRef(apresEnregistrement);
  rappel.current = apresEnregistrement;
  const autoRef = useRef(auto);
  autoRef.current = auto;

  // Chaque section est relue dans le registre au moment de son tour : la
  // précédente a pu provoquer un re-rendu, donc une fonction d'enregistrement
  // plus récente. En mode silencieux, un échec n'arrête pas les autres sections.
  const executer = useCallback(async (options?: OptionsSauvegarde): Promise<string[]> => {
    const keys = [...map.current.entries()].filter(([, e]) => e.dirty).map(([k]) => k);
    const echecs: string[] = [];
    let ecrit = false;
    for (const k of keys) {
      const entry = map.current.get(k);
      if (!entry || !entry.dirty) continue;
      if (await entry.save(options)) ecrit = true;
      else {
        echecs.push(entry.label);
        if (!options?.silencieux) break;
      }
    }
    if (ecrit && options?.silencieux) rappel.current?.();
    return echecs;
  }, []);

  // File : deux enregistrements ne s'exécutent jamais en parallèle.
  const saveAll = useCallback(
    (options?: OptionsSauvegarde): Promise<boolean> => {
      if (minuteur.current) {
        clearTimeout(minuteur.current);
        minuteur.current = null;
      }
      const suite = verrou.current.then(async () => {
        if (options?.silencieux) setEtatAuto((e) => (e.etat === 'enregistrement' ? e : { etat: 'enregistrement', echecs: [] }));
        const echecs = await executer(options);
        if (options?.silencieux || echecs.length === 0) {
          setEtatAuto((e) => {
            const prochain: EtatAuto = echecs.length ? { etat: 'echec', echecs } : { etat: 'repos', echecs: [] };
            return e.etat === prochain.etat && e.echecs.join() === prochain.echecs.join() ? e : prochain;
          });
        }
        return echecs.length === 0;
      });
      verrou.current = suite.catch(() => undefined);
      return suite;
    },
    [executer],
  );

  const planifier = useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => {
      minuteur.current = null;
      void saveAll({ silencieux: true });
    }, delaiMs);
  }, [delaiMs, saveAll]);

  const registry = useMemo<SectionRegistry>(
    () => ({
      register(key, entry) {
        const prev = map.current.get(key);
        map.current.set(key, entry);
        if ((prev?.dirty ?? false) !== entry.dirty) bump((n) => n + 1);
        // Planifié seulement quand la saisie CHANGE : un échec n'est donc pas
        // rejoué tant que le membre ne retouche rien.
        if (autoRef.current && entry.dirty && (!prev?.dirty || prev.signature !== entry.signature)) planifier();
      },
      unregister(key) {
        const prev = map.current.get(key);
        if (!prev) return;
        map.current.delete(key);
        if (prev.dirty) bump((n) => n + 1);
      },
    }),
    [planifier],
  );

  // Onglet envoyé à l'arrière-plan (changement d'onglet, mobile) : on n'attend
  // pas l'échéance. Même geste au démontage (navigation interne).
  useEffect(() => {
    if (!auto) return;
    const aucunEnAttente = () => ![...map.current.values()].some((e) => e.dirty);
    const aLArriere = () => {
      if (document.visibilityState === 'hidden' && !aucunEnAttente()) void saveAll({ silencieux: true });
    };
    document.addEventListener('visibilitychange', aLArriere);
    return () => {
      document.removeEventListener('visibilitychange', aLArriere);
      if (minuteur.current) {
        clearTimeout(minuteur.current);
        minuteur.current = null;
        if (!aucunEnAttente()) void saveAll({ silencieux: true });
      }
    };
  }, [auto, saveAll]);

  const dirtyLabels = [...map.current.values()].filter((e) => e.dirty).map((e) => e.label);
  // Lu à la demande (hors rendu) : vrai tant qu'une section attend d'être écrite.
  const aDesModifications = useCallback(() => [...map.current.values()].some((e) => e.dirty), []);

  return { registry, dirtyLabels, saveAll, etatAuto, aDesModifications };
}

// À appeler dans chaque éditeur : met à jour l'entrée à chaque rendu (la
// fonction `save` voit ainsi toujours l'état courant) et la retire au démontage.
export function useRegisterSection(registry: SectionRegistry | undefined, key: string, entry: SectionEntry) {
  useEffect(() => {
    registry?.register(key, entry);
  });
  useEffect(() => () => registry?.unregister(key), [registry, key]);
}
