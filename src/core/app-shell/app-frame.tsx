import type { ReactNode } from 'react'

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
export function AppPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[720px] pb-6">{children}</div>
}
