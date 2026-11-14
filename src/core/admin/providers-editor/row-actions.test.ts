import { describe, expect, it } from 'vitest'

import type { AdminProvider } from '../providers/types'

import { PROVIDERS_COPY } from './copy'
import { deleteControl } from './row-actions'

const provider = (isActive: boolean): AdminProvider => ({
  id: '6f1c2f9e-6a52-4c39-9a51-0a9f6b0c1d2e',
  module: 'image',
  adapter: 'openai_images',
  resolutions: ['1k', '2k', '4k'],
  label: '验收 OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-2.6-sunburst',
  apiKeyLast4: 'abcd',
  isActive,
  notes: null,
  prices: { inputTextPerM: null, inputImagePerM: null, outputPerM: null },
  updatedAt: '2026-11-06T00:00:00Z',
})

describe('Delete button state (§3.3)', () => {
  it('is disabled with a hint on the row in use, even while nothing is pending', () => {
    expect(deleteControl(provider(true), false)).toEqual({ disabled: true, hint: PROVIDERS_COPY.deleteActiveHint })
  })

  it('is enabled on an inactive row, and only disabled while another action runs', () => {
    expect(deleteControl(provider(false), false)).toEqual({ disabled: false, hint: null })
    expect(deleteControl(provider(false), true)).toEqual({ disabled: true, hint: null })
  })

  it('names the provider and its model in the confirmation', () => {
    const body = PROVIDERS_COPY.deleteDialog.body('验收 OpenAI', 'gpt-image-2.6-sunburst')
    expect(body).toContain('验收 OpenAI')
    expect(body).toContain('gpt-image-2.6-sunburst')
    expect(PROVIDERS_COPY.errors.provider_active).toBeTruthy()
  })
})
