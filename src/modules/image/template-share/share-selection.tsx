'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { itemKey, TEMPLATE_SHARE_MAX_ITEMS, type TemplateShareItem } from '@/core/template-shares/rules'

// Create's "Share templates" mode (ARCHITECTURE §5.1g, Owner 2026-11-22): while it is on, a tap on
// a template or series card picks it (or unpicks it) instead of opening it; the picks keep the
// order they were tapped in, which is the order the client sees.
export type ShareSelection = {
  selecting: boolean
  items: readonly TemplateShareItem[]
  start(): void
  stop(): void
  toggle(item: TemplateShareItem): void
  has(item: TemplateShareItem): boolean
}

const SelectionContext = createContext<ShareSelection | null>(null)

export function useShareSelectionState(): ShareSelection {
  const [selecting, setSelecting] = useState(false)
  const [items, setItems] = useState<readonly TemplateShareItem[]>([])
  const start = useCallback(() => setSelecting(true), [])
  const stop = useCallback(() => {
    setSelecting(false)
    setItems([])
  }, [])
  const toggle = useCallback((item: TemplateShareItem) => setItems((current) => toggled(current, item)), [])
  return useMemo(() => {
    const keys = new Set(items.map(itemKey))
    return { selecting, items, start, stop, toggle, has: (item) => keys.has(itemKey(item)) }
  }, [selecting, items, start, stop, toggle])
}

// Picked again: removed. Past the cap: left as it is (the bar says the cap).
export function toggled(items: readonly TemplateShareItem[], item: TemplateShareItem): readonly TemplateShareItem[] {
  const key = itemKey(item)
  if (items.some((one) => itemKey(one) === key)) return items.filter((one) => itemKey(one) !== key)
  return items.length >= TEMPLATE_SHARE_MAX_ITEMS ? items : [...items, item]
}

export function ShareSelectionProvider({ value, children }: { value: ShareSelection; children: ReactNode }) {
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

// null outside Create (the home page's catalogue has no share mode).
export const useShareSelection = () => useContext(SelectionContext)
