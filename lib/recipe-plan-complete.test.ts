import { describe, expect, it } from 'vitest';
import { stepComplete } from './recipe-plan';

const etape = (done: boolean) => ({ done, replaced_by_recipe_id: null });
const ing = (o: { done?: boolean; excluded_when_done?: boolean }) => ({ removed: false, expanded_into_recipe_id: null, excluded_when_done: true, done: false, ...o });
const sub = (o: { done?: boolean; excluded_when_done?: boolean }) => ({ excluded_when_done: true, done: false, ...o });

describe('stepComplete', () => {
  it("n'est pas terminée tant que l'étape n'est pas cochée", () => {
    expect(stepComplete(etape(false), [], [])).toBe(false);
  });
  it('est terminée quand tout est exclu par « déjà réalisé »', () => {
    expect(stepComplete(etape(true), [ing({})], [sub({})])).toBe(true);
  });
  it('pâte au congélateur : la cuisson gardée reste à faire', () => {
    expect(stepComplete(etape(true), [ing({})], [sub({}), sub({ excluded_when_done: false })])).toBe(false);
  });
  it('devient terminée quand la sous-étape gardée est cochée', () => {
    expect(stepComplete(etape(true), [ing({})], [sub({}), sub({ excluded_when_done: false, done: true })])).toBe(true);
  });
});
