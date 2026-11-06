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
    // T40 (comp round 16): originals are kept with the work; only older works lack one.
    expect(result.originalDeleted).toBe('Original not available')
    expect(result.originalDeletedBody).toBe('This photo was made before originals were kept with each work. The result stays.')
    expect(result.facts.originalWithWork).toBe('Kept with this photo')
    expect(result.yourNote).toBe('Your note')
    expect(result.facts.originalDeleted).toBe('Made before originals were kept')
    expect(result.facts.formatPng).toBe('PNG, transparent background')
    expect([when('today'), when('yesterday')]).toEqual(['Today', 'Yesterday'])
    expect(when('meta', { day: 'Today', time: '14:05' })).toBe('Today 14:05')
    expect(when('made', { day: 'Today', time: '14:05' })).toBe('Today, 14:05')
  })

  it('keeps the Make again comp wording (T6 workspace.html?again, T40)', () => {
    const again = createTranslator({ locale: 'en', messages, namespace: 'app.workspace.again' })
    const b = (chunks: string) => `[${chunks}]`
    expect(again.markup('note', { b, summary: 'Pure White · Post 4:5 · Standard · note kept', day: () => '28 Oct' })).toBe(
      '[Making again:] Pure White · Post 4:5 · Standard · note kept, from 28 Oct.',
    )
    expect(again('kept')).toBe('Original photo, kept with the work')
    expect(again('missingTitle')).toBe("The original photo isn't available")
    expect(again('missingOld')).toBe('This work was made before we started keeping originals. Add the same photo again and everything else is as it was.')
    expect(again.markup('addFirst', { b, count: 2 })).toBe('Add the photo first. [Then it costs 2 credits, like any photo.]')
  })

  it('says deleting cannot be undone and keeps the credits spent (T41)', () => {
    expect(result.delete.body).toBe("This can't be undone. Credits spent aren't refunded.")
    expect(messages.app.photos.deleted).toBe('Photo deleted.')
    expect(messages.app.edit.sourceDeleted).toBe('Original deleted')
  })

  it('never says "prompt" anywhere on the page', () => {
    expect(JSON.stringify(result)).not.toMatch(/prompt/i)
  })
})
