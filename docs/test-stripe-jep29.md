# Plan de test — Stripe (JEP-29), sans attendre un mois

Deux outils différents pour deux besoins différents, à ne pas confondre :

- **Le temps SQL** — pour notre propre essai gratuit (`mc_start_trial`), qui
  n'a aucun objet Stripe : on modifie directement les dates en base.
- **Les horloges de test Stripe** (*test clocks*) — pour tout ce qui est
  facturé réellement (renouvellement, échec de paiement, changement de
  formule programmé, résiliation à l'échéance) : Stripe simule le temps qui
  passe et envoie de VRAIS webhooks, exactement ceux que la production
  recevrait. C'est la seule façon fiable de tester `mc_apply_stripe_subscription`
  et l'échéancier sans attendre la vraie date. [Documentation Stripe — Test
  clocks](https://stripe.com/docs/billing/testing/test-clocks?locale=it-IT).

**Contrainte à connaître avant de commencer** : une horloge de test ne peut
être attachée qu'à un client Stripe créé exprès pour elle — impossible de
la retrofitter sur un client existant. Pour que *notre* parcours de Checkout
(celui que les membres utilisent réellement) passe par cette horloge, il
faut donc **pré-poser** l'identifiant du client dans notre table
`billing_customers` avant de cliquer « S'abonner » sur `/plans` — c'est ce
que fait l'étape 2 ci-dessous.

**Où, pour toutes les commandes `curl` :** Web SSH du nœud **216804**
(`jepatisse-preview`) — `STRIPE_SECRET_KEY` y est déjà posée, `$STRIPE_SECRET_KEY`
la lit sans jamais l'afficher ni la faire transiter par le presse-papiers.

**Où, pour tout le SQL de ce document :** `pgweb`
(`https://auth.jepatisse.com/pgweb/`, rôle `pgweb_admin`) — c'est **toi** qui
colles et exécutes chaque bloc, Claude n'y a aucun accès (authentification
HTTP Basic dont lui seul ne connaît pas les identifiants). Les blocs sont
écrits pour être lus avant d'être joués, pas enchaînés à l'aveugle.

---

## 0. Un membre de test dédié

Crée un compte sur `https://jepatisse-preview.jcloud-ver-jpe.ik-server.com`
avec une adresse à toi (`toi+jep29@…`) — jamais ton compte personnel, pour ne
pas mélanger un abonnement de test avec de vraies données.

Récupère son UUID :

```sql
select id from public.profiles where email = 'toi+jep29@exemple.fr';
```

Note cet UUID, on le réutilise partout ensuite (`<uuid>` dans ce qui suit).

### Piège rencontré le 20/09 : réutiliser une adresse déjà passée par un essai

`trials.email_hash` (§1.4 de `docs/abonnements.md`) trace l'essai gratuit par
une **empreinte de l'adresse**, pas par le compte : supprimer le compte met
`trials.user_id` à `null` (`ON DELETE SET NULL`) mais la ligne — donc
l'empreinte — reste, exprès, pour qu'un compte supprimé-recréé ne rouvre pas
un essai. Symptôme : « L'essai n'a pas pu démarrer » sur une adresse déjà
utilisée par un ancien compte de test.

Deux façons d'en sortir, aucune ne demande de toucher `trials` directement :

- **Admin → Membres** → fiche du membre → section Abonnement → réinitialiser
  l'éligibilité à l'essai (`mc_admin_reset_trial`, motif obligatoire) — le
  geste normal pour ce cas précis ;
- **ou** un alias pour chaque nouveau tour de test : `toi+jep29-2@exemple.fr`.
  La normalisation de l'empreinte ne traite le `+` que pour Gmail (§1.4) —
  sur un autre fournisseur, l'alias compte comme une adresse entièrement
  neuve.

---

## 1. Essai gratuit (§7.2) — accéléré par le temps SQL

Démarre l'essai normalement depuis `/plans` (« Essayer gratuitement »). Puis,
plutôt que d'attendre 14 jours, on **recule artificiellement sa date de
début** pour le placer directement à J-3, J-1 ou après échéance.

**Se placer à J-3 :**

```sql
update public.subscriptions
   set starts_at = now() - interval '11 days',
       ends_at   = now() + interval '3 days'
 where user_id = '<uuid>' and type = 'TRIAL' and status = 'ACTIVE';
```

**Se placer à J-1 :**

```sql
update public.subscriptions
   set starts_at = now() - interval '13 days',
       ends_at   = now() + interval '1 day'
 where user_id = '<uuid>' and type = 'TRIAL' and status = 'ACTIVE';
```

**Se placer juste après l'échéance** (pour la notification J+1 et la
transition `ACTIVE → EXPIRED`) :

