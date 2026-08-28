import type { Metadata } from 'next';
import { requireFullAdmin } from '@/lib/auth';
import { TestEmailForm } from '@/components/admin/TestEmailForm';

export const metadata: Metadata = { title: 'Test e-mail | Admin — Je pâtisse !' };

export default async function AdminTestEmailPage() {
  await requireFullAdmin(); // outil technique (config SMTP) : admin complet
  return <TestEmailForm />;
}
