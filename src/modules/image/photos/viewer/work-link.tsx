'use client'

import { useLocale } from 'next-intl'
import { useRef, type ComponentProps, type MouseEvent } from 'react'

import { Link } from '@/core/i18n/ui'

import { useViewer, type ViewerMode } from './viewer-context'
import { prefetchWorkView } from './use-work-view'
import { workPath } from './viewer-path'

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { workId: string; mode?: ViewerMode; href?: ComponentProps<typeof Link>['href'] }

// A link to one work that, inside Photos, opens the viewer over the grid at once instead of
// loading a page (the href stays real for a new tab, a copied link and no-JS). Its view starts
// loading on intent (a pointer resting on it for a moment, a press, focus), so it is usually
// there by the click; a pointer only passing over the grid reads nothing. Outside Photos it is
// the plain link.
const HOVER_INTENT_MS = 120

export function WorkLink({ workId, mode = 'detail', href, onClick, ...props }: Props) {
  const viewer = useViewer()
  const locale = useLocale()
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (!viewer || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    viewer.open(workId, mode)
  }
  const hover = useRef<number | undefined>(undefined)
  const warm = () => prefetchWorkView(workId, locale)
  const rest = () => {
    hover.current = window.setTimeout(warm, HOVER_INTENT_MS)
  }
  const pass = () => window.clearTimeout(hover.current)
  return <Link href={href ?? workPath(workId)} prefetch={false} onClick={open} onPointerEnter={rest} onPointerLeave={pass} onPointerDown={warm} onFocus={warm} {...props} />
}
