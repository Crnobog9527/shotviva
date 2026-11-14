import type { Goal, Surface, SurfaceOption } from '../../experiments'
import type { ExperimentRow } from '../experiments/schemas'

// The new / edit-draft form of /admin/experiments (ARCHITECTURE §16.5). Pure, so it is tested.

export type SurfaceChoices = Partial<Record<Surface, readonly SurfaceOption[]>>

export type VariantForm = { optionId: string; label: string; weight: string; isControl: boolean }
export type ExperimentForm = { surface: Surface; name: string; goal: Goal; variants: VariantForm[] }

export const MAX_VARIANTS = 4

// Today's page first, as the control: the surface's first option.
export function emptyForm(choices: SurfaceChoices): ExperimentForm {
  const surface = (Object.keys(choices)[0] ?? 'hero') as Surface
  return { surface, name: '', goal: 'signup', variants: defaultVariants(choices[surface] ?? []) }
}

export function defaultVariants(options: readonly SurfaceOption[]): VariantForm[] {
  return options.slice(0, 2).map((option, index) => ({ optionId: option.id, label: option.label.slice(0, 40), weight: '50', isControl: index === 0 }))
}

export function toForm(row: ExperimentRow): ExperimentForm {
  return {
    surface: row.surface,
    name: row.name,
    goal: row.goal,
    variants: row.experiment_variants.map((variant) => ({ optionId: variant.option_id, label: variant.label, weight: String(variant.weight), isControl: variant.is_control })),
  }
}

export function toSaveInput(form: ExperimentForm, id: number | null) {
  return {
    id,
    surface: form.surface,
    name: form.name.trim(),
    goal: form.goal,
    variants: form.variants.map((variant) => ({ optionId: variant.optionId, label: variant.label.trim(), weight: Number(variant.weight), isControl: variant.isControl })),
  }
}

// The next option not yet in the form, for 「加一个版本」.
export function nextOption(form: ExperimentForm, choices: SurfaceChoices): SurfaceOption | null {
  const used = new Set(form.variants.map((variant) => variant.optionId))
  return (choices[form.surface] ?? []).find((option) => !used.has(option.id)) ?? null
}

export function withControl(variants: VariantForm[], index: number): VariantForm[] {
  return variants.map((variant, at) => ({ ...variant, isControl: at === index }))
}

// After removing one, some variant must still be the control.
export function without(variants: VariantForm[], index: number): VariantForm[] {
  const left = variants.filter((_, at) => at !== index)
  return left.some((variant) => variant.isControl) ? left : withControl(left, 0)
}
