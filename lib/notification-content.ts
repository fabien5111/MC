// Composition du contenu des notifications d'abonnement (spec §10) — titre,
// corps in-app, sujet et corps e-mail. Server-safe (pas de `next/headers`),
// mais volontairement pas « pur » comme `lib/entitlements.ts` : il compose du
// texte de présentation (dates formatées, liens), pas une règle métier.
import { formatDate } from '@/lib/format';
import { siteUrl } from '@/lib/site-url';

export type NotificationType = 'TRIAL_J3' | 'TRIAL_J1' | 'SUB_J3' | 'SUB_J1' | 'EXPIRED_J1';

export type NotificationContext = {
  fullName: string | null;
  planLabel: string;
  /** Date de fin (avant expiration) ou date à laquelle le plan a pris fin. */
  dateIso: string;
  /** Fonctionnalités réellement perdues (accès à NO) PAR CE MEMBRE (§10) — jamais un texte générique. */
  lostFeatures: string[];
  /** Fonctionnalités dont le quota baisse sans disparaître — jamais mélangées aux pertes ci-dessus (cf. lib/entitlements.ts). */
  reducedFeatures: string[];
};

export type ComposedNotification = {
  title: string;
  body: string;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
};

function listeLignes(features: string[]): string {
  return features.map((f) => `— ${f}`).join('\n');
}

/**
 * Bloc « ce qui régresse », en DEUX temps distincts — jamais mélangés (cf.
 * `lib/entitlements.ts`, `lostFeatureLabels` / `reducedFeatureLabels`) :
 * une fonctionnalité qui disparaît (`introPerte`) n'est pas la même annonce
 * qu'un quota qui baisse sans disparaître, toujours sous le même intitulé
 * neutre. Chaîne vide si rien ne régresse.
 */
function blocRegression(lost: string[], reduced: string[], introPerte: string, introReduit: string): string {
  const blocs: string[] = [];
  if (lost.length) blocs.push(`${introPerte} :\n${listeLignes(lost)}`);
  if (reduced.length) blocs.push(`${introReduit} :\n${listeLignes(reduced)}`);
  return blocs.length ? `\n\n${blocs.join('\n\n')}` : '';
}

function enveloppe(prenom: string, corps: string, lienTexte: string): { emailHtml: string; emailText: string } {
  const lien = `${siteUrl()}/plans`;
  const html = `
    <p>Bonjour ${prenom},</p>
    <p>${corps.replace(/\n/g, '<br>')}</p>
    <p><a href="${lien}">${lienTexte}</a></p>
    <p style="color:#888;font-size:12px;margin-top:24px;">
      Vous recevez cet e-mail car il concerne votre abonnement à Je pâtisse !
      Désactivable dans vos réglages (les alertes affichées sur le site restent visibles).
    </p>`;
  const text = `Bonjour ${prenom},\n\n${corps}\n\n${lienTexte} : ${lien}`;
  return { emailHtml: html, emailText: text };
}

export function composeNotification(type: NotificationType, ctx: NotificationContext): ComposedNotification {
  const prenom = ctx.fullName?.split(' ')[0] || 'bonjour';
  const date = formatDate(ctx.dateIso);

  switch (type) {
    case 'TRIAL_J3': {
      const corps = `Votre essai gratuit ${ctx.planLabel} se termine dans 3 jours, le ${date}.${blocRegression(
        ctx.lostFeatures,
        ctx.reducedFeatures,
        'Sans abonnement, vous perdrez',
        'Vos quotas seront réduits pour',
      )}`;
      return {
        title: `Essai ${ctx.planLabel} : fin dans 3 jours`,
        body: corps,
        emailSubject: `Votre essai ${ctx.planLabel} se termine dans 3 jours`,
        ...enveloppe(prenom, corps, 'Voir les formules'),
      };
    }
    case 'TRIAL_J1': {
      // Jamais « aujourd'hui » : `estJ1` (route du cron) est un décompte
      // glissant en heures (≤ 24 h restantes), pas une comparaison de dates
      // calendaires — sur un essai qui se termine tard dans la journée, la
      // fenêtre J-1 démarre la veille au soir, sur un jour calendaire
      // différent de `ends_at`. Affirmer « aujourd'hui » tout en affichant la
      // date réelle produisait une phrase qui se contredisait elle-même
      // (constaté le 21/09 : « il se termine aujourd'hui, le 22 septembre »
      // alors qu'on était le 21). La date affichée suffit, sans readonly sur
      // le jour calendaire du cron.
      const corps = `Dernier jour de votre essai gratuit ${ctx.planLabel} : il se termine le ${date}.${blocRegression(
        ctx.lostFeatures,
        ctx.reducedFeatures,
        'Sans abonnement, vous perdrez',
        'Vos quotas seront réduits pour',
      )}`;
      return {
        title: `Essai ${ctx.planLabel} : dernier jour`,
        body: corps,
        emailSubject: `Dernier jour de votre essai ${ctx.planLabel}`,
        ...enveloppe(prenom, corps, 'Voir les formules'),
      };
    }
    case 'SUB_J3': {
      const corps = `Votre abonnement ${ctx.planLabel} arrive à échéance dans 3 jours, le ${date}.${blocRegression(
        ctx.lostFeatures,
        ctx.reducedFeatures,
        'Sans renouvellement, vous perdrez',
        'Vos quotas seront réduits pour',
      )}`;
      return {
        title: `${ctx.planLabel} : échéance dans 3 jours`,
        body: corps,
        emailSubject: `Votre abonnement ${ctx.planLabel} arrive à échéance dans 3 jours`,
        ...enveloppe(prenom, corps, 'Gérer mon abonnement'),
      };
    }
    case 'SUB_J1': {
      // Même correctif que TRIAL_J1 ci-dessus, même raison.
      const corps = `Dernier jour de votre abonnement ${ctx.planLabel} : il se termine le ${date}.${blocRegression(
        ctx.lostFeatures,
        ctx.reducedFeatures,
        'Sans renouvellement, vous perdrez',
        'Vos quotas seront réduits pour',
      )}`;
      return {
        title: `${ctx.planLabel} : dernier jour`,
        body: corps,
        emailSubject: `Dernier jour de votre abonnement ${ctx.planLabel}`,
        ...enveloppe(prenom, corps, 'Gérer mon abonnement'),
      };
    }
    case 'EXPIRED_J1': {
      const corps = `Votre abonnement ${ctx.planLabel} a pris fin le ${date}.${blocRegression(
        ctx.lostFeatures,
        ctx.reducedFeatures,
        'Vous avez perdu',
        'Vos quotas sont désormais réduits pour',
      )}`;
      return {
        title: `Votre abonnement ${ctx.planLabel} a pris fin`,
        body: corps,
        emailSubject: `Votre abonnement ${ctx.planLabel} a pris fin`,
        ...enveloppe(prenom, corps, "Reprendre l'abonnement"),
      };
    }
  }
}
