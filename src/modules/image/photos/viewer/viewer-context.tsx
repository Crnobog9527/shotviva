'use client'

import { useLocale } from 'next-intl'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

import { getPathname } from '@/core/i18n/navigation'

import type { AgainContext } from '../../again/again-context'
import type { DeleteWorkAction } from '../../result/delete-work'
import type { PhotoItem } from '../photo-item'
import { workPath } from './viewer-path'

export type ViewerMode = 'detail' | 'edit' | 'again'

// The server actions the Photos layout hands in (modules never import app/).
export type ViewerActions = {
  deleteWork(jobId: string): ReturnType<DeleteWorkAction>
  prepareAgain(jobId: string): Promise<AgainContext | null>
}

export type Viewer = {
  id: string | null
  mode: ViewerMode
  // The finished works in the order Photos shows them, as the grid registered them.
  items: readonly PhotoItem[]
  setItems(items: readonly PhotoItem[]): void
  open(id: string, mode?: ViewerMode): void
  // Another work in the same viewer (arrows, swipe, an edit's new photo): the address is
  // replaced, so Back still closes the viewer instead of stepping through every work seen.
  show(id: string): void
  setMode(mode: ViewerMode): void
  close(): void
  // The address changed under the viewer (Back, Forward, a link to /photos/<id>).
  follow(id: string | null, mode?: ViewerMode): void
  actions: ViewerActions
}

const ViewerContext = createContext<Viewer | null>(null)

// null outside Photos: a WorkLink there is a plain link.
export const useViewer = () => useContext(ViewerContext)

type State = { id: string | null; mode: ViewerMode }

// Photos' work viewer state (Owner 2026-11-12: a work opens over the grid, not as its own page).
// It lives in the Photos layout, so a refresh of the page under it (a generation settling, a
// delete) never resets an open viewer or a half-typed edit. Opening from the grid pushes the
// work's address with the History API, which the Next router follows without a server round
// trip (docs: linking-and-navigating, Native History API); closing goes Back over that entry.
export function ViewerProvider({ actions, children }: { actions: ViewerActions; children: ReactNode }) {
  const locale = useLocale()
  const [state, setState] = useState<State>({ id: null, mode: 'detail' })
  const [items, setItems] = useState<readonly PhotoItem[]>([])
  // Whether the open work's address is an entry this viewer pushed (then closing is Back).
  const pushed = useRef(false)
  const href = (id: string | null) => getPathname({ href: workPath(id), locale })
  // Stable, so the address sync runs on a change of path only.
  const follow = useCallback((id: string | null, mode: ViewerMode = 'detail') => {
    if (id === null) pushed.current = false
    setState((current) => (current.id === id ? current : { id, mode }))
  }, [])

  const viewer = useMemo<Viewer>(() => {
    const go = (id: string | null, push: boolean) => window.history[push ? 'pushState' : 'replaceState'](null, '', href(id))
    return {
      ...state,
      items,
      setItems,
      actions,
      open(id, mode = 'detail') {
        const push = state.id === null && !pushed.current
        setState({ id, mode })
        go(id, push)
        if (push) pushed.current = true
      },
      show(id) {
        setState({ id, mode: 'detail' })
        go(id, false)
      },
      setMode: (mode) => setState((current) => ({ ...current, mode })),
      close() {
        setState({ id: null, mode: 'detail' })
        if (pushed.current) {
          pushed.current = false
          window.history.back()
        } else go(null, false)
      },
      follow,
    }
    // href only reads the locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, items, actions, locale, follow])
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>
}
