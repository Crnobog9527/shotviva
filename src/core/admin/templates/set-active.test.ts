import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CreditsFloor } from '@/core/templates/pricing'

import type { PublishCandidate } from './publish-rules'

// core cannot import the image module's table; the same shape with the v1 numbers.
const CREDITS_FLOOR: CreditsFloor = { high: { '1k': 2, '2k': 4, '3k': 6 }, medium: { '1k': 1, '2k': 2, '3k': 3 } }

const repo = vi.hoisted(() => ({ loadPublishCandidates: vi.fn(), setTemplatesActive: vi.fn() }))
const logger = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }))
vi.mock('./repository', () => repo)
vi.mock('@/core/logger', () => ({ logger }))

const { setTemplateActive, setTemplatesActive } = await import('./commands')

const client = {} as SupabaseClient
const ADMIN = 'admin-1'

const row = (id: string, over: Partial<PublishCandidate> = {}): PublishCandidate => ({
  id,
  name: `Name ${id}`,
  description: 'One line.',
  visibleIn: ['web'],
  coverBeforeUrl: 'https://assets.test/b.webp',
  coverAfterUrl: 'https://assets.test/a.webp',
  coverLocales: {},
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  isActive: false,
  hasPrompt: true,
  ...over,
})

beforeEach(() => {
  repo.loadPublishCandidates.mockReset()
  repo.setTemplatesActive.mockReset().mockResolvedValue(undefined)
  logger.info.mockReset()
})

describe('setTemplatesActive (bulk)', () => {
  it('publishes the ready drafts in one write and leaves the blocked one as it is', async () => {
    repo.loadPublishCandidates.mockResolvedValue([row('a'), row('b'), row('c', { coverAfterUrl: null })])
    const outcome = await setTemplatesActive(client, ADMIN, { ids: ['a', 'b', 'c'], active: true }, CREDITS_FLOOR)
    expect(repo.setTemplatesActive).toHaveBeenCalledOnce()
    expect(repo.setTemplatesActive).toHaveBeenCalledWith(client, ['a', 'b'], true)
    expect(outcome.skipped).toEqual([{ id: 'c', name: 'Name c', blockers: ['no_cover'] }])
    expect(logger.info.mock.calls.map(([, data]) => (data as { templateId: string }).templateId)).toEqual(['a', 'b'])
  })

  it('writes nothing when no template can change', async () => {
    repo.loadPublishCandidates.mockResolvedValue([row('a', { isActive: true }), row('b', { hasPrompt: false })])
    const outcome = await setTemplatesActive(client, ADMIN, { ids: ['a', 'b'], active: true }, CREDITS_FLOOR)
    expect(repo.setTemplatesActive).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ changed: [], unchanged: [{ id: 'a' }], skipped: [{ id: 'b', blockers: ['no_prompt'] }] })
  })

  it('needs a reason to unpublish and logs it for every template', async () => {
    await expect(setTemplatesActive(client, ADMIN, { ids: ['a'], active: false }, CREDITS_FLOOR)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    expect(repo.loadPublishCandidates).not.toHaveBeenCalled()
    repo.loadPublishCandidates.mockResolvedValue([row('a', { isActive: true }), row('b', { isActive: true })])
    await setTemplatesActive(client, ADMIN, { ids: ['a', 'b'], active: false, reason: 'season over' }, CREDITS_FLOOR)
    expect(repo.setTemplatesActive).toHaveBeenCalledWith(client, ['a', 'b'], false)
    expect(logger.info).toHaveBeenCalledWith('admin.template.active_changed', {
      adminId: ADMIN,
      templateId: 'b',
      active: false,
      reason: 'season over',
    })
  })

  it('rejects an empty, repeated or oversized batch before touching the database', async () => {
    const bad = [[], ['a', 'a'], Array.from({ length: 201 }, (_, i) => `t-${i}`)]
    for (const ids of bad) {
      await expect(setTemplatesActive(client, ADMIN, { ids, active: true }, CREDITS_FLOOR)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      })
    }
    expect(repo.loadPublishCandidates).not.toHaveBeenCalled()
  })
})

describe('setTemplateActive (the single switch)', () => {
  it('runs the same rules and reports the blocker as an error', async () => {
    repo.loadPublishCandidates.mockResolvedValue([row('a', { description: null })])
    await expect(setTemplateActive(client, ADMIN, { id: 'a', active: true }, CREDITS_FLOOR)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: '「Name a」不能上架：缺英文说明（站内模板必填）',
    })
    expect(repo.setTemplatesActive).not.toHaveBeenCalled()
  })

  it('answers NOT_FOUND for an unknown id and publishes a ready one', async () => {
    repo.loadPublishCandidates.mockResolvedValue([])
    await expect(setTemplateActive(client, ADMIN, { id: 'nope', active: true }, CREDITS_FLOOR)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    repo.loadPublishCandidates.mockResolvedValue([row('a')])
    await setTemplateActive(client, ADMIN, { id: 'a', active: true }, CREDITS_FLOOR)
    expect(repo.setTemplatesActive).toHaveBeenCalledWith(client, ['a'], true)
  })
})
