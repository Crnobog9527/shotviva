import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import messages from '@/site/messages/en.json'

// The photo page's English copy (T6 photo.html, T32): the comp's exact words, and never the
// word "prompt" — what the user wrote is theirs, our wrapper is never shown.
const result = messages.app.result
const when = createTranslator({ locale: 'en', messages, namespace: 'app.result.when' })

describe('photo page messages (en)', () => {
  it('keeps the comp wording', () => {
    expect([result.views.result, result.views.onWhite, result.views.transparent, result.views.original]).toEqual(['Result', 'On white', 'Transparent', 'Original'])
    expect(result.originalDeleted).toBe('Original deleted')
    expect(result.originalDeletedBody).toBe('Per our privacy rules, the photo you uploaded is no longer kept. The result stays.')
    expect(result.yourNote).toBe('Your note')
    expect(result.facts.originalDeleted).toBe('Deleted per our privacy rules')
    expect(result.facts.formatPng).toBe('PNG, transparent background')
    expect([when('today'), when('yesterday')]).toEqual(['Today', 'Yesterday'])
    expect(when('meta', { day: 'Today', time: '14:05' })).toBe('Today 14:05')
    expect(when('made', { day: 'Today', time: '14:05' })).toBe('Today, 14:05')
  })

  it('never says "prompt" anywhere on the page', () => {
    expect(JSON.stringify(result)).not.toMatch(/prompt/i)
  })
})
