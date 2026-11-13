import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { MONTHLY_VOLUMES, INQUIRY_STATUSES } from '@/core/inquiries/rules'

import { InquiriesView } from './inquiries-view'

it('links an inquiry row to the list with ?inquiry=<id>, not to a detail page', () => {
  const id = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'
  const row = { id, created_at: '2026-11-13T00:00:00Z', company: 'Acme', name: 'Ann', email: 'ann@example.com', monthly_volume: MONTHLY_VOLUMES[0], uses: [], status: INQUIRY_STATUSES[0] }
  const html = renderToStaticMarkup(createElement(InquiriesView, { filter: { status: 'all' }, page: { items: [row], nextCursor: null }, paged: false }))
  expect(html).toMatch(new RegExp(`href="/admin/inquiries\\?(status=all&amp;)?inquiry=${id}"`))
  expect(html).not.toContain(`/admin/inquiries/${id}`)
})
