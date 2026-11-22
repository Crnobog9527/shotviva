'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { SHARE_MAX } from './share-types'

type ShareSelect = {
  selecting: boolean
  // In the order they were picked: the link shows them in this order.
  selected: readonly string[]
  isSelected(id: string): boolean
  toggle(id: string): void
  start(): void
  stop(): void
  full: boolean
}

const Context = createContext<ShareSelect | null>(null)

// Photos' select mode for 作品集分享 (ARCHITECTURE §6.2): off until the Share button turns it on;
// then a tap on a tile picks it instead of opening the viewer. Outside the provider (any other
// page that renders a tile) there is no select mode.
export function ShareSelectProvider({ children }: { children: ReactNode }) {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<readonly string[]>([])
  const toggle = useCallback((id: string) => {
    setSelected((now) => (now.includes(id) ? now.filter((x) => x !== id) : now.length >= SHARE_MAX ? now : [...now, id]))
  }, [])
  const stop = useCallback(() => {
    setSelecting(false)
    setSelected([])
  }, [])
  const value = useMemo<ShareSelect>(
    () => ({ selecting, selected, isSelected: (id) => selected.includes(id), toggle, start: () => setSelecting(true), stop, full: selected.length >= SHARE_MAX }),
    [selecting, selected, toggle, stop],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export const useShareSelect = () => useContext(Context)
