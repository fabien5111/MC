import { describe, expect, it } from 'vitest';
import { confirmationDe, confirmationsParId } from '@/lib/email-confirmation';

describe('confirmationDe', () => {
  it('date présente → confirmé, absente → non confirmé', () => {
    expect(confirmationDe({ id: 'a', email_confirmed_at: '2026-09-01T10:00:00Z' })).toBe(true);
    expect(confirmationDe({ id: 'a', email_confirmed_at: null })).toBe(false);
    expect(confirmationDe({ id: 'a' })).toBe(false);
  });
  it('compte inconnu de GoTrue → null (ni badge, ni filtre)', () => {
    expect(confirmationDe(null)).toBeNull();
    expect(confirmationDe(undefined)).toBeNull();
  });
});

describe('confirmationsParId', () => {
  it('indexe chaque compte par son id', () => {
    const m = confirmationsParId([
      { id: 'a', email_confirmed_at: '2026-09-01T10:00:00Z' },
      { id: 'b', email_confirmed_at: null },
    ]);
    expect(m.get('a')).toBe(true);
    expect(m.get('b')).toBe(false);
    expect(m.has('c')).toBe(false);
  });
});
