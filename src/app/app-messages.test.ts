import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { balanceChipLabel, balanceSentence } from '@/core/app-shell'
import type { Translate } from '@/core/translate'
import messages from '@/site/messages/en.json'

// The app shell's English copy lives in site/messages/en.json (TASKS T8 范围补充 2). core and
// modules test which message they pick; this checks the words DESIGN fixes verbatim.
const translator = createTranslator({ locale: 'en', messages })
const t = translator as unknown as Translate
// Rich messages rendered with plain-string tags, so the whole sentence can be compared.
const rich = (key: string, values: Record<string, unknown>) => String((translator.rich as (k: string, v: unknown) => unknown)(key, values))
const scoped = (namespace: string) => createTranslator({ locale: 'en', messages, namespace: namespace as 'app' }) as unknown as Translate

describe('app messages (en)', () => {
  it('words the balance in credits, paid and free apart (DESIGN §4.3)', () => {
    const balance = scoped('app.balance')
    expect(balanceChipLabel({ paid: 0, free: 6 }, balance)).toBe('6 free')
    expect(balanceChipLabel({ paid: 30, free: 6 }, balance)).toBe('30 + 6 free')
    expect(balanceSentence({ paid: 0, free: 6 }, balance)).toBe('You have 6 free credits.')
    expect(balanceSentence({ paid: 1, free: 1 }, balance)).toBe('You have 1 credit and 1 free credit.')
  })

  it('keeps the fixed workspace wording', () => {
    expect(t('app.workspace.noteLabel')).toBe('Anything to change?')
    expect(t('app.workspace.optional')).toBe('(optional)')
    const plain = { b: (chunks: string) => chunks }
    expect(rich('app.workspace.freeNotice', plain)).toBe(
      "This photo uses free credits: it's shown publicly with a watermark. Paid credits make it private and watermark-free.",
    )
    expect(['1k', '2k', '3k'].map((id) => t(`app.tiers.${id}.name`))).toEqual(['Standard', 'HD', 'Max'])
    expect(t('app.credits', { count: 1 })).toBe('1 credit')
    expect(t('app.template.fromCredits', { count: 2 })).toBe('from 2 credits')
    expect(t('app.result.longPress')).toBe('Long-press to save')
    const tags = { cost: (chunks: string) => `[${chunks}]`, mono: (chunks: string) => chunks }
    expect(rich('app.workspace.generateCta', { ...tags, count: 2 })).toBe('Generate [· 2 credits]')
    expect(rich('app.workspace.getCreditsCta', { ...tags, count: 6 })).toBe('Get credits [· 6 needed]')
    expect(t('app.units.px', { px: 2048 })).toBe('2048 px')
    expect(t('app.workspace.counter', { count: 12, max: 300 })).toBe('12 / 300')
  })

  it('names the eight sizes and the two tall poster sizes', () => {
    const sizes = ['original', '16:9', '4:5', '1:1', '9:16', '3:2', '4:3', '2:3', '1:2', '1:3'].map((id) => t(`app.sizes.${id}`))
    expect(sizes).toEqual(['Original', 'Banner', 'Post', 'Listing', 'Story', 'Rental', 'Website', 'Pin', 'Long poster', 'Extra-long poster'])
  })

  it('never says prompt in product copy (DESIGN §1)', () => {
    expect(JSON.stringify(messages.app)).not.toMatch(/prompt/i)
  })

  it('counts Photos without a zero', () => {
    expect(t('app.photos.count', { running: 0, done: 4 })).toBe('4 done')
    expect(t('app.photos.count', { running: 2, done: 4 })).toBe('2 in progress · 4 done')
  })
})
