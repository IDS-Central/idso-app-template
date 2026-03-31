// SIDEBAR: Navigation sidebar that reads items from config/nav.ts.
//
// Features:
//   - Top-level nav items always visible
//   - Collapsible sections for grouped items
//   - Active route highlighting
//   - Mobile-responsive with toggle button
//   - User email display with sign-out link

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { NAV_ITEMS, NAV_SECTIONS } from '@/config/nav';
import { useAuth } from './AuthProvider';

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const sidebarContent = (
    <>
      {/* App title */}
      <div className="p-4 border-b border-gray-700">
        <Link href="/" className="text-lg font-semibold hover:text-white">
          IDSO App
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {/* Top-level items */}
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded text-sm ${
              pathname === item.href
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            {item.label}
          </Link>
        ))}

        {/* Sections */}
        {NAV_SECTIONS.map((section) => {
          const sectionKey = section.title.toLowerCase().replace(/\s+/g, '-');
          const isExpanded = expandedSections[sectionKey] ?? false;
          const isActive = section.items.some(
            (item) => pathname === item.href || pathname.startsWith(item.href + '/')
          );

          return (
            <div key={sectionKey}>
              <div className="pt-3 pb-1 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                {section.title}
              </div>
              <button
                onClick={() => toggleSection(sectionKey)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm ${
                  isActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span>{section.title}</span>
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="ml-4 space-y-1 mt-1">
                  {section.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block px-3 py-1.5 rounded text-sm ${
                        pathname === item.href
                          ? 'bg-gray-700 text-white'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User info and sign out */}
      {user && (
        <div className="p-4 border-t border-gray-700">
          <p className="text-xs text-gray-400 truncate">{user.email}</p>
          <a
            href="/api/auth/logout"
            className="mt-2 block text-sm text-gray-300 hover:text-white"
          >
            Sign out
          </a>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-gray-900 text-white rounded-lg"
        aria-label="Toggle navigation"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {mobileOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - mobile */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-gray-100 flex flex-col transform transition-transform ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Sidebar - desktop */}
      <aside className="hidden md:flex w-64 bg-gray-900 text-gray-100 flex-col min-h-screen">
        {sidebarContent}
      </aside>
    </>
  );
}
