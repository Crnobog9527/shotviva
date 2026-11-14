'use client'

import type { ComponentProps } from 'react'

import { usePathname } from '../navigation'
import { Link } from './localized-link'

type Props = ComponentProps<typeof Link> & { href: string }

// A top-nav link that marks itself aria-current="page" on its own page (pricing.html: the
// current item reads in bone, marketing.css .mk-nl[aria-current]). usePathname() has no locale
// prefix, so /zh/pricing matches "/pricing". Anchor links (/#templates) never match.
export function NavLink({ href, ...rest }: Props) {
  const path = usePathname()
  return <Link href={href} aria-current={path === href ? 'page' : undefined} {...rest} />
}
