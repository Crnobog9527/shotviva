'use client'

import { useLocale } from 'next-intl'
import { useEffect, useState } from 'react'

import { offeredTemplate, useFoodTogglesEnabled } from '@/core/templates/offered-toggles'

import type { CatalogueForms } from './catalogue-payload'
import type { CatalogueTemplate } from './catalogue-template'

const MAX_IDS = 30

async function fetchForms(locale: string, ids: string[], signal: AbortSignal): Promise<CatalogueForms> {
  const requests = []
  for (let start = 0; start < ids.length; start += MAX_IDS) {
    const query = new URLSearchParams({ locale })
    for (const id of ids.slice(start, start + MAX_IDS)) query.append('id', id)
    requests.push(fetch(`/api/catalogue/forms?${query}`, { signal }).then(async (response) => {
      if (!response.ok) throw new Error('Cannot load template forms')
      return await response.json() as CatalogueForms
    }))
  }
  const forms = Object.fromEntries((await Promise.all(requests)).flatMap((group) => Object.entries(group)))
  if (!ids.every((id) => Object.hasOwn(forms, id))) throw new Error('A selected template is no longer available')
  return forms
}

export function useCatalogueForms(templates: readonly CatalogueTemplate[]) {
  const locale = useLocale()
  const foodEnabled = useFoodTogglesEnabled()
  const [loaded, setLoaded] = useState<{ locale: string; forms: CatalogueForms }>()
  const [failure, setFailure] = useState('')
  const [attempt, setAttempt] = useState(0)
  const forms = loaded?.locale === locale ? loaded.forms : undefined
  const missing = templates.filter((template) => template.formDeferred && !Object.hasOwn(forms ?? {}, template.id))
  const key = JSON.stringify([...new Set(missing.map(({ id }) => id))].sort())
  const failed = failure === `${locale}:${key}:${attempt}`

  useEffect(() => {
    if (key === '[]') return
    const controller = new AbortController()
    void fetchForms(locale, JSON.parse(key) as string[], controller.signal).then((fresh) => {
      if (!controller.signal.aborted) setLoaded((current) => ({
        locale, forms: { ...(current?.locale === locale ? current.forms : {}), ...fresh },
      }))
    }).catch(() => {
      if (!controller.signal.aborted) setFailure(`${locale}:${key}:${attempt}`)
    })
    return () => controller.abort()
  }, [attempt, key, locale])

  return {
    ready: missing.length === 0,
    failed,
    retry: () => setAttempt((current) => current + 1),
    // The template with its form, as offered now: no dish name while the food switch is off.
    fill: (template: CatalogueTemplate): CatalogueTemplate =>
      offeredTemplate(forms && Object.hasOwn(forms, template.id)
        ? { ...template, ...forms[template.id], formDeferred: undefined, hasDeferredSlots: undefined, hasDeferredGroups: undefined }
        : template, foodEnabled),
  }
}
