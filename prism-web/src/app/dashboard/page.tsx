import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import DashboardView from '@/components/dashboard/DashboardView';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import { apiGetAuthed } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import type { DashboardData } from '@/lib/types';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Server component: the session and the data are both fetched here, so the
 * browser never sees the API origin or the session cookie's value. The
 * interactive parts (tabs, chart, polling) live in DashboardView.
 */
export default async function DashboardPage() {
  const [user, data] = await Promise.all([
    getSessionUser(),
    apiGetAuthed<DashboardData>('/dashboard'),
  ]);

  return (
    <AuthenticatedLayout
      user={user}
      header={
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-[10px] font-medium uppercase tracking-wider sm:text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              Overview
            </p>
            <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
              Dashboard
            </h1>
          </div>
          <Link
            href="/repositories"
            className="btn btn-primary min-h-[44px] shrink-0 transition active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Connect Repository</span>
            <span className="sm:hidden">Connect</span>
          </Link>
        </div>
      }
    >
      <DashboardView data={data} />
    </AuthenticatedLayout>
  );
}
