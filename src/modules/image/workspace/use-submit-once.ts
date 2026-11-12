'use client'

import { useEffect, useState } from 'react'

import { createSubmitLatch } from './submit-latch'

// The creation dialogs' guard against a second Generate while the dialog closes
// (submit-latch.ts). Returns `take`: true for the first press of this opening only.
export function useSubmitOnce(open: boolean): () => boolean {
  const [latch] = useState(createSubmitLatch)
  useEffect(() => {
    if (open) latch.reset()
  }, [open, latch])
  return latch.take
}
