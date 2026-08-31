// Tests du module Jira. `texteVersAdf` est pure et testée directement ;
// `creerTicketJira` est testée en simulant `fetch` — aucun appel réseau
// réel, aucune variable d'environnement Jira nécessaire pour les cas qui ne
// dépendent pas de la configuration.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { creerTicketJira, estRetryable, texteVersAdf, type NouveauTicketJira } from './jira';

// ─────────────────────────────────────────────────────────────────────────
// texteVersAdf
// ─────────────────────────────────────────────────────────────────────────

describe('texteVersAdf', () => {
  it('produit un seul paragraphe pour une ligne unique', () => {
    expect(texteVersAdf('Bonjour')).toEqual({
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour' }] }],
    });
  });

  it('relie les lignes consécutives par des sauts durs, sans les séparer en paragraphes', () => {
    const doc = texteVersAdf('Ligne 1\nLigne 2\nLigne 3');
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].content).toEqual([
      { type: 'text', text: 'Ligne 1' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Ligne 2' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Ligne 3' },
    ]);
  });

  it('sépare deux blocs par une ligne vide en deux paragraphes distincts', () => {
    const doc = texteVersAdf('Premier bloc\n\nSecond bloc');
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Premier bloc' }] });
    expect(doc.content[1]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Second bloc' }] });
  });

  it('reproduit exactement la structure de corpsTicketJira (référence / message / bloc technique)', () => {
    const texte = [
      'Signalement utilisateur — REF-A7F3K2',
      '',
      'Le message.',
      '',
      '---',
      'Membre : visiteur non connecté',
      'Page : non renseignée',
    ].join('\n');
    const doc = texteVersAdf(texte);
    // Trois blocs séparés par les deux lignes vides ; le troisième garde ses
    // trois lignes reliées par des hardBreak, pas éclatées en paragraphes.
    expect(doc.content).toHaveLength(3);
    expect(doc.content[2].content).toHaveLength(5); // 3 textes + 2 hardBreak
  });

  it("ne produit jamais un document sans paragraphe, même pour un texte vide", () => {
    // Jira refuse un `content` vide — improbable en pratique (le message est
    // borné à 20 caractères minimum par la validation) mais la fonction ne
    // doit pas en dépendre pour rester correcte isolément.
    const doc = texteVersAdf('');
    expect(doc.content.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// estRetryable
// ─────────────────────────────────────────────────────────────────────────

describe('estRetryable', () => {
  it('retente sur 429 et toute erreur serveur (5xx)', () => {
    expect(estRetryable(429)).toBe(true);
    expect(estRetryable(500)).toBe(true);
    expect(estRetryable(503)).toBe(true);
  });

  it('ne retente jamais sur une erreur de configuration ou de contenu', () => {
    // Répéter un 400/401/403 à l'identique une seconde plus tard produirait
    // exactement la même erreur (spec §8.4).
    expect(estRetryable(400)).toBe(false);
    expect(estRetryable(401)).toBe(false);
    expect(estRetryable(403)).toBe(false);
    expect(estRetryable(201)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// creerTicketJira
// ─────────────────────────────────────────────────────────────────────────

const ctx: NouveauTicketJira = {
  reference: 'REF-A7F3K2',
  subject: 'Les quantités ne se recalculent pas',
  message: 'Le détail du problème, assez long pour passer la validation.',
  userId: '8f14e45f-ceea-467a-9f5c-3b2a1d7e4c09',
  pageUrl: '/recette/tarte-au-citron',
  browserContext: 'Chrome 128 / Android / mobile',
  appVersion: 'a1b2c3d',
};

const ENV_JIRA = {
  JIRA_BASE_URL: 'https://exemple.atlassian.net',
  JIRA_EMAIL: 'bot@exemple.fr',
  JIRA_API_TOKEN: 'jeton-de-test',
  JIRA_PROJECT_KEY: 'JEP',
  JIRA_ISSUE_TYPE_BUG: 'Bug',
};

function reponseJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('creerTicketJira', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, ENV_JIRA);
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("n'appelle pas le réseau si la configuration est incomplète", async () => {
    delete process.env.JIRA_API_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultat = await creerTicketJira(ctx);

    expect(resultat.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renvoie la clé du ticket sur un 201, avec le bon corps de requête', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponseJson(201, { id: '10099', key: 'JEP-142' }));
    vi.stubGlobal('fetch', fetchMock);

    const resultat = await creerTicketJira(ctx);

    expect(resultat).toEqual({ ok: true, issueKey: 'JEP-142' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://exemple.atlassian.net/rest/api/3/issue');
    expect(init.headers.Authorization).toMatch(/^Basic /);
    const corps = JSON.parse(init.body);
    expect(corps.fields.project).toEqual({ key: 'JEP' });
    expect(corps.fields.issuetype).toEqual({ name: 'Bug' });
    expect(corps.fields.summary).toContain('Les quantités ne se recalculent pas');
    expect(corps.fields.labels).toEqual(['remontee-utilisateur', 'formulaire-contact']);
    // Jamais de champ `reporter` : les membres n'ont pas de compte Jira.
    expect(corps.fields.reporter).toBeUndefined();
    // Pseudonymisation : ni e-mail ni nom ne transitent par ce module (ils ne
    // font même pas partie de `NouveauTicketJira`) — seul l'UUID figure dans
    // le corps du ticket.
    expect(JSON.stringify(corps)).toContain(ctx.userId);
  });

  it('retente une fois après un 429, puis réussit', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reponseJson(429, { errorMessages: ['Too many requests'] }))
      .mockResolvedValueOnce(reponseJson(201, { key: 'JEP-143' }));
    vi.stubGlobal('fetch', fetchMock);

    const promesse = creerTicketJira(ctx);
    await vi.runAllTimersAsync();
    const resultat = await promesse;

    expect(resultat).toEqual({ ok: true, issueKey: 'JEP-143' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('abandonne après un seul retry si le second essai échoue aussi', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponseJson(503, {}));
    vi.stubGlobal('fetch', fetchMock);

    const promesse = creerTicketJira(ctx);
    await vi.runAllTimersAsync();
    const resultat = await promesse;

    expect(resultat.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2); // pas un troisième essai
  });

  it('ne retente jamais un 400, 401 ou 403 — un seul appel réseau', async () => {
    for (const status of [400, 401, 403]) {
      const fetchMock = vi.fn().mockResolvedValue(reponseJson(status, { errorMessages: ['refus'] }));
      vi.stubGlobal('fetch', fetchMock);

      const resultat = await creerTicketJira(ctx);

      expect(resultat.ok).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    }
  });

  it('rend une erreur exploitable sans jamais lever, même sur une panne réseau totale', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const promesse = creerTicketJira(ctx);
    await vi.runAllTimersAsync();
    const resultat = await promesse;

    expect(resultat.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2); // un retry, même sur une exception
  });
});
