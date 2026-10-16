#!/usr/bin/env python3
"""Contrôle mécanique d'une fiche de composant (compétence fiche-composant).

Usage : python3 .claude/skills/fiche-composant/controle.py <fiche.json>
Affiche « OK » et sort en 0, ou la liste des erreurs et sort en 1.
"""
import json
import re
import sys

CLES = {'titre', 'auteur_origine', 'video_url', 'description', 'rendement', 'ustensiles',
        'etapes', 'astuces_recette', 'conseils_conservation'}
CLES_ETAPE = {'nom_etape', 'page', 'temps_preparation_minutes', 'temps_attente_minutes',
              'temps_cuisson_minutes', 'temperature_cuisson_celsius', 'anticipation_jours',
              'ingredients', 'instructions', 'conseils_etape'}
NOMBRE = r'(\d+(?:[.,]\d+)?)'


def nombre(s):
    return float(s.replace(',', '.'))


def controler(d):
    err = []
    if set(d) != CLES:
        err.append(f'Clés racine : en trop {set(d) - CLES}, manquantes {CLES - set(d)}')

    etapes = d.get('etapes', [])
    if not 1 <= len(etapes) <= 3:
        err.append(f'{len(etapes)} étapes (1 à 3 attendues)')
    # Une étape unique porte le nom de la recette.
    if len(etapes) == 1 and etapes[0].get('nom_etape') != d.get('titre'):
        err.append(f"Étape unique : nom_etape « {etapes[0].get('nom_etape')} » doit être égal au titre « {d.get('titre')} »")
    total = 0.0
    for n, e in enumerate(etapes, 1):
        if set(e) != CLES_ETAPE:
            err.append(f'Étape {n} clés : en trop {set(e) - CLES_ETAPE}, manquantes {CLES_ETAPE - set(e)}')
        ni = len(e.get('instructions', []))
        if not 3 <= ni <= 8:
            err.append(f'Étape {n} : {ni} instructions (3 à 8)')
        # Les conseils de réussite vivent dans l'étape : jamais vide.
        if not (isinstance(e.get('conseils_etape'), str) and e['conseils_etape'].strip()):
            err.append(f'Étape {n} : conseils_etape vide (points critiques de réussite attendus)')
        for i in e.get('ingredients', []):
            if set(i) != {'nom', 'quantite', 'unite'}:
                err.append(f'Ingrédient mal formé : {i}')
            if i.get('unite') != 'g':
                err.append(f"Unité non g : {i.get('nom')}")
            q = i.get('quantite')
            if q is not None and not isinstance(q, (int, float)):
                err.append(f"Quantité non numérique : {i.get('nom')}")
            total += q or 0

    # Rendement : « … — environ N g de <préparation> utilisable (S g d'ingrédients, perte ≈ P %) ».
    r = d.get('rendement') or ''
    m_util = re.search(NOMBRE + r'\s*g\b[^()—]*?utilisable', r, re.I)
    m_somme = re.search(NOMBRE + r"\s*g\s+d['’]ingrédients", r, re.I)
    m_perte = re.search(r'perte\s*≈?\s*' + NOMBRE + r'\s*%', r, re.I)
    if not (m_util and m_somme and m_perte):
        err.append("Rendement : attendu « … — environ N g de … utilisable (S g d'ingrédients, perte ≈ P %) »")
    else:
        util, somme, perte = nombre(m_util.group(1)), nombre(m_somme.group(1)), nombre(m_perte.group(1))
        if abs(somme - total) > max(0.01 * total, 5):
            err.append(f"Somme des ingrédients {total:g} g ≠ {somme:g} g d'ingrédients annoncés")
        if not 2 <= perte <= 40:
            err.append(f'Perte {perte:g} % hors de la plage plausible (2 à 40 %)')
        attendu = somme * (1 - perte / 100)
        if abs(util - attendu) > 0.02 * attendu:
            err.append(f'Masse utilisable {util:g} g ≠ {somme:g} g × (1 − {perte:g} %) = {attendu:.0f} g')

    # Astuces de la recette : utilisations et variantes seulement.
    astuces = d.get('astuces_recette', [])
    utilisations = [a for a in astuces if a.startswith('Utilisation — ')]
    variantes = [a for a in astuces if a.startswith('Variante — ')]
    if not 5 <= len(utilisations) <= 8:
        err.append(f'{len(utilisations)} entrées Utilisation (5 à 8)')
    if len(variantes) > 3:
        err.append(f'{len(variantes)} entrées Variante (3 au plus)')
    for a in astuces:
        if not (a.startswith('Utilisation — ') or a.startswith('Variante — ')):
            err.append(f'Astuce hors format (conseil de réussite → conseils_etape de l\'étape) : « {a[:60]}… »')

    return total, err


def main():
    try:
        d = json.load(open(sys.argv[1], encoding='utf-8'))
    except Exception as e:  # noqa: BLE001 — tout échec de lecture est une erreur de fiche
        print('JSON INVALIDE :', e)
        sys.exit(1)
    total, err = controler(d)
    print(f'Somme des ingrédients : {total:g} g')
    print('\n'.join(err) if err else 'OK')
    sys.exit(1 if err else 0)


if __name__ == '__main__':
    main()
