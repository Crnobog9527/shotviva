'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import type { ActionResult } from '@/core/admin/templates/types'

// One write of the page: run it, show its error, reload the list when it went through.
export function useDishwareWrite() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const run = (work: () => Promise<ActionResult>) => {
    setError(null)
    setDone(false)
    start(async () => {
      const result = await work().catch(() => ({ ok: false as const, message: '网络出错，请重试' }))
      if (!result.ok) return setError(result.message)
      setDone(true)
      router.refresh()
    })
  }
  return { pending, error, done, run }
}
