'use client';

// Stockages en ligne (JEP-408) — droit du membre et sources configurées, mis
// en contexte par les pages qui proposent un dépôt de photo ou un import.
//
// Sans fournisseur au-dessus (back-office, avatar, contact…), le bouton
// « Depuis… » n'apparaît pas : la fonction n'est offerte que là où une page
// l'a explicitement branchée, avec le droit lu côté serveur.
import { createContext, useContext, type ReactNode } from 'react';
import type { ConfigStockage } from '@/lib/stockage-en-ligne';

export type ValeurStockage = { autorise: boolean; config: ConfigStockage };

const Contexte = createContext<ValeurStockage | null>(null);

export function StockageEnLigneProvider({ valeur, children }: { valeur: ValeurStockage; children: ReactNode }) {
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useStockageEnLigne(): ValeurStockage | null {
  return useContext(Contexte);
}
