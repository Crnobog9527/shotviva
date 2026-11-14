import type { CookieEntry } from './cookie'
import type { LiveExperiment, LiveVariant } from './types'

// Which variant one visitor sees for one live experiment (ARCHITECTURE §16.5). Pure: the proxy
// passes the cookie's entry and a random number in [0, 1).
// - running: a visitor's variant is kept on every page and visit; a new visitor is drawn by weight;
// - paused: kept, but nobody new is drawn (new visitors see the control and are not counted);
// - ended: everyone sees the winner and nothing is written;
// - a variant that was archived hands its people to its fallback (the control unless the admin
//   picked another), flagged `r` so the move is reported.
// `entry` is what the cookie must now hold for this experiment, or undefined to leave it.

export type Decision = { variant: LiveVariant; entry?: CookieEntry }

// Archived → fallback, several hops at most; the control when the chain ends nowhere.
function resolve(experiment: LiveExperiment, start: LiveVariant, control: LiveVariant): LiveVariant {
  let variant: LiveVariant | undefined = start
  for (let hop = 0; variant?.archived && hop < 5; hop += 1) {
    const next: number | null = variant.fallback
    variant = experiment.variants.find((candidate) => candidate.id === next)
  }
  return variant && !variant.archived ? variant : control
}

export function drawVariant(variants: readonly LiveVariant[], random: number): LiveVariant | null {
  const open = variants.filter((variant) => !variant.archived && variant.weight > 0)
  const total = open.reduce((sum, variant) => sum + variant.weight, 0)
  if (total === 0) return null
  let point = random * total
  for (const variant of open) {
    point -= variant.weight
    if (point < 0) return variant
  }
  return open[open.length - 1] ?? null
}

// A visitor already on a variant: kept, or moved off an archived one.
function kept(experiment: LiveExperiment, held: CookieEntry, current: LiveVariant, control: LiveVariant): Decision {
  const now = resolve(experiment, current, control)
  if (now.id === current.id) return { variant: current }
  return { variant: now, entry: { experiment: experiment.id, current: now.id, first: held.first, flag: held.flag === 'f' ? 'f' : 'r' } }
}

function winnerOf(experiment: LiveExperiment, control: LiveVariant): LiveVariant {
  const winner = experiment.variants.find((variant) => variant.id === experiment.winner)
  return winner && !winner.archived ? winner : control
}

export function decideVariant(experiment: LiveExperiment, held: CookieEntry | undefined, random: number): Decision | null {
  const control = experiment.variants.find((variant) => variant.control)
  if (!control) return null
  if (experiment.status === 'ended') return { variant: winnerOf(experiment, control) }
  const current = held && experiment.variants.find((variant) => variant.id === held.current)
  if (held && current) return kept(experiment, held, current, control)
  if (experiment.status === 'paused') return { variant: control }
  const drawn = drawVariant(experiment.variants, random) ?? control
  return { variant: drawn, entry: { experiment: experiment.id, current: drawn.id, first: drawn.id, flag: 'n' } }
}
