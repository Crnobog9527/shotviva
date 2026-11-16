'use client'

import { useCallback, useRef, useState } from 'react'

import type { Locale } from '@/core/i18n'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { HomeCatalogue, HomeCatalogueSource } from './home-catalogue'

async function fetchCatalogue(locale: Locale): Promise<HomeCatalogue> {
  const response = await fetch(`/api/home/templates?locale=${locale}`, { credentials: 'omit' })
  if (!response.ok) throw new Error('Home catalogue unavailable')
  return response.json() as Promise<HomeCatalogue>
}

export function useHomeCatalogue(templates: readonly CatalogueTemplate[], source: HomeCatalogueSource) {
  const locale = 'locale' in source ? source.locale : null
  const browse = 'browse' in source ? source.browse : null
  const [data, setData] = useState<HomeCatalogue | null>(null)
  const [failed, setFailed] = useState(false)
  const request = useRef<Promise<HomeCatalogue> | null>(null)
  const load = useCallback(() => {
    if (!locale) return Promise.resolve({ templates, browse })
    request.current ??= fetchCatalogue(locale).then((catalogue) => {
      setData(catalogue)
      return catalogue
    }).catch((error: unknown) => {
      request.current = null
      setFailed(true)
      throw error
    })
    return request.current
  }, [browse, locale, templates])
  const open = useCallback(() => {
    setFailed(false)
    void load().catch(() => undefined)
  }, [load])
  const find = useCallback(async (id: string) => {
    const initial = templates.find((template) => template.id === id)
    return initial ?? (await load()).templates.find((template) => template.id === id) ?? null
  }, [load, templates])
  return { data: locale ? data : { templates, browse }, failed, open, find }
}
