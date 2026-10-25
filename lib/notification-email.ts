// Composition des e-mails du moteur de notifications (JEP-278/279) — PUR :
// aucune lecture de base, testable sans réseau. Ne produit que le CORPS du
// message : en-tête, signature et pied sont posés par le gabarit unique
// (`lib/email-gabarit.ts`, appliqué par `sendEmail`, JEP-277).
import { echapperHtml, CHEMIN_PREFERENCES } from '@/lib/email-gabarit';
import { CATEGORIE_INFO, RUBRIQUES, rubriqueInfo, type Categorie } from '@/lib/notification-events';

export { CHEMIN_PREFERENCES };

const echapper = echapperHtml;

function paragraphes(texte: string): string {
  return texte
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${echapper(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** En-têtes d'un e-mail facultatif : désinscription en un clic vers les préférences. */
export function enTetesDesinscription(urlPreferences: string): Record<string, string> {
  return { 'List-Unsubscribe': `<${urlPreferences}>` };
}

export type EmailCompose = { sujet: string; html: string; texte: string };

const salutation = (prenom: string | null) => `Bonjour ${prenom?.trim() || ''}`.trim();

export function composerEmailNotification(opts: {
  prenom: string | null;
  titre: string;
  corps: string;
  urlSite: string;
  lien: string | null;
}): EmailCompose {
  const bonjour = salutation(opts.prenom);
  const urlLien = opts.lien ? `${opts.urlSite}${opts.lien}` : null;
  const html =
    `<p style="margin:0 0 14px;">${echapper(bonjour)},</p>${paragraphes(opts.corps)}` +
    (urlLien ? `<p style="margin:0 0 14px;"><a href="${echapper(urlLien)}">Voir sur Je pâtisse !</a></p>` : '');
  const texte = `${bonjour},\n\n${opts.corps}${urlLien ? `\n\nVoir sur Je pâtisse ! : ${urlLien}` : ''}`;
  return { sujet: opts.titre, html, texte };
}

export type LigneRecap = {
  categorie: Categorie;
  /** Clé de rubrique (déduite de l'événement) : c'est elle qui fait la section. */
  rubrique?: string | null;
  titre: string;
  corps: string;
  lien: string | null;
};

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

export type SectionRecap = { cle: string; titre: string; lignes: (LigneRecap & { fois: number })[] };

/**
 * Découpe le récapitulatif en sections, une par TYPE d'information (JEP-375) :
 * la rubrique de l'événement (« Étapes à commencer aujourd'hui », « Favoris »…),
 * à défaut sa catégorie. Les rappels de fournée viennent en tête — ce sont les
 * seuls qui appellent un geste dans la journée —, le reste dans l'ordre de la
 * grille de préférences.
 */
export function sectionsRecap(lignes: LigneRecap[]): SectionRecap[] {
  const rang = (cle: string, categorie: Categorie) => {
    const i = RUBRIQUES.findIndex((r) => r.cle === cle);
    return (categorie === 'fournees' ? 0 : 1000) + (i < 0 ? 500 : i);
  };
  const parCle = new Map<string, SectionRecap & { rang: number }>();
  for (const l of dedoublonner(lignes)) {
    const info = l.rubrique ? rubriqueInfo(l.rubrique) : null;
    const cle = info?.cle ?? l.categorie;
    const titreCategorie = CATEGORIE_INFO[l.categorie]?.libelle ?? 'Autres';
    const titre = info?.libelle ?? titreCategorie;
    const section = parCle.get(cle) ?? { cle, titre, lignes: [], rang: rang(cle, l.categorie) };
    section.lignes.push(l);
    parCle.set(cle, section);
  }
  return [...parCle.values()].sort((a, b) => a.rang - b.rang).map(({ cle, titre, lignes: l }) => ({ cle, titre, lignes: l }));
}

export function composerRecapitulatif(opts: {
  prenom: string | null;
  lignes: LigneRecap[];
  rythme: 'quotidien' | 'hebdo';
  urlSite: string;
}): EmailCompose {
  const bonjour = salutation(opts.prenom);
  const sections = sectionsRecap(opts.lignes);
  const n = sections.reduce((t, s) => t + s.lignes.length, 0);
  const periode = opts.rythme === 'hebdo' ? 'de la semaine' : 'du jour';
  const sujet = `Votre récapitulatif ${periode} — ${n} information${n > 1 ? 's' : ''}`;

  let html = `<p style="margin:0 0 14px;">${echapper(bonjour)},</p><p style="margin:0 0 14px;">Voici votre récapitulatif ${periode} :</p>`;
  let texte = `${bonjour},\n\nVoici votre récapitulatif ${periode} :`;
  for (const s of sections) {
    html +=
      `<h3 style="margin:22px 0 6px;font-size:17px;color:#300a12;border-bottom:1px solid #efdfde;padding-bottom:4px;">${echapper(s.titre)}</h3>` +
      `<ul style="margin:0 0 8px;padding-left:20px;">`;
    texte += `\n\n${s.titre.toUpperCase()}`;
    for (const l of s.lignes) {
      const suffixe = l.fois > 1 ? ` (×${l.fois})` : '';
      const lien = l.lien ? ` <a href="${echapper(`${opts.urlSite}${l.lien}`)}">Voir</a>` : '';
      html += `<li style="margin:0 0 8px;"><strong>${echapper(l.titre)}</strong>${suffixe} — ${echapper(l.corps).replace(/\n/g, '<br>')}${lien}</li>`;
      texte += `\n— ${l.titre}${suffixe} : ${l.corps.replace(/\n/g, ' ')}${l.lien ? ` (${opts.urlSite}${l.lien})` : ''}`;
    }
    html += '</ul>';
  }
  return { sujet, html, texte };
}
