'use client'

import type { ReactNode } from 'react'

import { cn } from '@/core/ui/cn'

import { browserHistory, openUser } from './dialog-history'
import { isPlainClick, withUser } from './dialog-url'

type Props = { userId: string; jobId?: string | null; className?: string; title?: string; children: ReactNode }

// A user named anywhere in the admin (lists, tickets, orders, jobs): a click opens the detail
// dialog over the current page (T77). The href is the users list with the dialog open, so a new
// tab or a copied link lands somewhere sensible.
export function UserLink({ userId, jobId = null, className, title, children }: Props) {
  return (
    <a
      href={withUser('/admin/users', userId, jobId)}
      title={title}
      className={cn('text-primary hover:underline', className)}
      onClick={(event) => {
        if (!isPlainClick(event)) return
        event.preventDefault()
        openUser(browserHistory, userId, jobId)
      }}
    >
      {children}
    </a>
  )
}
