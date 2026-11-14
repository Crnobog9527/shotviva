import { z } from 'zod'

// A/B experiments (ARCHITECTURE §16.5, Owner 2026-11-14). The database holds experiments and
// their variants (1540–1542); each variant names one option the code defines for its surface
// (src/site/experiments). Nothing here is a price: plan amounts never vary by experiment.

export const SURFACES = ['hero', 'pricing', 'paywall'] as const
export type Surface = (typeof SURFACES)[number]

export const GOALS = ['signup', 'first_generation', 'payment'] as const
export type Goal = (typeof GOALS)[number]

export const STATUSES = ['draft', 'running', 'paused', 'ended'] as const
export type Status = (typeof STATUSES)[number]

export const OPTION_ID = /^[a-z0-9-]{1,40}$/

const id = z.number().int().positive()

// experiments_live() (1544): what the proxy decides with.
export const liveVariantSchema = z.object({
  id,
  option: z.string(),
  weight: z.number().int().min(0),
  control: z.boolean(),
  archived: z.boolean(),
  fallback: id.nullable(),
})
export type LiveVariant = z.infer<typeof liveVariantSchema>

export const liveExperimentSchema = z.object({
  id,
  surface: z.enum(SURFACES),
  status: z.enum(['running', 'paused', 'ended']),
  winner: id.nullable(),
  variants: z.array(liveVariantSchema).min(1),
})
export type LiveExperiment = z.infer<typeof liveExperimentSchema>

// One option a surface offers (src/site/experiments). `label` is what the admin picks from.
export type SurfaceOption = { id: string; label: string }

// A surface the proxy serves by rewriting to a prerendered page per option: `paths` are the
// logical (unprefixed) addresses; the default option is the page as it is today, served without a
// rewrite; any other option is served from `${locale prefix}/x/${surface}/${option}`.
export type SurfaceRoute = {
  surface: Surface
  paths: readonly string[]
  options: readonly SurfaceOption[]
  defaultOption: string
  // Visitors on the default option of a running or paused experiment get its own prerendered page
  // (/x/<surface>/<default>) instead of the plain address, so the test can change something about
  // the default group (the home generator's order, §16.5) without changing the page everyone else
  // and every crawler sees.
  defaultOptionPageInExperiment?: boolean
}

// The code's whole list, passed in from site/ (core never imports it).
export type ExperimentRegistry = readonly SurfaceRoute[]
