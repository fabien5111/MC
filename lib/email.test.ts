// Nom d'expéditeur (JEP-377).
import { describe, expect, it } from 'vitest';
import { expediteur } from '@/lib/email';

describe('expediteur', () => {
  it('affiche « Je pâtisse ! » plutôt que « noreply »', () => {
    expect(expediteur('noreply@jepatisse.com', 'Je pâtisse !')).toEqual({ name: 'Je pâtisse !', address: 'noreply@jepatisse.com' });
  });
  it('garde une adresse qui porte déjà un nom', () => {
    expect(expediteur('"Autre" <noreply@jepatisse.com>')).toBe('"Autre" <noreply@jepatisse.com>');
  });
});
