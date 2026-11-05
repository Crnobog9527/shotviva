import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'

import { redact, redactString } from '../logger'

// ARCHITECTURE §16.3: strip emails, tokens and prompts before anything leaves for Sentry.
// The logger's rules cover emails and tokens by pattern; prompts and user copy have no
// pattern, so fields that could hold them are dropped by key name.
const CONTENT_KEY = /prompt|copy|note|e-?mail|body|cookie|^data$/i

function scrubFields(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object' || depth > 5) return redact(value)
  if (Array.isArray(value)) return value.map((item) => scrubFields(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, CONTENT_KEY.test(key) ? '[redacted]' : scrubFields(item, depth + 1)]),
  )
}

const scrubRecord = <T>(value: T): T => (value === undefined ? value : (scrubFields(value) as T))

// Query strings carry auth codes and reset tokens (/auth/callback?code=…); keep the path only.
function pathOnly(url: string | undefined): string | undefined {
  if (!url) return url
  try {
    const parsed = new URL(url, 'http://localhost')
    return url.startsWith('/') ? parsed.pathname : `${parsed.origin}${parsed.pathname}`
  } catch {
    return '[redacted]'
  }
}

// fetch/http/navigation breadcrumbs: presigned R2 URLs carry X-Amz-Signature in the query.
const URL_KEY = /^(url|to|from)$/

function scrubBreadcrumbData(data: Breadcrumb['data']): Breadcrumb['data'] {
  if (!data) return data
  const urls = Object.fromEntries(
    Object.entries(data).flatMap(([key, value]) => (URL_KEY.test(key) && typeof value === 'string' ? [[key, pathOnly(value)]] : [])),
  )
  return { ...scrubRecord(data), ...urls }
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  return {
    ...crumb,
    message: crumb.message === undefined ? undefined : redactString(crumb.message),
    data: scrubBreadcrumbData(crumb.data),
  }
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  return {
    ...event,
    message: event.message === undefined ? undefined : redactString(event.message),
    // Supabase user id only; never email, IP or username.
    user: event.user?.id === undefined ? undefined : { id: event.user.id },
    request: event.request && { method: event.request.method, url: pathOnly(event.request.url) },
    exception: event.exception && {
      ...event.exception,
      values: event.exception.values?.map((item) => ({
        ...item,
        value: item.value === undefined ? undefined : redactString(item.value),
      })),
    },
    extra: scrubRecord(event.extra),
    contexts: scrubRecord(event.contexts),
    tags: scrubRecord(event.tags),
    breadcrumbs: event.breadcrumbs?.map(scrubBreadcrumb),
  }
}
