'use client'

import { createContext, useContext, useEffect } from 'react'

import { usePaywall } from '@/core/billing/paywall/provider'

import type { HomeViewer } from './home-cta'

export const HomeViewerContext = createContext<(viewer: HomeViewer | null) => void>(() => {})

function PaywallRelay() {
  const paywall = usePaywall()
  useEffect(() => {
    const open = () => paywall.open('insufficient_credits')
    window.addEventListener('shotviva:home-paywall', open)
    return () => window.removeEventListener('shotviva:home-paywall', open)
  }, [paywall])
  return null
}

export function HomeViewerFeed({ viewer }: { viewer: HomeViewer | null }) {
  const setViewer = useContext(HomeViewerContext)
  useEffect(() => setViewer(viewer), [setViewer, viewer])
  return viewer ? <PaywallRelay /> : null
}
