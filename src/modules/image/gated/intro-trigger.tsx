'use client'

import dynamic from 'next/dynamic'
import { useState, type ReactNode } from 'react'

import type { MembershipTier } from '@/core/config'

import type { GatedFeature } from './feature-access'

// The intro (its demo, images and copy) is its own chunk, fetched when a card is first pressed
// or touched, never in the Create page's first load (scripts/js-budget.json).
const load = () => import('./feature-intro').then((m) => m.FeatureIntro)
const FeatureIntro = dynamic(load, { ssr: false })

type Props = {
  feature: GatedFeature
  tier: MembershipTier | null
  className?: string
  children: ReactNode
  // "Pick a template" in a Pro member's batch guide: where the templates are on this page.
  onStart?: () => void
}

// A locked feature (or a Pro batch) opens its intro first, never the paywall straight away
// (Owner 2026-11-12); the intro's own button opens the paywall on the plan it needs.
export function IntroTrigger({ feature, tier, className, children, onStart }: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const show = () => {
    setMounted(true)
    setOpen(true)
  }
  return (
    <>
      <button type="button" onClick={show} onPointerEnter={() => void load()} onFocus={() => void load()} className={className}>
        {children}
      </button>
      {/* Once loaded it stays mounted, so closing can play its motion. */}
      {mounted ? <FeatureIntro feature={feature} tier={tier} open={open} onOpenChange={setOpen} onStart={onStart} /> : null}
    </>
  )
}
