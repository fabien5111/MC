// Historique des crédits IA — lecture (serveur, sous la session du membre).
//
// `ai_credit_movements` n'est lisible que par son propriétaire (RLS) : aucun
// filtre de sécurité à ajouter ici, `user_id` n'est posé que pour l'index.
// Absente des types générés : accès non typé. **Table absente** (migration pas
// jouée) ou lecture en échec : `null`, le bloc n'est simplement pas affiché.
import { createClient } from '@/lib/supabase/server';
import { parPeriode, regrouperOperations, type MouvementCredit, type PeriodeCredits } from '@/lib/credits-historique';

/** Lignes lues au plus : 13 mois de journal, très au-delà d'un usage normal. */
const LIGNES_MAX = 500;

export type HistoriqueCredits = {
  periodes: PeriodeCredits[];
  /** Ids d'imports encore lisibles : un lien vers un brouillon supprimé serait mort. */
  importsExistants: string[];
};

export async function getHistoriqueCredits(userId: string): Promise<HistoriqueCredits | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase as any)
      .from('ai_credit_movements')
      .select('id, created_at, periode_debut, action, credits, statut, groupe, ref_table, ref_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(LIGNES_MAX);
    if (error) {
      if (!['42P01', 'PGRST205'].includes(error.code ?? '')) {
        console.error('credits-historique :', error.message);
      }
      return null;
    }

    const lignes = (data ?? []) as MouvementCredit[];
    const idsImports = [...new Set(lignes.filter((l) => l.ref_table === 'imports' && l.ref_id).map((l) => Number(l.ref_id)))].filter(
      (n) => Number.isFinite(n),
    );
    let importsExistants: string[] = [];
    if (idsImports.length) {
      const { data: imports } = await supabase.from('imports').select('id').in('id', idsImports);
      importsExistants = (imports ?? []).map((i) => String(i.id));
    }

    return { periodes: parPeriode(regrouperOperations(lignes)), importsExistants };
  } catch (e) {
    console.error('credits-historique :', (e as Error).message);
    return null;
  }
}
