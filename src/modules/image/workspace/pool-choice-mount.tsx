'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

import type { PoolChoiceSlot } from './pool-choice-picker'

// The org-credits picker loads only for a member holding both kinds, keeping it out of every
// other visitor's first-load JS (scripts/js-budget.json).
const Lazy = dynamic(() => import('./pool-choice-picker').then((m) => m.PoolChoiceSlot), { ssr: false })

export function PoolChoiceMount({ choice }: ComponentProps<typeof PoolChoiceSlot>) {
  return choice ? <Lazy choice={choice} /> : null
}
