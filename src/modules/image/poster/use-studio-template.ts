'use client'

import { useLocale } from 'next-intl'
import { useEffect, useState } from 'react'

import type { StudioTemplate } from './use-poster-studio'

export type StudioLoad = { id: string; template: StudioTemplate } | { id: string; failed: true } | null

// The editor's view of the asked poster template (GET /api/poster/templates/<id>), read when
// its dialog is asked for. A failed read (a template gone, a gated account) answers `failed`,
// so Create drops the request instead of waiting on it.
export function useStudioTemplate(id: string | null): StudioLoad {
  const locale = useLocale()
  const [load, setLoad] = useState<StudioLoad>(null)
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    fetch(`/api/poster/templates/${encodeURIComponent(id)}?locale=${locale}`, { signal: controller.signal })
      .then(async (response) => (response.ok ? setLoad({ id, template: (await response.json()) as StudioTemplate }) : setLoad({ id, failed: true })))
      .catch(() => { if (!controller.signal.aborted) setLoad({ id, failed: true }) })
    return () => controller.abort()
  }, [id, locale])
  return load
}

// The template ready for `id`, or whether reading it failed; an answer for another id is neither.
export function studioFor(load: StudioLoad, id: string | null): { ready: StudioTemplate | null; failed: boolean } {
  if (!id || !load || load.id !== id) return { ready: null, failed: false }
  return 'template' in load ? { ready: load.template, failed: false } : { ready: null, failed: true }
}
