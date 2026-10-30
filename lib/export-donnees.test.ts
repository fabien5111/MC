import { describe, expect, it } from 'vitest';
import {
  DELAI_EXPORT_MEMBRE_MS,
  IMAGE_NON_EXPORTEE,
  RUBRIQUES,
  composerArchive,
  exportAutorise,
  imbriquer,
  nettoyer,
  nomFichierExport,
  parOrdre,
  remplacerParNom,
  type CleRubrique,
} from '@/lib/export-donnees';

describe('nettoyer', () => {
  it('retire les colonnes qui désignent un autre membre', () => {
    const [c] = nettoyer(
      [{ id: 'c1', name: 'Pâte sucrée', source_author_id: 'autre', source_author_name: 'Alice', source_recipe_id: 'r9' }],
      'recipe_project_components',
    );
    expect(c).toEqual({ id: 'c1', name: 'Pâte sucrée', source_recipe_id: 'r9' });
  });

  it("retire l'admin du journal et des abonnements", () => {
    expect(nettoyer([{ action: 'levee', admin_id: 'a1' }], 'member_moderation_events')[0]).toEqual({ action: 'levee' });
    expect(nettoyer([{ id: 1, created_by: 'a1' }], 'subscriptions')[0]).toEqual({ id: 1 });
    expect(nettoyer([{ id: 1, processed_by: 'a1' }], 'subscription_requests')[0]).toEqual({ id: 1 });
    expect(nettoyer([{ id: 1, author_id: 'a1', author_kind: 'admin', body: 'ok' }], 'contact_replies')[0]).toEqual({
      id: 1,
      author_kind: 'admin',
      body: 'ok',
    });
  });

  it('ne reprend pas les clés de chiffrement des appareils', () => {
    expect(
      nettoyer([{ id: 1, endpoint: 'https://fcm.googleapis.com/x', p256dh: 'k', auth: 's', user_agent: 'Firefox' }], 'push_subscriptions')[0],
    ).toEqual({ id: 1, user_agent: 'Firefox' });
  });

  it('remplace les images en data-URL, garde les adresses', () => {
    const [p] = nettoyer([{ avatar_url: 'data:image/png;base64,AAAA', cover_url: 'https://x/y.jpg' }], 'profiles');
    expect(p).toEqual({ avatar_url: IMAGE_NON_EXPORTEE, cover_url: 'https://x/y.jpg' });
  });

  it("ne modifie pas l'entrée", () => {
    const entree = [{ id: 1, fts: 'x' }];
    nettoyer(entree, 'recipes');
    expect(entree[0]).toEqual({ id: 1, fts: 'x' });
  });
});

describe('remplacerParNom', () => {
  it("remplace l'identifiant d'un tiers par son nom affiché", () => {
    const noms = new Map([['u2', 'Bob']]);
    expect(remplacerParNom([{ following_id: 'u2', created_at: 'd' }], 'following_id', noms, 'patissier')).toEqual([
      { created_at: 'd', patissier: 'Bob' },
    ]);
  });

  it("ne laisse jamais l'identifiant d'un membre introuvable", () => {
    const [l] = remplacerParNom([{ owner_id: 'u3' }], 'owner_id', new Map(), 'recu_de');
    expect(l).toEqual({ recu_de: 'Membre inconnu' });
  });
});

describe('imbriquer / parOrdre', () => {
  it('range les enfants sous leur parent et retire la colonne de lien', () => {
    const r = imbriquer([{ id: 'a' }, { id: 'b' }], [{ step_id: 'a', url: 'u1' }], 'step_id', 'photos');
    expect(r).toEqual([{ id: 'a', photos: [{ url: 'u1' }] }, { id: 'b', photos: [] }]);
  });

  it("trie par order_index sans toucher à l'entrée", () => {
    const e = [{ order_index: 2 }, { order_index: 1 }];
    expect(parOrdre(e).map((x) => x.order_index)).toEqual([1, 2]);
    expect(e[0].order_index).toBe(2);
  });
});

describe('exportAutorise', () => {
  const maintenant = new Date('2026-10-30T12:00:00Z');

  it('autorise un premier export ou une date illisible', () => {
    expect(exportAutorise(null, maintenant)).toEqual({ ok: true });
    expect(exportAutorise('pas une date', maintenant)).toEqual({ ok: true });
  });

  it('refuse un second export dans les 24 heures', () => {
    const r = exportAutorise('2026-10-30T08:00:00Z', maintenant);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.prochainLe.toISOString()).toBe('2026-10-31T08:00:00.000Z');
  });

  it('autorise après 24 heures', () => {
    expect(exportAutorise(new Date(maintenant.getTime() - DELAI_EXPORT_MEMBRE_MS).toISOString(), maintenant)).toEqual({ ok: true });
  });

  it("une date dans le futur ne bloque pas plus d'un délai", () => {
    const r = exportAutorise('2027-01-01T00:00:00Z', maintenant);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.prochainLe.getTime() - maintenant.getTime()).toBe(DELAI_EXPORT_MEMBRE_MS);
  });
});

describe('nomFichierExport', () => {
  it('compose un nom sûr et daté', () => {
    expect(nomFichierExport('fabien-chenu', new Date('2026-10-30T23:00:00Z'))).toBe('je-patisse-donnees-fabien-chenu-2026-10-30.json');
    expect(nomFichierExport('a"b/../c', new Date('2026-10-30T10:00:00Z'))).toBe('je-patisse-donnees-abc-2026-10-30.json');
    expect(nomFichierExport(null, new Date('2026-10-30T10:00:00Z'))).toBe('je-patisse-donnees-membre-2026-10-30.json');
  });
});

describe('composerArchive', () => {
  it('explique chaque rubrique et les range dans le même ordre', () => {
    const donnees = Object.fromEntries(RUBRIQUES.map((r) => [r.cle, []])) as unknown as Record<CleRubrique, unknown>;
    const a = composerArchive({ membreId: 'm1', origine: 'membre', genereLe: new Date('2026-10-30T10:00:00Z'), donnees });
    expect(a.a_propos.genere_le).toBe('2026-10-30T10:00:00.000Z');
    expect(Object.keys(a.a_propos.rubriques)).toEqual(RUBRIQUES.map((r) => r.cle));
    expect(Object.keys(a.donnees)).toEqual(RUBRIQUES.map((r) => r.cle));
    expect(a.a_propos.non_inclus.length).toBeGreaterThan(0);
  });

  it('couvre les rubriques demandées par le ticket', () => {
    const cles = RUBRIQUES.map((r) => r.cle);
    for (const attendu of [
      'compte',
      'recettes',
      'fournees',
      'avis',
      'idees',
      'favoris',
      'abonnements_patissiers',
      'partages',
      'listes_de_courses',
      'projets',
      'demandes_de_contact',
      'abonnement_payant',
      'notifications',
      'journal_moderation',
    ]) {
      expect(cles).toContain(attendu);
    }
  });
});
