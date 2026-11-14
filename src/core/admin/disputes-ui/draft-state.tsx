'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// Unsaved edits on the dispute page (T82, critique): the summary typed but not saved, a file
// picked but not uploaded. The submit dialog reads this so the Owner never sends the old draft
// by accident.
type Dirty = { summary: boolean; file: boolean }

type DraftState = { dirty: Dirty; mark: (key: keyof Dirty, value: boolean) => void }

const Context = createContext<DraftState>({ dirty: { summary: false, file: false }, mark: () => {} })

export function DraftStateProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState<Dirty>({ summary: false, file: false })
  const mark = useCallback((key: keyof Dirty, value: boolean) => setDirty((d) => (d[key] === value ? d : { ...d, [key]: value })), [])
  const value = useMemo(() => ({ dirty, mark }), [dirty, mark])
  return <Context value={value}>{children}</Context>
}

export const useDraftState = () => useContext(Context)
