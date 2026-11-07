'use client'

import { Link } from '../i18n/ui'
import { useEffect, useState, type ReactNode } from 'react'

import { cn } from '../ui/cn'

type Props = {
  back: { href: string; label: string }
  title: string
  aside?: ReactNode
  // The photo page keeps the top tab bar from md up (T38), so its nav sticks below it.
  underTabBar?: boolean
  // Pages with no large title of their own (wishlist flow pages) show the title from the start,
  // as the page's h1, instead of fading it in on scroll.
  pinnedTitle?: boolean
}

// Flow pages (workspace, result) replace the tab bar with a sticky nav row: a back link with a
// safelight chevron, the page title fading in after 60px of scroll, one item on the right.
// From md up the row is 60px and lines up with the content column (B comp workspace.html).
export function FlowNav({ back, title, aside, underTabBar = false, pinnedTitle = false }: Props) {
  const scrolled = useScrolledPast(60)
  return (
    <header
      // Stays put while the page under it slides (T56; globals.css).
      style={{ viewTransitionName: 'app-flow-nav' }}
      className={cn(
        'nav-material sticky top-0 z-50 px-1 pt-[var(--sat)] md:px-[calc(var(--gutter)-12px)]',
        underTabBar && 'md:top-14',
        scrolled && 'shadow-[inset_0_-1px_0_var(--border)]',
      )}
    >
      <div className="grid h-13 grid-cols-[1fr_auto_1fr] items-center md:h-15">
        <Link href={back.href} className="press inline-flex min-h-11 items-center gap-1 justify-self-start pr-3 pl-1 text-body font-medium">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 text-primary" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {back.label}
        </Link>
        {pinnedTitle ? (
          <h1 className="truncate text-label font-semibold">{title}</h1>
        ) : (
          <span aria-hidden="true" className={cn('truncate text-label font-semibold transition-opacity', scrolled ? 'opacity-100' : 'opacity-0')}>
            {title}
          </span>
        )}
        <div className="mr-2 flex items-center gap-2 justify-self-end">{aside}</div>
      </div>
    </header>
  )
}

function useScrolledPast(px: number): boolean {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > px)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [px])
  return past
}
