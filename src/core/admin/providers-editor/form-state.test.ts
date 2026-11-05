import { describe, expect, it } from 'vitest'

import type { AdminProvider } from '../providers/types'

import { canSave, DEFAULT_FORM, formFor, toSaveInput } from './form-state'

const provider: AdminProvider = {
  id: '6f1c2f9e-6a52-4c39-9a51-0a9f6b0c1d2e',
  module: 'image',
  adapter: 'openai_images',
  label: 'OpenAI 官方',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-2.6',
  apiKeyLast4: 'abcd',
  isActive: true,
  notes: null,
  updatedAt: '2026-11-06T00:00:00Z',
}

describe('provider form state', () => {
  it('starts an edit with a blank key, so saving keeps the stored one', () => {
    const form = formFor(provider)
    expect(form.apiKey).toBe('')
    expect(toSaveInput(form, provider)).toMatchObject({ id: provider.id, apiKey: '', model: 'gpt-image-2.6' })
    expect(canSave(form, false)).toBe(true)
  })

  it('requires a key for a new provider', () => {
    const form = { ...DEFAULT_FORM, label: 'Relay', model: 'gpt-image-2.6' }
    expect(canSave(form, true)).toBe(false)
    expect(canSave({ ...form, apiKey: 'sk-new-key-1234' }, true)).toBe(true)
    expect(toSaveInput(form, null)).not.toHaveProperty('id')
  })
})
