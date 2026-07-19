import type { Metadata } from 'next';
import { getMolds, getMoldTypes } from '@/lib/admin';
import { MoldsManager } from '@/components/admin/MoldsManager';

export const metadata: Metadata = { title: 'Moules | Admin — Maryse Club' };

export default async function AdminMoulesPage() {
  const [molds, moldTypes] = await Promise.all([getMolds(), getMoldTypes()]);
  return <MoldsManager molds={molds} moldTypes={moldTypes} />;
}
