'use client';

// Noms accordables des ingrédients du référentiel (JEP-282), mis à disposition
// de tous les écrans qui affichent une ligne d'ingrédient — fiche recette,
// fournée, courses, mode projet — sans faire passer la table de props en props.
// Chargée une fois au layout depuis le cache des référentiels ; ne contient que
// les références qui portent un pluriel.
import { createContext, useContext } from 'react';
import { AUCUN_NOM_ACCORDABLE, libelleIngredient, nomsDeLigne, type NomsAccordables } from '@/lib/ingredient-name';

const Ctx = createContext<NomsAccordables>(AUCUN_NOM_ACCORDABLE);

export function IngredientNomsProvider({
  noms,
  children,
}: {
  noms: NomsAccordables;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={noms}>{children}</Ctx.Provider>;
}

// Nom à afficher pour une ligne : accordé avec la quantité si la règle
// s'applique, sinon le texte de l'auteur, inchangé.
export function useLibelleIngredient() {
  const noms = useContext(Ctx);
  return (
    nom: string,
    quantite: string | number | null | undefined,
    unite: string | null | undefined,
    refId: number | null | undefined,
  ) => libelleIngredient(nom, quantite, unite, nomsDeLigne(noms, nom, refId));
}

// Version composant, pour les rendus (y compris depuis un Server Component).
export function NomIngredient({
  nom,
  quantite,
  unite,
  refId,
}: {
  nom: string;
  quantite: string | number | null | undefined;
  unite: string | null | undefined;
  refId: number | null | undefined;
}) {
  const libelle = useLibelleIngredient();
  return <>{libelle(nom, quantite, unite, refId)}</>;
}
