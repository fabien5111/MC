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
  /** Fonctionnalités effectivement perdues PAR CE MEMBRE (§10) — jamais un texte générique. */
  lostFeatures: string[];
};

export type ComposedNotification = {
  title: string;
  body: string;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
};

function listePerte(lostFeatures: string[]): string {
  if (lostFeatures.length === 0) return '';
  return lostFeatures.map((f) => `— ${f}`).join('\n');
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
  const perte = listePerte(ctx.lostFeatures);

  switch (type) {
    case 'TRIAL_J3': {
      const corps = `Votre essai gratuit ${ctx.planLabel} se termine dans 3 jours, le ${date}.${
        perte ? `\n\nSans abonnement, vous perdrez :\n${perte}` : ''
      }`;
      return {
        title: `Essai ${ctx.planLabel} : fin dans 3 jours`,
        body: corps,
        emailSubject: `Votre essai ${ctx.planLabel} se termine dans 3 jours`,
        ...enveloppe(prenom, corps, 'Voir les formules'),
      };
    }
    case 'TRIAL_J1': {
      const corps = `Dernier jour de votre essai gratuit ${ctx.planLabel} : il se termine aujourd’hui, le ${date}.${
        perte ? `\n\nSans abonnement, vous perdrez :\n${perte}` : ''
      }`;
      return {
        title: `Essai ${ctx.planLabel} : dernier jour`,
        body: corps,
        emailSubject: `Dernier jour de votre essai ${ctx.planLabel}`,
        ...enveloppe(prenom, corps, 'Voir les formules'),
      };
    }
    case 'SUB_J3': {
      const corps = `Votre abonnement ${ctx.planLabel} arrive à échéance dans 3 jours, le ${date}.${
        perte ? `\n\nSans renouvellement, vous perdrez :\n${perte}` : ''
      }`;
      return {
        title: `${ctx.planLabel} : échéance dans 3 jours`,
        body: corps,
        emailSubject: `Votre abonnement ${ctx.planLabel} arrive à échéance dans 3 jours`,
        ...enveloppe(prenom, corps, 'Gérer mon abonnement'),
      };
    }
    case 'SUB_J1': {
      const corps = `Dernier jour de votre abonnement ${ctx.planLabel} : il se termine aujourd’hui, le ${date}.${
        perte ? `\n\nSans renouvellement, vous perdrez :\n${perte}` : ''
      }`;
      return {
        title: `${ctx.planLabel} : dernier jour`,
        body: corps,
        emailSubject: `Dernier jour de votre abonnement ${ctx.planLabel}`,
        ...enveloppe(prenom, corps, 'Gérer mon abonnement'),
      };
    }
    case 'EXPIRED_J1': {
      const corps = `Votre abonnement ${ctx.planLabel} a pris fin le ${date}.${
        perte ? `\n\nCe qui change concrètement :\n${perte}` : ''
      }`;
      return {
        title: `Votre abonnement ${ctx.planLabel} a pris fin`,
        body: corps,
        emailSubject: `Votre abonnement ${ctx.planLabel} a pris fin`,
        ...enveloppe(prenom, corps, "Reprendre l'abonnement"),
      };
    }
  }
}
