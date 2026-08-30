import type { Metadata } from 'next';
import RepositorySettingsView from '@/components/repositories/RepositorySettingsView';
import { apiGetAuthed } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import type { RepositorySettingsData } from '@/lib/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ repository: string }>;
}): Promise<Metadata> {
  const { repository } = await params;
  const data = await apiGetAuthed<RepositorySettingsData>(
    `/repositories/${repository}/settings`,
  );

  return { title: `Settings · ${data.repository.full_name}` };
}

export default async function RepositorySettingsPage({
  params,
}: {
  params: Promise<{ repository: string }>;
}) {
  const { repository } = await params;

  const [user, data] = await Promise.all([
    getSessionUser(),
    apiGetAuthed<RepositorySettingsData>(`/repositories/${repository}/settings`),
  ]);

  return <RepositorySettingsView user={user} data={data} />;
}
