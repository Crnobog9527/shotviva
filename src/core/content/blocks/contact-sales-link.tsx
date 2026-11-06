'use client'

import type { ReactNode } from 'react'

import { trackContactSales } from '../../analytics/browser'
import type { EventProps } from '../../analytics/events'

type Props = { href: string; page: EventProps<'contact_sales_click'>['page']; className?: string; children: ReactNode }

// A plain mailto link that also sends contact_sales_click (ARCHITECTURE §16.2) on the way out.
export function ContactSalesLink({ href, page, className, children }: Props) {
  return (
    <a href={href} className={className} onClick={() => trackContactSales(page)}>
      {children}
    </a>
  )
}