```sql
update public.subscriptions
   set starts_at = now() - interval '15 days',
       ends_at   = now() - interval '1 day'
 where user_id = '<uuid>' and type = 'TRIAL' and status = 'ACTIVE';
```

Vérification après chaque bascule (même session `pgweb`), pour confirmer
avant de déclencher le cron :

```sql
select starts_at, ends_at, status
  from public.subscriptions
 where user_id = '<uuid>' and type = 'TRIAL';
```

### Déclencher le cron manuellement

`CRON_SECRET` est volontairement absente de l'aperçu (`DEPLOY.md` § Aperçu
d'une PR — « aucune tâche planifiée ne vise l'aperçu »). Pour ce test
ponctuel, pose-la temporairement dans le panneau Variables du nœud **216804**,
**ouvre une session Web SSH neuve** (une session déjà ouverte ne la voit pas),
puis :

```
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/abonnements
```

La réponse JSON donne les compteurs (`notifiesJ3`, `notifiesJ1`,
`notifiesExpiration`) — vérifie qu'ils valent au moins 1 selon l'état où tu as
placé l'abonnement, puis va voir la cloche de notifications (`NotificationBell`)
et, si `notify_email` est activé sur ce profil, la boîte mail de test.

**Retire `CRON_SECRET` du panneau une fois fini** : sa seule raison d'être ici
était ce test.

---

## 2. Abonnement payant et renouvellement — horloge de test Stripe

### 2.1 Créer l'horloge et son client dédié

```
curl https://api.stripe.com/v1/test_helpers/test_clocks -u "$STRIPE_SECRET_KEY:" -d frozen_time=$(date +%s) -d name=jep29
```

Note l'`id` rendu (`clock_...`).

```
curl https://api.stripe.com/v1/customers -u "$STRIPE_SECRET_KEY:" -d test_clock=clock_XXXXX -d email=toi+jep29@exemple.fr
```

Note l'`id` rendu (`cus_...`) — c'est le client dont l'horloge Stripe pilotera
le temps.

### 2.2 Faire pointer NOTRE membre vers ce client, AVANT de souscrire

C'est l'étape qui fait que le Checkout réel (celui de `/plans`) utilisera ce
client plutôt que d'en créer un nouveau :

```sql
insert into public.billing_customers (user_id, provider, external_customer_id)
values ('<uuid>', 'stripe', 'cus_XXXXX')
on conflict (user_id) do update set external_customer_id = excluded.external_customer_id;
```

### 2.3 Souscrire normalement, par l'écran

Connecté en tant que ce membre, `/plans` → « S'abonner » → carte
`4242 4242 4242 4242`. Le webhook doit écrire l'abonnement comme d'habitude —
vérifie « Mon forfait » sur `/reglages`.

### 2.4 Avancer le temps — renouvellement réussi

```
curl https://api.stripe.com/v1/test_helpers/test_clocks/clock_XXXXX/advance -u "$STRIPE_SECRET_KEY:" -d frozen_time=$(( $(date +%s) + 32*86400 ))
```

L'avance est asynchrone. Attends quelques secondes puis vérifie l'état :

```
curl https://api.stripe.com/v1/test_helpers/test_clocks/clock_XXXXX -u "$STRIPE_SECRET_KEY:"
```

Attendu : `"status": "ready"`. Une fois là :

- **Dashboard Stripe** (mode Test) → Développeurs → Webhooks → ton endpoint :
  tu dois voir un nouvel `invoice.paid` (ou équivalent) et un
  `customer.subscription.updated` avec une échéance repoussée d'un mois, tous
  les deux en 200.
- **`/reglages`** : la date de fin doit avoir avancé d'un mois.
- **Le crédit IA mensuel** (`ajustement_ia_mensuel` etc.) doit s'être remis à
  zéro, puisque `renewal_anchor` est calé sur cette échéance (§14) — vérifie
  la jauge « Mon utilisation ».

### 2.5 Échec de renouvellement (`invoice.payment_failed`) — optionnel, plus avancé

Le premier paiement doit avoir réussi pour qu'on puisse observer un VRAI
comportement de renouvellement (et pas un simple refus initial). On bascule
donc le moyen de paiement du client de test **entre deux renouvellements** :

```
curl https://api.stripe.com/v1/payment_methods -u "$STRIPE_SECRET_KEY:" -d type=card -d card[number]=4000000000000341 -d card[exp_month]=12 -d card[exp_year]=2034 -d card[cvc]=123
```

Note l'`id` (`pm_...`), attache-le puis pose-le par défaut :

```
curl https://api.stripe.com/v1/payment_methods/pm_XXXXX/attach -u "$STRIPE_SECRET_KEY:" -d customer=cus_XXXXX
```

