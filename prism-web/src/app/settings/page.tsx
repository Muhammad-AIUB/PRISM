import type { Metadata } from 'next';
import SettingsView from '@/components/settings/SettingsView';
import { apiGetAuthed } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import type { AiSettings, SettingsData } from '@/lib/types';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const [sessionUser, data, aiSettings] = await Promise.all([
    getSessionUser(),
    apiGetAuthed<SettingsData>('/settings'),
    apiGetAuthed<AiSettings>('/settings/ai'),
  ]);

  return <SettingsView sessionUser={sessionUser} data={data} aiSettings={aiSettings} />;
}
