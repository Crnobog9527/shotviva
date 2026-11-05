import type { Metadata } from 'next'

import { appShellMetadata } from '@/core/seo'

// Every logged-in page is noindex through this one layout, never per page (AGENTS §9).
// The app shell UI itself lands with T8; every page inside calls requireUser() itself.
export const metadata: Metadata = appShellMetadata()

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return <main className="flex min-h-dvh flex-1 flex-col">{children}</main>
}
