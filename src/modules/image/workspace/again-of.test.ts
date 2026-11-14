import { describe, expect, it } from 'vitest'

import type { AgainStart } from '../again/again-start'
import type { StartInput } from '../generation/job-store'
import { withAgainOf } from './use-workspace-draft'

const input = { body: { template_id: 'pet-studio', input_key: null, inputs: { copy: {}, aspect_ratio: '1:1', resolution: '1k' } } } as unknown as StartInput
const again = (from?: 'gallery') => ({ jobId: '11111111-1111-4111-8111-111111111111', ...(from ? { from } : {}) }) as unknown as AgainStart

describe('Make again records its source (ARCHITECTURE §16.2c)', () => {
  it('adds the source work to every job of a Make again', () => {
    expect(withAgainOf([input, input], again()).map((i) => (i.body as { again_of?: string }).again_of)).toEqual([again().jobId, again().jobId])
  })

  it('leaves a fresh form and 一键复用 from the gallery alone', () => {
    expect(withAgainOf([input], null)[0]!.body).not.toHaveProperty('again_of')
    expect(withAgainOf([input], again('gallery'))[0]!.body).not.toHaveProperty('again_of')
  })
})
