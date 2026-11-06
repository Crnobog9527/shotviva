'use client'

import { createContext, useContext, type ReactNode } from 'react'

// site.locales.zhPaths, handed down once from the root layout: core components cannot import
// site/, and every in-app link needs to know whether its target has a /zh version.
const TranslatedPaths = createContext<readonly string[]>([])

export function TranslatedPathsProvider({ paths, children }: { paths: readonly string[]; children: ReactNode }) {
  return <TranslatedPaths value={paths}>{children}</TranslatedPaths>
}

export function useTranslatedPaths(): readonly string[] {
  return useContext(TranslatedPaths)
}
