'use client'

import { createContext, useContext, type ReactNode } from 'react'

// Public pages (marketing, sign-in) turn off Link prefetching: a link loads its page on the click
// only. From mainland China the site's one connection moves a few KB/s, and the prefetches a
// page started on its own (/zh: six route payloads of 10–26 s each, /zh/login: four of ~9 s,
// 2026-11-12) took that bandwidth from the page's own scripts, fonts and images. The app keeps
// Next's default, where prefetching makes tab switches instant.
const PrefetchOff = createContext(false)

export function NoLinkPrefetch({ children }: { children: ReactNode }) {
  return <PrefetchOff value>{children}</PrefetchOff>
}

export function useLinkPrefetchOff(): boolean {
  return useContext(PrefetchOff)
}
