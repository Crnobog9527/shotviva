import { describe, expect, it } from 'vitest'

import { ALLOW_EXAMPLES, REFUSE_EXAMPLES } from './examples.test-data'
import recorded from './examples.recorded.json'
import { matchIdentitySwapKeyword } from './keywords'
import { recordingSchema } from './recording'

// All example sentences end to end (ARCHITECTURE §5.1a): the keyword list, then the decision
// model's recorded real answer, must give the expected verdict. The recording comes from a real
// run (admin dry run on the test site, or scripts/identity-judge-eval.ts), never from a guess.

const recording = recordingSchema.parse(recorded)
const examples = [...REFUSE_EXAMPLES, ...ALLOW_EXAMPLES]

describe('example sentences, keywords then the recorded model answer', () => {
  it.each(examples.filter((e) => recording.answers[e.text]))('$expect: "$text"', ({ text, expect: verdict }) => {
    const refused = matchIdentitySwapKeyword(text) !== null || recording.answers[text]!.identitySwap
    expect(refused ? 'refuse' : 'allow').toBe(verdict)
  })

  // Every sentence the keywords leave to the model has its real answer, or is listed as pending.
  it.skipIf(recording.model === null)('has a recorded answer for every sentence the keywords leave to the model', () => {
    const pending = new Set(recording.pending)
    const missing = examples.filter((e) => matchIdentitySwapKeyword(e.text) === null && !recording.answers[e.text] && !pending.has(e.text)).map((e) => e.text)
    expect(missing).toEqual([])
  })

  it('lists as pending only example sentences that have no answer', () => {
    const texts = new Set(examples.map((e) => e.text))
    expect(recording.pending.filter((text) => !texts.has(text) || recording.answers[text])).toEqual([])
    expect(Object.keys(recording.answers).filter((text) => !texts.has(text))).toEqual([])
  })
})
