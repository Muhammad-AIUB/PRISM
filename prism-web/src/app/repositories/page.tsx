import type { Metadata } from 'next';
import RepositoriesView from '@/components/repositories/RepositoriesView';
import { apiGetAuthed } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import type { RepositoriesIndexData } from '@/lib/types';

export const metadata: Metadata = { title: 'Repositories' };

export default async function RepositoriesPage() {
  const [user, data] = await Promise.all([
    getSessionUser(),
    apiGetAuthed<RepositoriesIndexData>('/repositories'),
  ]);

  return <RepositoriesView user={user} data={data} />;
}
