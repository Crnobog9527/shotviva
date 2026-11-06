'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { PhotoSeconds, SecondsRange } from '@/core/config'
import type { Resolution } from '@/core/templates/output-options'

import { secondsFor } from './develop-seconds'

// How long a photo usually takes, per quality, from site.config (handed in by the app layout:
// modules never read the site config). The workspace and Photos quote the photo's own quality.
const DevelopSecondsContext = createContext<PhotoSeconds | null>(null)

export function DevelopSecondsProvider({ seconds, children }: { seconds: PhotoSeconds; children: ReactNode }) {
  return <DevelopSecondsContext.Provider value={seconds}>{children}</DevelopSecondsContext.Provider>
}

export function useDevelopSeconds(resolutions: readonly Resolution[]): SecondsRange {
  const table = useContext(DevelopSecondsContext)
  if (!table) throw new Error('useDevelopSeconds needs a DevelopSecondsProvider')
  return secondsFor(table, resolutions)
}
