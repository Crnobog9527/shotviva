'use client'

import { useState, useTransition } from 'react'

import type { FeaturedPlan } from '../templates/bulk-featured-rules'
import type { TemplateAdminActions } from '../templates/types'
import { bulkFeaturedCopy } from './copy'

// Batch 首页精选: which direction the confirm step is open for, and the one server call. A
// refusal from the server (a template unpublished meanwhile) replaces the dialog's own preview.
export function useBulkFeatured(setFeaturedMany: TemplateAdminActions['setFeaturedMany'], onDone: () => void) {
  const [asking, setAsking] = useState<boolean | null>(null)
  const [refused, setRefused] = useState<FeaturedPlan | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const start = (featured: boolean) => {
    setDone(null)
    setError(null)
    setRefused(null)
    setAsking(featured)
  }
  const close = () => {
    setAsking(null)
    setRefused(null)
  }
  const run = (ids: string[], expectedIds: string[]) => {
    const featured = asking
    if (featured === null) return
    startTransition(async () => {
      const result = await setFeaturedMany({ ids, featured, expectedIds })
      if (!result.ok) {
        setAsking(null)
        setError(result.message)
      } else if (result.value.failures.length > 0 || result.value.over > 0) {
        setRefused(result.value)
      } else {
        setAsking(null)
        setDone(bulkFeaturedCopy.done(featured, result.value.changed.length))
        onDone()
      }
    })
  }
  return { asking, refused, done, error, pending, start, close, run }
}

export type BulkFeatured = ReturnType<typeof useBulkFeatured>
