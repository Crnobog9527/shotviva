'use client'

import { usePathname } from 'next/navigation'

// Not the rules index: it also exports the zod schemas, which the banner must not ship.
import { BANNER_ELEMENT_ID, BANNER_KEY_ATTRIBUTE } from '../rules/dismissal'
import { isBannerHiddenPath } from '../rules/rules'
import type { BannerAnnouncement } from '../rules/types'
import { BannerBar } from '../ui'
import { useBanner } from './use-banner'

type Props = { items: BannerAnnouncement[]; initialId: string | null; dismissLabel: string }

// The live banner (ARCHITECTURE §10): no popup, no countdown, no click tracking. The version key
// is what the early script's hiding <style> matches; one that cannot be closed carries none and
// has no ✕.
export function BannerView({ items, initialId, dismissLabel }: Props) {
  const pathname = usePathname()
  const { current, dismiss } = useBanner(items, initialId)
  if (!current || isBannerHiddenPath(pathname)) return null
  const key = current.closeKey
  return (
    <BannerBar
      id={BANNER_ELEMENT_ID}
      data-announcement={current.id}
      {...(key ? { [BANNER_KEY_ATTRIBUTE]: key } : {})}
      data-ends-at={current.endsAt ?? undefined}
      role="region"
      aria-label={current.message}
      // The inline script may set `hidden` before hydration (already ended).
      suppressHydrationWarning
      message={current.message}
      link={current.link}
      tone={current.tone}
      dismissLabel={dismissLabel}
      onDismiss={key ? () => dismiss(key, current.reshowAfterDays) : undefined}
    />
  )
}
