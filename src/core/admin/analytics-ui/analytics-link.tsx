'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ComponentProps } from 'react'

import { liveAnalyticsHref } from './href'

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: string; preserveDim?: boolean }

// Funnel tabs change the URL without a route render. Other controls must follow the live URL.
export function AnalyticsLink({ href, preserveDim = false, ...props }: Props) {
  const pathname = usePathname()
  const params = useSearchParams()
  return <Link {...props} href={liveAnalyticsHref(href, pathname, preserveDim ? params?.get('dim') ?? null : undefined)} prefetch={false} />
}
