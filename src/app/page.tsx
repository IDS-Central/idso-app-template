// Dashboard page — the authenticated home page.
// Replace this with your app's dashboard content.
// Use DashboardCard components for summary metrics.

'use client';

import { useAuth } from '@/components/AuthProvider';
import { LoadingState } from '@/components/LoadingState';

export default function DashboardPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingState message="Loading dashboard..." />;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>

      {user && (
        <p className="text-gray-600 mb-8">
          Welcome, {user.email}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Add DashboardCard components here as you build your app. */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-600">Getting Started</h3>
          <p className="mt-2 text-sm text-gray-500">
            Add your app&apos;s pages in <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">src/app/(protected)/</code> and
            update <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">src/config/nav.ts</code> to add navigation links.
          </p>
        </div>
      </div>
    </div>
  );
}
