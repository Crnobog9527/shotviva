import type { ReactNode } from 'react'

import { cn } from '../ui/cn'

// Outer frame of the (app) group: leaves room under the content for the fixed phone tab bar
// whenever one is rendered (tab roots only), nothing on flow pages or from md up.
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col has-[>nav[data-tabbar]]:pb-[calc(var(--sab)+64px)] md:has-[>nav[data-tabbar]]:pb-0">
      {children}
    </div>
  )
}

// App pages are a phone column; on desktop the column widens to 720px and centres (§8.6).
// `wide` lets a two-column page (the photo page from lg) use the full content width.
export function AppPage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn('mx-auto w-full max-w-[720px] pb-6', wide && 'lg:max-w-[1200px]')}>{children}</div>
}
