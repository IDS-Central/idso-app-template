// APP SHELL: Main layout wrapper with sidebar.
//
// Shows the sidebar + main content area for authenticated users.
// Hides the sidebar on the login page and when not authenticated.
// Wraps all pages except login (which uses its own layout).

'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { useAuth } from './AuthProvider';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  // Don't show sidebar on login page or when not authenticated
  if (pathname === '/login' || (!loading && !user)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  );
}
