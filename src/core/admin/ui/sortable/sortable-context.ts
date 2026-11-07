'use client'

import { createContext, useContext } from 'react'

import type { SortableListState } from './use-sortable-list'

// What each row's useSortableItem needs from the SortableList around it.
export type SortableListContextValue = SortableListState & {
  labelOf: (id: string) => string
  instructionsId: string
  disabledHint?: string
  reducedMotion: boolean
}

export const SortableListContext = createContext<SortableListContextValue | null>(null)

export function useSortableListContext(): SortableListContextValue {
  const value = useContext(SortableListContext)
  if (!value) throw new Error('useSortableItem must be used inside <SortableList>')
  return value
}
