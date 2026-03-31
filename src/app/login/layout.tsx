// Login page uses a separate layout without the AppShell/Sidebar.
// This prevents the authenticated layout from rendering on the login page.

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
