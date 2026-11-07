import { describe, expect, it } from 'vitest'

import type { CreditsFloor } from '@/core/templates/pricing'

import { describeBlockers, planActiveChange, publishBlockers, type PublishCandidate } from './publish-rules'

// core cannot import the image module's table; the same shape with the v1 numbers.
const CREDITS_FLOOR: CreditsFloor = { high: { '1k': 2, '2k': 4, '3k': 6 }, medium: { '1k': 1, '2k': 2, '3k': 3 } }

const ready = (id: string, over: Partial<PublishCandidate> = {}): PublishCandidate => ({
  id,
  name: `Name ${id}`,
  description: 'One line.',
  visibleIn: ['web', 'partner'],
  coverBeforeUrl: `https://assets.test/covers/${id}/before.webp`,
  coverAfterUrl: `https://assets.test/covers/${id}/after.webp`,
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  isActive: false,
  hasPrompt: true,
  ...over,
})

describe('publishBlockers', () => {
  it('lets a complete web template go live', () => {
    expect(publishBlockers(ready('a'), CREDITS_FLOOR)).toEqual([])
  })

  it('names every missing piece of a web template', () => {
    const draft = ready('a', {
      hasPrompt: false,
      name: '  ',
      description: null,
      coverAfterUrl: null,
      creditsCost: { '1k': 1, '2k': 4, '3k': 6 },
    })
    expect(publishBlockers(draft, CREDITS_FLOOR)).toEqual(['no_prompt', 'no_name', 'no_description', 'no_cover', 'below_floor'])
  })

  it('does not ask a partner-only template such as freeform for a card description or covers', () => {
    const freeform = ready('freeform', { visibleIn: ['partner'], description: null, coverBeforeUrl: null, coverAfterUrl: null })
    expect(publishBlockers(freeform, CREDITS_FLOOR)).toEqual([])
    expect(publishBlockers({ ...freeform, hasPrompt: false }, CREDITS_FLOOR)).toEqual(['no_prompt'])
  })

  it('keeps the built-in edit template out of this switch', () => {
    expect(publishBlockers(ready('edit'), CREDITS_FLOOR)).toEqual(['system'])
  })
})

describe('planActiveChange', () => {
  it('publishes the ready ones and reports the rest one by one, in the asked order', () => {
    const rows = [ready('a'), ready('b', { coverBeforeUrl: null }), ready('c', { isActive: true })]
    const outcome = planActiveChange(['b', 'missing', 'a', 'c'], rows, true, CREDITS_FLOOR)
    expect(outcome).toEqual({
      active: true,
      changed: [{ id: 'a', name: 'Name a' }],
      unchanged: [{ id: 'c', name: 'Name c' }],
      skipped: [
        { id: 'b', name: 'Name b', blockers: ['no_cover'] },
        { id: 'missing', name: 'missing', blockers: ['not_found'] },
      ],
    })
  })

  it('unpublishes without the readiness rules, but never a system template', () => {
    const rows = [ready('a', { isActive: true, coverAfterUrl: null }), ready('b'), ready('edit', { isActive: true })]
    const outcome = planActiveChange(['a', 'b', 'edit'], rows, false, CREDITS_FLOOR)
    expect(outcome.changed.map((item) => item.id)).toEqual(['a'])
    expect(outcome.unchanged.map((item) => item.id)).toEqual(['b'])
    expect(outcome.skipped).toEqual([{ id: 'edit', name: 'Name edit', blockers: ['system'] }])
  })
})

it('describes blockers in the admin language', () => {
  expect(describeBlockers(['no_cover', 'below_floor'])).toBe('缺前后对比封面（站内模板必填）、积分低于下限')
})
