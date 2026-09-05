#!/usr/bin/env python3
"""Réconciliation des orphelins du stockage objet (lot B4, partie 2/2).

Liste le contenu d'UN conteneur Swift, le compare à toutes les URLs de ce
conteneur réellement référencées en base, et signale — ou supprime, sur
confirmation explicite portée par le workflow appelant — les objets qui
n'ont plus aucune ligne qui les pointe depuis plus de `HEURES_GRACE` heures.

Colonnes couvertes : cf. `CIBLES_PAR_CONTENEUR` ci-dessous, à tenir
synchronisé manuellement avec `lib/backfill.ts` (`CIBLES_BACKFILL`) côté
application si une colonne image y est ajoutée.

Lancé par `.github/workflows/object-storage-reconciliation.yml` — jamais
directement : il lit ses paramètres dans les variables d'environnement que
ce workflow pose (cf. docs/migration-infomaniak.md § 7.7, § 10.4).
"""
import json
import os
from datetime import datetime, timedelta, timezone

import requests
from swiftclient.client import Connection

CONTENEUR = os.environ["CONTENEUR"]
HEURES_GRACE = float(os.environ["HEURES_GRACE"])
CONFIRMER = os.environ.get("CONFIRMER", "")
SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Table -> colonnes texte simples (une valeur = une URL ou rien) ; table ->
# colonne tableau JSON (liste de `{ url, ... }`, motif des avis).
CIBLES_PAR_CONTENEUR = {
    "jp-photos": {
        "scalaires": [
            ("recipes", ["hero_image_url", "hero_image_original_url", "hero_thumb_url", "hero_card_url"]),
            ("step_photos", ["url", "original_url"]),
            ("profiles", ["avatar_url", "banner_url"]),
            ("tags", ["category_picto"]),
            ("allergens", ["picto"]),
            ("site_settings", ["value"]),
            ("ads", ["image_url"]),
            ("articles", ["cover_image_url"]),
        ],
        "tableaux_json": [("comments", "photo_urls")],
    },
    "jp-contact": {
        "scalaires": [
            ("contact_message_photos", ["url"]),
            ("contact_reply_photos", ["url"]),
        ],
        "tableaux_json": [],
    },
}


def cle_depuis_url(url, conteneur):
    """Inverse de `urlCanonique` (lib/storage-data.ts), sans avoir besoin de
    connaître `SWIFT_STORAGE_URL` : la clé est simplement ce qui suit
    `/<conteneur>/` dans l'URL stockée en base."""
    marqueur = f"/{conteneur}/"
    if marqueur not in url:
        return None
    return url.split(marqueur, 1)[1]


def cles_referencees(conteneur):
    """Toutes les clés d'objet de CE conteneur réellement référencées en
    base, tous types de colonnes confondus."""
    cibles = CIBLES_PAR_CONTENEUR[conteneur]
    referencees = set()
    entetes = {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        # Explicite plutôt que de dépendre du plafond par défaut de
        # PostgREST : les volumes réels (§ 7.5) tiennent très largement
        # en dessous.
        "Range": "0-9999",
    }

    for table, colonnes in cibles["scalaires"]:
        reponse = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=entetes,
            params={"select": ",".join(colonnes)},
            timeout=30,
        )
        reponse.raise_for_status()
        for ligne in reponse.json():
            for colonne in colonnes:
                valeur = ligne.get(colonne)
                if not valeur:
                    continue
                cle = cle_depuis_url(valeur, conteneur)
                if cle:
                    referencees.add(cle)

    for table, colonne in cibles["tableaux_json"]:
        reponse = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=entetes,
            params={"select": colonne},
            timeout=30,
        )
        reponse.raise_for_status()
        for ligne in reponse.json():
            photos = ligne.get(colonne) or []
            if isinstance(photos, str):
                photos = json.loads(photos)
            for photo in photos or []:
                url = (photo or {}).get("url")
                if not url:
                    continue
                cle = cle_depuis_url(url, conteneur)
                if cle:
                    referencees.add(cle)

    return referencees


def main():
    print(f"Conteneur : {CONTENEUR}")
    print(f"Marge de grâce : {HEURES_GRACE} h")

    conn = Connection(
        authurl=os.environ["OS_AUTH_URL"],
        user=os.environ["OS_USERNAME"],
        key=os.environ["OS_PASSWORD"],
        os_options={
            "project_name": os.environ["OS_PROJECT_NAME"],
            "region_name": os.environ["OS_REGION_NAME"],
            "user_domain_name": os.environ["OS_USER_DOMAIN_NAME"],
            "project_domain_name": os.environ["OS_PROJECT_DOMAIN_NAME"],
        },
        auth_version="3",
    )

    _, objets = conn.get_container(CONTENEUR, full_listing=True)
    print(f"Objets dans le conteneur : {len(objets)}")

    referencees = cles_referencees(CONTENEUR)
    print(f"Clés référencées en base : {len(referencees)}")

    seuil = datetime.now(timezone.utc) - timedelta(hours=HEURES_GRACE)
    orphelins = []
    for objet in objets:
        if objet["name"] in referencees:
            continue
        # Format Swift : « 2026-09-05T14:32:10.123456 », toujours en UTC,
        # sans indicateur de fuseau.
        modifie = datetime.fromisoformat(objet["last_modified"]).replace(tzinfo=timezone.utc)
        if modifie > seuil:
            continue  # trop récent : peut-être un dépôt encore en vol
        orphelins.append(objet)

    print(f"\nOrphelins trouvés : {len(orphelins)}")
    for o in orphelins:
        print(f"  {o['name']}  ({o['bytes']} octets, déposé le {o['last_modified']})")

    if not orphelins:
        print("\nRien à supprimer.")
        return

    if CONFIRMER != "SUPPRIMER":
        print(
            "\nRapport à sec — rien n'a été supprimé. Pour supprimer réellement "
            "CES orphelins, relancez ce workflow avec « confirmer_suppression » "
            "réglé exactement sur SUPPRIMER (une exécution relit toujours le "
            "conteneur à neuf avant de supprimer, jamais sur la foi de ce rapport)."
        )
        return

    print("\nConfirmation reçue — suppression en cours…")
    for o in orphelins:
        conn.delete_object(CONTENEUR, o["name"])
        print(f"  supprimé : {o['name']}")
    print(f"\n{len(orphelins)} objet(s) supprimé(s).")


if __name__ == "__main__":
    main()
