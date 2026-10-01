import { describe, expect, it } from 'vitest';

import { DESCRIPTION_PARTAGE_MAX, descriptionPartage, type ProseDoc } from './blog-content';

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const titre = (text: string) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });
const doc = (...content: ProseDoc['content'] & object): ProseDoc => ({ type: 'doc', content });

const LONG =
  'Ouvrez le site sur votre téléphone, touchez le menu du navigateur puis « Ajouter à l’écran d’accueil » : l’application apparaît alors avec les autres, prête à servir en cuisine.';

describe('descriptionPartage (JEP-21)', () => {
  it('garde une description déjà assez fournie', () => {
    const d = 'Une description saisie par l’auteur, assez longue pour être utilisée telle quelle par les réseaux.';
    expect(descriptionPartage(d, doc(para(LONG)))).toBe(d);
  });

  it('complète une description courte par le début du texte, titres exclus', () => {
    const r = descriptionPartage('Installer l’application mobile', doc(titre('Installation sur Android'), para(LONG)));
    expect(r.startsWith('Installer l’application mobile. Ouvrez le site')).toBe(true);
    expect(r).not.toContain('Installation sur Android');
    expect(r.length).toBeLessThanOrEqual(DESCRIPTION_PARTAGE_MAX);
    expect(r.endsWith('…')).toBe(true);
  });

  it('ne répète pas un chapeau repris en tête du texte', () => {
    expect(descriptionPartage('Ouvrez le site', doc(para('Ouvrez le site sur votre téléphone.')))).toBe('Ouvrez le site sur votre téléphone.');
  });

  it('sans texte, rend la description telle quelle (même vide)', () => {
    expect(descriptionPartage('Court', doc())).toBe('Court');
    expect(descriptionPartage('', doc())).toBe('');
  });

  it('sans description, prend le début du texte', () => {
    expect(descriptionPartage('', doc(para('Un texte bref.')))).toBe('Un texte bref.');
  });
});
