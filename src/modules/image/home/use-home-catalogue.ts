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

export function useHomeCatalogue(templates: readonly CatalogueTemplate[], { locale }: HomeCatalogueSource) {
  const [data, setData] = useState<HomeCatalogue | null>(null)
  const [failed, setFailed] = useState(false)
  const request = useRef<Promise<HomeCatalogue> | null>(null)
  const load = useCallback(() => {
    request.current ??= fetchCatalogue(locale).then((catalogue) => {
      setData(catalogue)
      return catalogue
    }).catch((error: unknown) => {
      request.current = null
      setFailed(true)
      throw error
    })
    return request.current
  }, [locale])
  const open = useCallback(() => {
    setFailed(false)
    void load().catch(() => undefined)
  }, [load])
  const find = useCallback(async (id: string) => {
    // After the picker has loaded, use the same template data for its preview and the panel.
    const candidates = data?.templates ?? templates
    const known = candidates.find((template) => template.id === id)
    if (known || data) return known ?? null
    return (await load()).templates.find((template) => template.id === id) ?? null
  }, [data, load, templates])
  return { data, failed, open, find, load }
}
