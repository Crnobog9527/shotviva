'use client'

import { useEffect, type ReactNode } from 'react'

import { trackGallery } from '../../analytics/browser/gallery'
import type { EventProps } from '../../analytics/events'
import { Link } from '../../i18n/ui'

// The gallery's browser events (ARCHITECTURE §16.2, T108): once per page view, and on 「一键复用」.
// They load only on gallery pages; trackGallery drops them off the live site and for staff.
export function GalleryViewEvent(
  props: { event: 'gallery_view'; props: EventProps<'gallery_view'> } | { event: 'gallery_work_view'; props: EventProps<'gallery_work_view'> },
) {
  const key = JSON.stringify(props)
  useEffect(() => {
    if (props.event === 'gallery_view') trackGallery('gallery_view', props.props)
    else trackGallery('gallery_work_view', props.props)
    // One event per distinct view; the props are plain values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

type ReuseProps = { href: string; className?: string; children: ReactNode; event: EventProps<'gallery_reuse'> }

export function ReuseLink({ href, className, children, event }: ReuseProps) {
  return (
    <Link href={href} prefetch={false} className={className} onClick={() => trackGallery('gallery_reuse', event)}>
      {children}
    </Link>
  )
}
