// Chargeurs de données admin, typés — portés de db.js (getMolds, getMoldTypes).
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type MoldType = Database['public']['Tables']['mold_types']['Row'];
export type Mold = Database['public']['Tables']['molds']['Row'] & {
  mold_types: { name: string } | null;
};

export async function getMoldTypes(): Promise<MoldType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('mold_types')
    .select('*')
    .eq('status', 'published')
    .order('name');
  return data ?? [];
}

export async function getMolds(): Promise<Mold[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('molds').select('*, mold_types(name)').order('name');
  return (data as unknown as Mold[]) ?? [];
}
