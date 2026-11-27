import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { publicClientMessages } from '@/core/i18n'
import { loadMessages } from '@/site/i18n/messages'

const SRC = join(__dirname, '..')

// The public pages' template panel (#930) reads app.series, app.share and app.form; the rest of
// Create's text (app.create) stays out of every public page's payload.
describe('the template panel\'s messages on public pages', () => {
  it.each(['en', 'zh'] as const)('%s: ships the panel\'s groups and not app.create', async (locale) => {
    const app = publicClientMessages(await loadMessages(locale)).app as Record<string, Record<string, string>>
    expect(Object.keys(app)).toEqual(expect.arrayContaining(['series', 'share', 'form']))
    expect(app.create).toBeUndefined()
    // Every key the form's loading line reads, under the namespace it reads.
    const source = readFileSync(join(SRC, 'modules/image/catalogue/catalogue-form-status.tsx'), 'utf8')
    expect(source).toContain("useTranslations('app.form')")
    for (const key of source.matchAll(/\bt\('([A-Za-z]+)'\)/g)) expect(app.form?.[key[1]!]).toEqual(expect.any(String))
  })
})
