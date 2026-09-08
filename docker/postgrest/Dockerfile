# PostgREST pour Virtuozzo Cloud — cf. docs/migration-infomaniak.md § 7.11
#
# POURQUOI CETTE IMAGE EXISTE. L'image officielle `postgrest/postgrest` est
# construite `FROM scratch` : un binaire Haskell statique, sans système de
# base. Jelastic refuse de la déployer en « conteneur personnalisé » — il y
# injecte son propre init (jelinit, sshd), et a donc besoin d'une distribution
# en dessous. D'où son message « L'image repose sur un modèle de système
# d'exploitation non pris en charge ». `supabase/auth` passait, lui, parce
# qu'il est basé sur Alpine.
#
# CE QU'ELLE NE FAIT PAS : reconstruire PostgREST. On reprend le binaire
# officiel tel quel, depuis l'image officielle épinglée, et on le repose sur
# une base Debian. Aucune URL de release à connaître, aucune somme de contrôle
# à maintenir : l'étiquette de l'image source est la seule chose à épingler,
# et elle vit dans ce dépôt.

ARG POSTGREST_VERSION=v12.2.12

FROM postgrest/postgrest:${POSTGREST_VERSION} AS source

FROM debian:bookworm-slim

# ca-certificates n'est pas nécessaire pour joindre PostgreSQL en clair sur le
# réseau interne, mais le deviendrait si cette liaison passait un jour en TLS
# vérifié. Quelques centaines de kilo-octets pour ne pas avoir à reconstruire.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=source /bin/postgrest /usr/local/bin/postgrest

# PostgREST lit toute sa configuration dans l'environnement (PGRST_*) dès lors
# qu'aucun fichier de configuration ne lui est passé en argument.
EXPOSE 3000
CMD ["postgrest"]
