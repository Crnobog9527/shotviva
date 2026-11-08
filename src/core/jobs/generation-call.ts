import 'server-only'

import type { IdentityJudge, ScreenResult } from '../identity-guard'
import type { InputImage } from '../storage'
import { renderPrompt, type GenerationInputs, type GenerationTemplate, type Resolution } from '../templates'
import type { ProviderInput } from './provider'
import type { DecisionCost } from './settle-generation'

// The provider call of a template generation (ARCHITECTURE §4): the template's wrapped prompt with
// the user's copy and note, their photo, the size, the template's quality tier and model params.
// A user's job and an admin test run (§10.b, T85) send exactly this; only who pays differs.
export function templateCall(
  { template, prompt }: GenerationTemplate,
  inputs: GenerationInputs,
  image: InputImage | null,
  resolution: Resolution,
): Omit<ProviderInput, 'signal'> {
  return {
    prompt: renderPrompt(prompt.body, inputs),
    images: image ? [image] : [],
    aspectRatio: inputs.aspectRatio,
    resolution,
    quality: template.quality,
    params: prompt.modelParams,
  }
}

// The screening call's tokens join the job's usage and cost like the edit decision's (T33).
export function screenCost(judge: IdentityJudge | null | undefined, screen: ScreenResult): DecisionCost | undefined {
  if (!screen.usage) return undefined
  return {
    usage: { decision_input_tokens: screen.usage.inputTokens, decision_output_tokens: screen.usage.outputTokens },
    prices: judge?.prices ?? null,
  }
}

// Every word the user typed that reaches the image model: the template's text fields and the note.
export const typedWords = (inputs: GenerationInputs): string[] => [...Object.values(inputs.copy), inputs.note]
