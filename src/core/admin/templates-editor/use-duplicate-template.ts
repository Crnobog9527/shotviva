'use client'

import { useRef } from 'react'
import type { TemplateAdminActions } from '../templates/types'
import type { useTemplateActions } from './use-template-actions'
import { versionCopy } from './version-copy'

// A network timeout may arrive after commit. Retain the request id until the server
// acknowledges the draft, so clicking Retry reopens the very same copy.
export function useDuplicateTemplate(action: TemplateAdminActions['duplicate'], run: ReturnType<typeof useTemplateActions>['run'], open: (id: string) => void) {
  const attempts = useRef(new Map<string, string>())
  const busy = useRef(false)
  return (source: string) => {
    if (busy.current) return
    busy.current = true
    const requestId = attempts.current.get(source) ?? crypto.randomUUID()
    attempts.current.set(source, requestId)
    void run(async () => {
      const response = await action({ source, requestId })
      if (response.ok) {
        attempts.current.delete(source)
        open(response.value)
      }
      return response
    }, versionCopy.created).finally(() => { busy.current = false })
  }
}
