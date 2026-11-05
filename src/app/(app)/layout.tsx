// Bare app-shell group (ARCHITECTURE §1). The real shell (top bar + tab bar) is T8;
// every page inside calls requireUser() itself.
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return <main className="flex min-h-dvh flex-1 flex-col">{children}</main>
}
