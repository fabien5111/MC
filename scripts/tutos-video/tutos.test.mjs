// Garde-fous du contenu des tutos vidéo (`tutos.mjs`) : ce sont eux qui
// rendent une correction sûre avant `generer.mjs --jira`, qui réécrit les
// tickets sans relecture humaine entre les deux.
import { describe, expect, it } from 'vitest';
import { compterMots, description, dureeLisible, motsMax } from './generer.mjs';
import { TUTOS } from './tutos.mjs';

describe('tutos vidéo', () => {
  it('chaque segment de voix off tient dans sa durée', () => {
    const depassements = TUTOS.flatMap((t) =>
      t.sequences
        .map((s, i) => ({ seg: `tuto ${t.num} segment ${i + 1}`, mots: compterMots(s.voix), max: motsMax(s.duree) }))
        .filter((x) => x.mots > x.max),
    );
    expect(depassements).toEqual([]);
  });

  it('numéros et clés Jira uniques, champs obligatoires remplis', () => {
    expect(new Set(TUTOS.map((t) => t.num)).size).toBe(TUTOS.length);
    expect(new Set(TUTOS.map((t) => t.cle)).size).toBe(TUTOS.length);
    for (const t of TUTOS) {
      expect(t.cle).toMatch(/^JEP-\d+$/);
      expect(['demo', 'payant', 'jetable', 'google', 'visiteur']).toContain(t.compte);
      expect(['gratuit', 'payant']).toContain(t.plan);
      expect(t.sequences.length).toBeGreaterThan(0);
      for (const s of t.sequences) {
        expect(s.duree % 5).toBe(0);
        expect(s.gestes.length).toBeGreaterThan(0);
      }
    }
  });

  it('aucun identifiant réel du compte de démonstration dans un ticket', () => {
    const tout = TUTOS.map(description).join('\n');
    expect(tout).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    for (const variable of ['DEMO_EMAIL', 'DEMO_PASSWORD']) {
      const valeur = process.env[variable];
      if (valeur) expect(tout.includes(valeur)).toBe(false);
    }
  });

  it('une fonction payante se tourne avec un compte payant', () => {
    for (const t of TUTOS.filter((x) => x.plan === 'payant')) expect(t.compte).toBe('payant');
  });

  it('compte les mots prononcés, pauses exclues', () => {
    expect(compterMots("Donnez-lui un titre. [pause 0,5 s] C'est parti.")).toBe(7);
  });

  it('arrondit le plafond au pair sur une demi-unité', () => {
    expect(motsMax(10)).toBe(22);
    expect(motsMax(30)).toBe(68);
    expect(motsMax(15)).toBe(34);
  });

  it('affiche les durées comme les tickets', () => {
    expect(dureeLisible(45)).toBe('45 s');
    expect(dureeLisible(60)).toBe('1 min');
    expect(dureeLisible(65)).toBe('1 min 05');
  });
});
