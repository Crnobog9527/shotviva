'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useTransition } from 'react'

import { Link, useRouter } from '@/core/i18n/navigation'

// The end of Photos' list while older works remain (2026-11-27). href is /photos?until=<cursor>:
// the server renders the list down to that work plus one page more, so Back and a refresh come
// back to the same list. Scrolling near it loads the next page by itself; the link stays as the
// explicit Load more (and works without JavaScript). replace: paging does not pile up history.
const AHEAD = '800px 0px'

export function LoadMore({ href, shown, total }: { href: string; shown: number; total: number }) {
  const t = useTranslations('app.photos')
  const router = useRouter()
  const [pending, start] = useTransition()
  const sentinel = useRef<HTMLDivElement>(null)
  const asked = useRef<string | null>(null)
  useEffect(() => {
    const node = sentinel.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || asked.current === href) return
        asked.current = href
        start(() => router.replace(href, { scroll: false }))
      },
      { rootMargin: AHEAD },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [href, router])
  return (
    <div ref={sentinel} className="mx-(--gutter) mt-6 flex flex-col items-center gap-2">
      <Link
        href={href}
        replace
        scroll={false}
        prefetch={false}
        aria-disabled={pending || undefined}
        onClick={(event) => {
          event.preventDefault()
          if (pending) return
          asked.current = href
          start(() => router.replace(href, { scroll: false }))
        }}
        className="press inline-flex min-h-11 items-center justify-center rounded-control border border-input px-5 text-body font-medium"
      >
        {pending ? t('loadingMore') : t('loadMore')}
      </Link>
      <span className="text-caption text-muted-foreground" aria-live="polite">
        {t('shown', { shown, total })}
      </span>
    </div>
  )
}
