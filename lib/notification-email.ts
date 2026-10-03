// Composition des e-mails du moteur de notifications (JEP-278/279) — PUR :
// aucune lecture de base, testable sans réseau. Les e-mails d'abonnement et de
// contact, composés avant le moteur, gardent leur propre texte (cf.
// `lib/notification-content.ts`) et ne passent pas par ici.
import { CATEGORIE_INFO, type Categorie } from '@/lib/notification-events';

/** Où le membre règle tout : cible du lien au pied de chaque e-mail. */
export const CHEMIN_PREFERENCES = '/reglages#notifications';

const echapper = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function paragraphes(texte: string): string {
  return texte
    .split(/\n{2,}/)
    .map((p) => `<p>${echapper(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function pied(urlPreferences: string): { html: string; text: string } {
  return {
    html: `<p style="color:#888;font-size:12px;margin-top:24px;">Vous recevez cet e-mail selon vos préférences de notification. <a href="${urlPreferences}">Gérer mes préférences</a></p>`,
    text: `\n\n—\nGérer mes préférences de notification : ${urlPreferences}`,
  };
}

/** En-têtes d'un e-mail facultatif : désinscription en un clic vers les préférences. */
export function enTetesDesinscription(urlPreferences: string): Record<string, string> {
  return { 'List-Unsubscribe': `<${urlPreferences}>` };
}

export type EmailCompose = { sujet: string; html: string; texte: string };

export function composerEmailNotification(opts: {
  prenom: string | null;
  titre: string;
  corps: string;
  urlSite: string;
  lien: string | null;
}): EmailCompose {
  const bonjour = `Bonjour ${opts.prenom?.trim() || ''}`.trim();
  const urlPrefs = `${opts.urlSite}${CHEMIN_PREFERENCES}`;
  const urlLien = opts.lien ? `${opts.urlSite}${opts.lien}` : null;
  const p = pied(urlPrefs);
  const html =
    `<p>${echapper(bonjour)},</p>${paragraphes(opts.corps)}` +
    (urlLien ? `<p><a href="${urlLien}">Voir sur Je pâtisse !</a></p>` : '') +
    p.html;
  const texte = `${bonjour},\n\n${opts.corps}${urlLien ? `\n\nVoir sur Je pâtisse ! : ${urlLien}` : ''}${p.text}`;
  return { sujet: opts.titre, html, texte };
}

export type LigneRecap = { categorie: Categorie; titre: string; corps: string; lien: string | null };

/** Plusieurs lignes identiques (même titre + même corps) deviennent « (×3) ». */
function dedoublonner(lignes: LigneRecap[]): (LigneRecap & { fois: number })[] {
  const vues = new Map<string, LigneRecap & { fois: number }>();
  for (const l of lignes) {
    const k = `${l.titre}\u0000${l.corps}`;
    const existante = vues.get(k);
    if (existante) existante.fois += 1;
    else vues.set(k, { ...l, fois: 1 });
  }
  return [...vues.values()];
}

export function composerRecapitulatif(opts: {
  prenom: string | null;
  lignes: LigneRecap[];
  rythme: 'quotidien' | 'hebdo';
  urlSite: string;
}): EmailCompose {
  const bonjour = `Bonjour ${opts.prenom?.trim() || ''}`.trim();
  const urlPrefs = `${opts.urlSite}${CHEMIN_PREFERENCES}`;
  const unique = dedoublonner(opts.lignes);
  const n = unique.length;
  const periode = opts.rythme === 'hebdo' ? 'cette semaine' : 'aujourd’hui';
  const sujet = `Votre récapitulatif ${opts.rythme === 'hebdo' ? 'de la semaine' : 'du jour'} — ${n} nouveauté${n > 1 ? 's' : ''}`;

  const parCategorie = new Map<Categorie, (LigneRecap & { fois: number })[]>();
  for (const l of unique) parCategorie.set(l.categorie, [...(parCategorie.get(l.categorie) ?? []), l]);

  let html = `<p>${echapper(bonjour)},</p><p>Voici ce qui s’est passé ${periode} :</p>`;
  let texte = `${bonjour},\n\nVoici ce qui s’est passé ${periode} :`;
  for (const [cat, lignes] of parCategorie) {
    const titre = CATEGORIE_INFO[cat].libelle;
    html += `<h3 style="margin:16px 0 4px;">${echapper(titre)}</h3><ul>`;
    texte += `\n\n${titre}`;
    for (const l of lignes) {
      const suffixe = l.fois > 1 ? ` (×${l.fois})` : '';
      const lien = l.lien ? ` <a href="${opts.urlSite}${l.lien}">Voir</a>` : '';
      html += `<li><strong>${echapper(l.titre)}</strong>${suffixe} — ${echapper(l.corps).replace(/\n/g, '<br>')}${lien}</li>`;
      texte += `\n— ${l.titre}${suffixe} : ${l.corps.replace(/\n/g, ' ')}${l.lien ? ` (${opts.urlSite}${l.lien})` : ''}`;
    }
    html += '</ul>';
  }
  const p = pied(urlPrefs);
  return { sujet, html: html + p.html, texte: texte + p.text };
}
