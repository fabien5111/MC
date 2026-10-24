// Photos d'un avis : data-URL (dépôt frais) ou URL Swift `jp-photos/avis/`
// (le navigateur dépose avant d'appeler la route) — jamais une URL externe.
import { describe, expect, it } from 'vitest';
import { validateReview } from '@/lib/reviews';

const swift = 'https://exemple.infomaniak.com/v1/AUTH_x/jp-photos/avis/abc.webp';

describe('validateReview — photos', () => {
  it('accepte une data-URL', () => {
    expect(validateReview(5, '', [{ url: 'data:image/webp;base64,AAAA', ai_retouched: false }]).ok).toBe(true);
  });
  it('accepte une URL de stockage jp-photos/avis', () => {
    expect(validateReview(5, '', [{ url: swift, ai_retouched: false }]).ok).toBe(true);
  });
  it('refuse une URL externe ou un autre préfixe', () => {
    expect(validateReview(5, '', [{ url: 'https://evil.example/pixel.png', ai_retouched: false }]).ok).toBe(false);
    expect(validateReview(5, '', [{ url: swift.replace('/avis/', '/recettes/'), ai_retouched: false }]).ok).toBe(false);
  });
  it('refuse plus de 2 photos', () => {
    const p = { url: swift, ai_retouched: false };
    expect(validateReview(5, '', [p, p, p]).ok).toBe(false);
  });
});
