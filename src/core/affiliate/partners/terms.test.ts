import { beforeEach, expect, it, vi } from 'vitest'

const deps = vi.hoisted(() => ({ messages: vi.fn() }))
vi.mock('next-intl/server', () => ({ getMessages: deps.messages }))
import { publishedTerms } from './terms'

beforeEach(() => {
  deps.messages.mockResolvedValue({ affiliateAgreement: { version: 'v2', body: 'new', earlier: { v1: 'old', v0: ' ' } } })
})

it('serves the version operations use: the latest or an earlier one still in force', async () => {
  expect(await publishedTerms('v2')).toBe('new')
  expect(await publishedTerms('v1')).toBe('old')
  expect(await publishedTerms('v0')).toBeNull()
  expect(await publishedTerms('v3')).toBeNull()
})

it('still reads messages without earlier versions', async () => {
  deps.messages.mockResolvedValue({ affiliateAgreement: { version: 'v1', body: 'only' } })
  expect(await publishedTerms('v1')).toBe('only')
  expect(await publishedTerms('v0')).toBeNull()
})