```
curl https://api.stripe.com/v1/customers/cus_XXXXX -u "$STRIPE_SECRET_KEY:" -d invoice_settings[default_payment_method]=pm_XXXXX
```

Puis ré-avance l'horloge d'un mois (même commande qu'en 2.4). Cette fois le
renouvellement doit échouer.

**Ce qu'il faut voir :**
- Webhook `invoice.payment_failed` en 200.
- Notification in-app **« Paiement refusé — votre accès continue »**
  (`messageEchecPaiement`) — et l'e-mail si `notify_email` est actif.
- **`/reglages` doit toujours afficher l'abonnement payant, actif** — c'est
  tout l'arbitrage du §14 (`past_due` reste `ACTIVE`, jamais de coupure
  immédiate). Si le plan retombe sur Gratuit ici, c'est une régression.

---

## 3. Changement de formule — le point qui n'a JAMAIS été éprouvé

C'est la partie signalée dans `docs/abonnements.md` comme non vérifiée sur
pièces (documentation Stripe inaccessible pendant le développement). **Ce
test est le plus important des trois.**

### 3.1 Montée en gamme

Sur `/plans`, avec le membre de test toujours abonné (formule la plus basse),
clique la formule supérieure, carte `4242...`. Doit être **immédiat** :
vérifie sur le Dashboard qu'une facture de prorata a été émise tout de suite,
sans attendre l'horloge.

Puis reteste avec la carte `4000 0025 0000 3155` (authentification demandée)
pour vérifier que le message distingue bien ce cas d'un refus de carte, et
que la formule **n'a pas changé** dans notre base.

### 3.2 Descente en gamme — la vérification qui compte vraiment

Redescends vers une formule intermédiaire (pas la gratuite). Message attendu :
un changement **programmé**, sans facturation immédiate.

**Où :** Dashboard Stripe → l'abonnement de ce client → un **Schedule**
(échéancier) doit apparaître, avec deux phases visibles.

Avance ensuite l'horloge **jusqu'à l'échéance programmée** (même commande
qu'en 2.4, avec le nombre de jours qui sépare `now()` de la date annoncée par
l'écran de confirmation) :

```
curl https://api.stripe.com/v1/test_helpers/test_clocks/clock_XXXXX/advance -u "$STRIPE_SECRET_KEY:" -d frozen_time=<epoch de l'échéance>
```

**C'est ici que se vérifie tout ce que `echeancierConforme` ne peut que
présumer avant coup** : une fois l'horloge à `ready`,
- un `customer.subscription.updated` doit arriver avec le NOUVEAU prix ;
- `/reglages` doit refléter la formule inférieure, à la date exacte annoncée ;
- aucune facture supplémentaire ne doit être émise (§5 : pas de remboursement
  au prorata, mais pas de sur-facturation non plus).

Si l'un de ces trois points est faux, c'est la composition des phases
(`app/api/abonnement/changer/route.ts`) qui est en cause — le point exact que
la relecture de contrôle ne pouvait que vérifier a priori, jamais sur une
vraie exécution Stripe.

### 3.3 Enchaîner une deuxième descente (le cas qui a motivé `phaseCourante`)

Reprogramme une descente une deuxième fois sur ce même abonnement, une fois
la première déjà appliquée. Vérifie qu'un nouvel échéancier propre est créé
(pas d'erreur Stripe sur des phases mal réémises), puis avance l'horloge à
nouveau pour confirmer qu'elle s'applique aussi.

---

## 4. Résiliation à l'échéance

Depuis `/reglages`, « Annuler mon abonnement ». Vérifie immédiatement sur la
fiche Stripe de l'abonnement que `Cancel at period end` passe à vrai — **sans
avancer l'horloge**, ce point-là est synchrone.

Avance ensuite l'horloge jusqu'à l'échéance. Attendu :
- webhook `customer.subscription.deleted` en 200 ;
- `/reglages` retombe sur la formule Gratuite ;
- **aucune notification en double** si le cron d'expiration (partie 1) a
  aussi tourné entre-temps — les deux mécanismes sont indépendants
  (Stripe pour l'abonnement payant, notre cron pour la ligne `subscriptions`
  elle-même), c'est un bon test de non-régression croisé.

---

## 5. Nettoyage

Une fois le test terminé :
- **Retire `CRON_SECRET`** du nœud 216804 si tu l'as posée en partie 1.
- Les clients et horloges de test n'ont pas besoin d'être supprimés : ils
  vivent uniquement en mode Test, sans coût, et Stripe les purge de
  lui-même après un moment.
- Si tu comptes retester depuis le début, supprime la ligne
  `billing_customers` du membre de test avant de recommencer une nouvelle
  horloge, sinon le prochain Checkout réutilisera le client de l'ancienne :

  ```sql
  delete from public.billing_customers where user_id = '<uuid>';
  ```
