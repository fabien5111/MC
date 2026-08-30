import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireFullAdmin } from '@/lib/auth';
import { getMemberById, getBatchCount, getMemberRecentRecipes, getMemberRecentBatches, getMemberRecentComments } from '@/lib/admin';
import { getFollowCounts } from '@/lib/follows';
import { MemberDetail } from '@/components/admin/MemberDetail';

export const metadata: Metadata = { title: 'Fiche membre | Admin — Je pâtisse !' };

export default async function AdminMemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFullAdmin(); // comptes, rôles et impersonation : admin complet
  const { id } = await params;
  const member = await getMemberById(id);
  if (!member) notFound();

  const [followCounts, batchCount, recentRecipes, recentBatches, recentComments] = await Promise.all([
    member.profileId ? getFollowCounts(member.profileId) : Promise.resolve({ followers: 0, following: 0 }),
    member.profileId ? getBatchCount(member.profileId) : Promise.resolve(0),
    member.profileId ? getMemberRecentRecipes(member.profileId) : Promise.resolve([]),
    member.profileId ? getMemberRecentBatches(member.profileId) : Promise.resolve([]),
    member.profileId ? getMemberRecentComments(member.profileId) : Promise.resolve([]),
  ]);

  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20 gap-4">
        <span className="font-headline-md text-2xl text-primary truncate">{member.fullName || member.email}</span>
        <Link
          href="/admin/membres"
          className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span> Membres
        </Link>
      </header>
      <MemberDetail
        member={member}
        stats={{ followers: followCounts.followers, following: followCounts.following, batches: batchCount }}
        recent={{ recipes: recentRecipes, batches: recentBatches, comments: recentComments }}
      />
    </>
  );
}
