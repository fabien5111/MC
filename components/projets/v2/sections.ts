'use client';

// Registre des sections enregistrables du mode projet v2.
//
// Chaque éditeur de la page (intention, dessert, format, photo, catégories,
// ustensiles / difficulté / temps, conseils) écrit seul, à son propre bouton.
// Pour que la barre latérale puisse « Enregistrer le brouillon » d'un geste,
// prévenir avant de quitter et enregistrer avant de valider, chaque éditeur
// DÉCLARE ici s'il a une modification en attente et comment l'écrire
// (`useRegisterSection`). Le registre n'écrit rien lui-même : il rappelle les
// fonctions d'enregistrement existantes, l'une après l'autre, et s'arrête à la
// première qui échoue (chacune alerte déjà par son propre message d'erreur).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type SectionEntry = {
  label: string;
  dirty: boolean;
  // Vrai si l'écriture a réussi (comme `mutate`).
  save: () => Promise<boolean>;
};

export type SectionRegistry = {
  register: (key: string, entry: SectionEntry) => void;
  unregister: (key: string) => void;
};

export function useSectionRegistry() {
  const map = useRef(new Map<string, SectionEntry>());
  // Re-rendu du parent seulement quand l'état « modifié » d'une section change.
  const [, bump] = useState(0);

  const registry = useMemo<SectionRegistry>(
    () => ({
      register(key, entry) {
        const prev = map.current.get(key);
        map.current.set(key, entry);
        if ((prev?.dirty ?? false) !== entry.dirty) bump((n) => n + 1);
      },
      unregister(key) {
        const prev = map.current.get(key);
        if (!prev) return;
        map.current.delete(key);
        if (prev.dirty) bump((n) => n + 1);
      },
    }),
    [],
  );

  const dirtyLabels = [...map.current.values()].filter((e) => e.dirty).map((e) => e.label);

  // Chaque section est relue dans le registre au moment de son tour : la
  // précédente a pu provoquer un re-rendu, donc une fonction d'enregistrement
  // plus récente.
  const saveAll = useCallback(async (): Promise<boolean> => {
    const keys = [...map.current.entries()].filter(([, e]) => e.dirty).map(([k]) => k);
    for (const k of keys) {
      const entry = map.current.get(k);
      if (!entry || !entry.dirty) continue;
      if (!(await entry.save())) return false;
    }
    return true;
  }, []);

  return { registry, dirtyLabels, saveAll };
}

// À appeler dans chaque éditeur : met à jour l'entrée à chaque rendu (la
// fonction `save` voit ainsi toujours l'état courant) et la retire au démontage.
export function useRegisterSection(registry: SectionRegistry | undefined, key: string, entry: SectionEntry) {
  useEffect(() => {
    registry?.register(key, entry);
  });
  useEffect(() => () => registry?.unregister(key), [registry, key]);
}
