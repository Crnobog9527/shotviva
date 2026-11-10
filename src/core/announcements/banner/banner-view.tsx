'use client'

import { usePathname } from 'next/navigation'

// Not the rules index: it also exports the zod schemas, which the banner must not ship.
import { isBannerHiddenPath } from '../rules/rules'
import type { BannerAnnouncement } from '../rules/types'
import { BannerBar } from '../ui'
import { useBanner } from './use-banner'

export const BANNER_ELEMENT_ID = 'sv-announcement'

type Props = { items: BannerAnnouncement[]; initialId: string | null; dismissLabel: string }

// The live banner (ARCHITECTURE §10): no popup, no countdown, no click tracking.
export function BannerView({ items, initialId, dismissLabel }: Props) {
  const pathname = usePathname()
  const { current, dismiss } = useBanner(items, initialId)
  if (!current || isBannerHiddenPath(pathname)) return null
  return (
    <BannerBar
      id={BANNER_ELEMENT_ID}
      data-announcement={current.id}
      data-ends-at={current.endsAt ?? undefined}
      role="region"
      aria-label={current.message}
      // The inline script may set `hidden` before hydration (dismissed id, or already ended).
      suppressHydrationWarning
      message={current.message}
      link={current.link}
      tone={current.tone}
      dismissLabel={dismissLabel}
      onDismiss={() => dismiss(current.id)}
    />
  )
}
