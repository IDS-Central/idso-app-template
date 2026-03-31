// NAV: Navigation items for the sidebar.
//
// Add entries here when creating new app pages.
// The Sidebar component reads this config to render navigation links.
//
// Each item has:
//   label  — Display text in the sidebar
//   href   — Route path (must match a page in src/app/(protected)/)
//   icon   — Optional icon identifier (for future icon support)
//
// Sections group related nav items under a heading.

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

// Top-level nav items (always visible)
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/' },
];

// Grouped nav sections (rendered below top-level items)
// Add sections as you build out app features.
//
// Example:
//   export const NAV_SECTIONS: NavSection[] = [
//     {
//       title: 'Supply Requests',
//       items: [
//         { label: 'All Requests', href: '/supply-requests' },
//         { label: 'Pending Approval', href: '/supply-requests/pending' },
//       ],
//     },
//   ];
export const NAV_SECTIONS: NavSection[] = [];
