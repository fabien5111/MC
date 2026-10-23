import { describe, expect, it } from 'vitest';
import { sessionImpersonationConcerne } from './impersonation-types';

describe('sessionImpersonationConcerne (JEP-27)', () => {
  it('ne vaut que pour la connexion ouverte par le lien', () => {
    expect(sessionImpersonationConcerne({ auth_session_id: 'a' }, 'a')).toBe(true);
    expect(sessionImpersonationConcerne({ auth_session_id: 'a' }, 'b')).toBe(false);
  });
  it('refuse une connexion sans session_id quand la ligne est rattachée', () => {
    expect(sessionImpersonationConcerne({ auth_session_id: 'a' }, null)).toBe(false);
  });
  it('garde l’ancien comportement pour une ligne non rattachée', () => {
    expect(sessionImpersonationConcerne({ auth_session_id: null }, 'b')).toBe(true);
    expect(sessionImpersonationConcerne({}, null)).toBe(true);
  });
});
