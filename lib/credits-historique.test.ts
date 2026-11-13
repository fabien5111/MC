import { describe, expect, it } from 'vitest';
import {
  lienOperation,
  libelleOperation,
  parPeriode,
  regrouperOperations,
  type MouvementCredit,
} from '@/lib/credits-historique';

let n = 0;
const m = (p: Partial<MouvementCredit>): MouvementCredit => ({
  id: ++n,
  created_at: '2026-11-12T10:00:00Z',
  periode_debut: '2026-10-21T00:00:00Z',
  action: 'ajustement',
  credits: 1,
  statut: 'debite',
  groupe: `g${n}`,
  ref_table: null,
  ref_id: null,
  ...p,
});

describe('historique des crédits IA', () => {
  it('un import photo : trois pages + la mise en forme = UNE opération', () => {
    const g = 'import-1';
    const lignes = [
      m({ groupe: g, action: 'import_photo_page', credits: 3, created_at: '2026-11-12T10:00:01Z' }),
      m({ groupe: g, action: 'import_photo_page', credits: 3, created_at: '2026-11-12T10:00:02Z' }),
      m({ groupe: g, action: 'import_photo_page', credits: 3, created_at: '2026-11-12T10:00:03Z' }),
      m({ groupe: g, action: 'import_photo_structuration', credits: 2, created_at: '2026-11-12T10:00:09Z', ref_table: 'imports', ref_id: '42' }),
    ];
    const ops = regrouperOperations(lignes);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ libelle: 'Import photo, 3 pages', credits: 11, rendus: 0, statut: 'debite', ref: { table: 'imports', id: '42' } });
  });

  it('un import photo abandonné avant la mise en forme le dit', () => {
    const g = 'import-2';
    const ops = regrouperOperations([
      m({ groupe: g, action: 'import_photo_page', credits: 3 }),
      m({ groupe: g, action: 'import_photo_page', credits: 3 }),
    ]);
    expect(ops[0].libelle).toBe('Import photo, 2 pages (non terminé)');
    expect(ops[0].credits).toBe(6);
  });

  it('un appel en échec est rendu : visible, mais non compté', () => {
    const [op] = regrouperOperations([m({ action: 'import_texte', credits: 3, statut: 'rendu' })]);
    expect(op).toMatchObject({ libelle: 'Import d’un texte', credits: 0, rendus: 3, statut: 'rendu' });
  });

  it('une page rendue dans un import réussi : opération partielle', () => {
    const g = 'import-3';
    const [op] = regrouperOperations([
      m({ groupe: g, action: 'import_photo_page', credits: 3, statut: 'rendu' }),
      m({ groupe: g, action: 'import_photo_page', credits: 3 }),
      m({ groupe: g, action: 'import_photo_structuration', credits: 2 }),
    ]);
    expect(op).toMatchObject({ credits: 5, rendus: 3, statut: 'partiel' });
  });

  it('le total d’une période égale la jauge : les lignes rendues n’y comptent pas', () => {
    const ops = regrouperOperations([
      m({ credits: 1 }),
      m({ credits: 3, action: 'import_texte' }),
      m({ credits: 3, action: 'import_texte', statut: 'rendu' }),
    ]);
    const [p] = parPeriode(ops);
    expect(p.total).toBe(4);
  });

  it('les périodes sont rangées de la plus récente à la plus ancienne', () => {
    const ops = regrouperOperations([
      m({ periode_debut: '2026-09-21T00:00:00Z', created_at: '2026-10-01T10:00:00Z' }),
      m({ periode_debut: '2026-10-21T00:00:00Z', created_at: '2026-11-02T10:00:00Z' }),
      m({ periode_debut: '2026-10-21T00:00:00Z', created_at: '2026-11-10T10:00:00Z' }),
    ]);
    const periodes = parPeriode(ops);
    expect(periodes.map((p) => p.debut.slice(0, 10))).toEqual(['2026-10-21', '2026-09-21']);
    expect(periodes[0].operations[0].date > periodes[0].operations[1].date).toBe(true);
  });

  it('sans période enregistrée, repli sur le mois de la ligne', () => {
    const [op] = regrouperOperations([m({ periode_debut: null, created_at: '2026-11-12T10:00:00Z' })]);
    expect(op.periode.slice(0, 10)).toBe('2026-11-01');
  });

  it('un lien seulement vers un import qui existe encore', () => {
    const [op] = regrouperOperations([m({ action: 'import_texte', ref_table: 'imports', ref_id: '42' })]);
    expect(lienOperation(op, new Set(['42']))).toBe('/relecture/42');
    expect(lienOperation(op, new Set())).toBeNull();
    const [sans] = regrouperOperations([m({})]);
    expect(lienOperation(sans, new Set(['42']))).toBeNull();
  });

  it('action inconnue : libellé neutre', () => {
    expect(libelleOperation([m({ action: 'autre' })])).toBe('Action IA');
  });
});
