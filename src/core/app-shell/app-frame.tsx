import type { ReactNode } from 'react'

import { cn } from '../ui/cn'

// Outer frame of the (app) group: leaves room under the content for the fixed phone tab bar
// whenever one is rendered (tab roots only), nothing on flow pages or from md up. It also marks
// the page for the app ground (globals.css: #0E0C0A to #0B0A09 over 40vh, DESKTOP-NOTES item 6).
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div data-app-ground="" className="flex min-h-dvh flex-1 flex-col has-[>nav[data-tabbar]]:pb-[calc(var(--sab)+64px)] md:has-[>nav[data-tabbar]]:pb-0">
      {children}
    </div>
  )
}

// App pages are a phone column that widens to 720px on desktop (§8.6). `wide` pages (Create,
// Photos, the workspace and the photo page) use the 1120px content column instead, with the
// grids and two-column layouts the v3-b desktop comps draw (§6.9 item 7).
export function AppPage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn('w-full pb-6', wide ? 'content-column' : 'mx-auto max-w-[720px]')}>{children}</div>
}
