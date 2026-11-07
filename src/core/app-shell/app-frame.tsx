import { ViewTransition, type ReactNode } from 'react'

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

// The page transition (DESIGN §8.2, T56): each navigation's type (ui/nav-motion) names the class
// the entering and the leaving page get; globals.css draws them. No type (browser back, a
// refresh, a redirect, reduced motion) is no animation.
export const PAGE_ENTER = { 'nav-forward': 'push-in', 'nav-back': 'pop-in', 'nav-tab': 'tab-in', default: 'none' }
export const PAGE_EXIT = { 'nav-forward': 'push-out', 'nav-back': 'pop-out', 'nav-tab': 'tab-out', default: 'none' }

// App pages are a phone column that widens to 720px on desktop (§8.6). `wide` pages (Create,
// Photos, the workspace and the photo page) use the 1120px content column instead, with the
// grids and two-column layouts the v3-b desktop comps draw (§6.9 item 7). The page fills the
// height below the bars, so a page sliding in covers the one it replaces.
export function AppPage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <ViewTransition enter={PAGE_ENTER} exit={PAGE_EXIT} default="none">
      <div className={cn('w-full flex-1 pb-6', wide ? 'content-column' : 'mx-auto max-w-[720px]')}>{children}</div>
    </ViewTransition>
  )
}
