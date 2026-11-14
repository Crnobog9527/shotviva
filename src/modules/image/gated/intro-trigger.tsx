'use client'

import dynamic from 'next/dynamic'
import { useState, type ReactNode } from 'react'

import type { MembershipTier } from '@/core/config'

import type { GatedFeature, PaidTier } from './feature-access'

// The guide (its demos, images and copy) is its own chunk, fetched when a trigger is first
// pressed or touched, never in a page's first load (scripts/js-budget.json).
const load = () => import('./feature-intro').then((m) => m.FeatureGuide)
const FeatureGuide = dynamic(load, { ssr: false })

type Props = {
  // The demo the guide opens on.
  tab: GatedFeature
  tier: MembershipTier | null
  // Set when a locked control opens it: the guide is that feature's intro and its button opens
  // the paywall on this plan (Owner 2026-11-12, intro first, never the paywall straight away).
  // Unset, it is the tutorial anyone can open at any time.
  upgrade?: PaidTier
  className?: string
  label?: string
  onOpen?: () => void
  children: ReactNode
}

export function IntroTrigger({ tab, tier, upgrade, className, label, onOpen, children }: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const show = () => {
    setMounted(true)
    setOpen(true)
    onOpen?.()
  }
  return (
    <>
      <button type="button" aria-label={label} onClick={show} onPointerEnter={() => void load()} onFocus={() => void load()} className={className}>
        {children}
      </button>
      {/* Once loaded it stays mounted, so closing can play its motion. */}
      {mounted ? <FeatureGuide tab={tab} tier={tier} upgrade={upgrade} open={open} onOpenChange={setOpen} /> : null}
    </>
  )
}
