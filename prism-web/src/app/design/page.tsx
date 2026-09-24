import type { Metadata } from 'next';
import DesignStudioView from '@/components/design/DesignStudioView';
import { apiGetAuthed } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import type { BlueprintSummary } from '@/lib/types';

export const metadata: Metadata = { title: 'Design Studio' };

export default async function DesignPage() {
  const [user, data] = await Promise.all([
    getSessionUser(),
    apiGetAuthed<{ designs: BlueprintSummary[] }>('/design'),
  ]);

  return <DesignStudioView user={user} designs={data.designs} />;
}
