// `input_fidelity` on /images/edits (T30, ARCHITECTURE §5.2: sent only "when the model supports
// it"). Per OpenAI's image edit reference (checked 2026-11-07): gpt-image-1.5 and gpt-image-1
// take high or low, gpt-image-1-mini takes low only, and gpt-image-2 and later reject the field
// with 400 invalid_input_fidelity_model (they always read inputs at high fidelity). A dated
// snapshot such as `gpt-image-1.5-2025-12-16` counts as its family.

export type InputFidelity = 'high' | 'low'

const FAMILIES: ReadonlyArray<readonly [RegExp, readonly InputFidelity[]]> = [
  // Before gpt-image-1, whose pattern would also match it.
  [/^gpt-image-1-mini(-|$)/, ['low']],
  [/^gpt-image-1(\.5)?(-|$)/, ['high', 'low']],
]

// The value to send for `model`, or undefined to leave the field out. Unknown models get nothing:
// a model that does take it only loses the setting, while sending it to one that does not fails
// every edit.
export function fidelityFor(model: string, wanted: InputFidelity | undefined): InputFidelity | undefined {
  if (!wanted) return undefined
  const family = FAMILIES.find(([pattern]) => pattern.test(model.trim().toLowerCase()))
  return family?.[1].includes(wanted) ? wanted : undefined
}

// OpenAI's answer when the field reaches a model that does not accept it.
export const FIDELITY_REJECTED_CODE = 'invalid_input_fidelity_model'
