import type { Metadata } from 'next';
import BlueprintView from '@/components/design/BlueprintView';
import { apiGetAuthed } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import type { Blueprint } from '@/lib/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { design } = await apiGetAuthed<{ design: Blueprint }>(`/design/${id}`);

  return { title: `Design · ${design.title}` };
}

export default async function BlueprintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, data] = await Promise.all([
    getSessionUser(),
    apiGetAuthed<{ design: Blueprint }>(`/design/${id}`),
  ]);

  return <BlueprintView user={user} design={data.design} />;
}
