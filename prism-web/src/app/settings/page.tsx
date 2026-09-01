import type { Metadata } from 'next';
import SettingsView from '@/components/settings/SettingsView';
import { apiGetAuthed } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import type { SettingsData } from '@/lib/types';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const [sessionUser, data] = await Promise.all([
    getSessionUser(),
    apiGetAuthed<SettingsData>('/settings'),
  ]);

  return <SettingsView sessionUser={sessionUser} data={data} />;
}
