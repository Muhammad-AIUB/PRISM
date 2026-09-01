import type { Metadata } from 'next';
import MyDataView from '@/components/security/MyDataView';
import { apiGetAuthed } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import type { MyData } from '@/lib/types';

export const metadata: Metadata = { title: 'My Data' };

export default async function MyDataPage() {
  const [user, data] = await Promise.all([
    getSessionUser(),
    apiGetAuthed<MyData>('/security/my-data'),
  ]);

  return <MyDataView user={user} data={data} />;
}
