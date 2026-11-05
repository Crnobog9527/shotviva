import type { ReactNode } from 'react'

// 24px stroke icons from the B comps (design/comps-v3-b/create.html tab bar).
export type TabIcon = 'create' | 'wishlist' | 'photos' | 'account'

const PATHS: Record<TabIcon, ReactNode> = {
  create: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  wishlist: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />,
  photos: (
    <>
      <rect x="3.5" y="5.5" width="14" height="14" rx="3" />
      <path d="M7 3.5h10.5a3 3 0 0 1 3 3V17" />
      <path d="M3.5 16l4-4 4 4 2-2 4 4" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3" />
    </>
  ),
}

export function TabGlyph({ icon, className }: { icon: TabIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[icon]}
    </svg>
  )
}
