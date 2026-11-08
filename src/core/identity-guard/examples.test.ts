import { describe, expect, it } from 'vitest'

import { ALLOW_EXAMPLES, REFUSE_EXAMPLES } from './examples.test-data'
import recorded from './examples.recorded.json'
import { IDENTITY_PROMPT_VERSION } from './question'
import { recordingSchema } from './recording'

// The evaluation set end to end (ARCHITECTURE §5.1a): the decision model's recorded real answer
// must equal the expected verdict for every sentence. The recording comes from a real run (the
// admin dry run on the test site, or scripts/identity-judge-eval.ts), never from a guess, and
// counts only for the prompt version it was recorded with: after a prompt change the replay waits
// for a new recording instead of checking stale answers.

const recording = recordingSchema.parse(recorded)
const examples = [...REFUSE_EXAMPLES, ...ALLOW_EXAMPLES]
const current = recording.promptVersion === IDENTITY_PROMPT_VERSION

describe(`evaluation set, recorded answers for prompt ${IDENTITY_PROMPT_VERSION}`, () => {
  it.each(current ? examples.filter((e) => recording.answers[e.text]) : [])('$expect: "$text"', ({ text, expect: verdict }) => {
    expect(recording.answers[text]!.identitySwap ? 'refuse' : 'allow').toBe(verdict)
  })

  it.skipIf(!current)('has a recorded answer for every sentence, or lists it as pending', () => {
    const pending = new Set(recording.pending)
    expect(examples.filter((e) => !recording.answers[e.text] && !pending.has(e.text)).map((e) => e.text)).toEqual([])
  })

  it('records only sentences of the set, and lists as pending only unanswered ones', () => {
    const texts = new Set(examples.map((e) => e.text))
    expect(Object.keys(recording.answers).filter((text) => !texts.has(text))).toEqual([])
    expect(recording.pending.filter((text) => !texts.has(text) || recording.answers[text])).toEqual([])
  })

  it('has no sentence twice', () => {
    expect(new Set(examples.map((e) => e.text)).size).toBe(examples.length)
  })

  it('covers both verdicts in Chinese, English, several other languages and mixed text', () => {
    for (const list of [REFUSE_EXAMPLES, ALLOW_EXAMPLES]) {
      for (const lang of ['zh', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ar', 'ru', 'mixed'] as const) {
        expect(list.some((e) => e.lang === lang), `${lang}`).toBe(true)
      }
    }
  })
})
