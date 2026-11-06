import type { BurstOptions } from './emitters'
import type { CelebrationLevel } from './levels'
import { C } from './palette'

// Each celebration as timed steps, exactly the demo's sequence (comps-v3-b demo-celebrate.html;
// DESKTOP-NOTES round 13 item 4, round 14 item 2). Data only: celebration.tsx plays it, tests
// read it. Times in ms after the plate appears.

// Where a burst starts: the plate's tick, or a bottom / side corner of the screen.
export type Origin = 'glyph' | 'bottom-left' | 'bottom-right' | 'side-left' | 'side-right'

export type Effect =
  | { kind: 'flash'; ms: number; peak: number }
  | { kind: 'count'; ms: number }
  | { kind: 'thump' }
  | { kind: 'dim'; opacity: number }
  | { kind: 'safelight'; on: boolean }
  | { kind: 'burst'; from: Origin; n: number; colors: readonly string[]; options?: BurstOptions }
  | { kind: 'sparks'; n: number; colors: readonly string[] }
  | { kind: 'rain'; n: number; colors: readonly string[]; particle: 'disc' | 'foil'; seconds: number; size: readonly [number, number] }
  | { kind: 'embers'; n: number; color: string; seconds: number }

export type Step = { at: number; effect: Effect }

const warm = [C.safe, C.safeHi, C.bone]
const sapphire = [C.sapInk, C.sapFlag, C.sapRim, C.bone, C.white]
const foil = [...C.gold, C.bone]

const cannon = (from: Origin, ang: number, colors: readonly string[], n: number, options: BurstOptions): Effect => ({
  kind: 'burst',
  from,
  n,
  colors,
  options: { ang, spread: 18, speed: [900, 1500], ...options },
})

const SCRIPTS: Record<CelebrationLevel, readonly Step[]> = {
  // A pop and the number counting up, one soft flash.
  pack_s: [{ at: 0, effect: { kind: 'flash', ms: 140, peak: 0.25 } }],
  // + a ring of sparks from the tick.
  pack_m: [
    { at: 0, effect: { kind: 'flash', ms: 140, peak: 0.3 } },
    { at: 300, effect: { kind: 'sparks', n: 28, colors: warm } },
  ],
  // + a short shower of credit discs.
  pack_l: [
    { at: 0, effect: { kind: 'flash', ms: 160, peak: 0.35 } },
    { at: 300, effect: { kind: 'sparks', n: 36, colors: warm } },
    { at: 450, effect: { kind: 'rain', n: 70, colors: [C.safe, C.safeHi, C.safeMid], particle: 'disc', seconds: 1.6, size: [8, 12] } },
  ],
  // A confetti burst from the tick: bone, safelight, graphite paper.
  starter: [
    { at: 0, effect: { kind: 'flash', ms: 160, peak: 0.35 } },
    { at: 320, effect: { kind: 'burst', from: 'glyph', n: 140, colors: [C.bone, C.safe, C.safeHi, C.graphite, C.boneDim], options: { spread: 70, speed: [450, 950] } } },
  ],
  // Lights flash, two sapphire cannons from the bottom corners, the plate sweeps sapphire.
  pro: [
    { at: 0, effect: { kind: 'thump' } },
    { at: 0, effect: { kind: 'flash', ms: 220, peak: 0.7 } },
    { at: 350, effect: cannon('bottom-left', -62, sapphire, 160, { life: [2.5, 3.5] }) },
    { at: 350, effect: cannon('bottom-right', -118, sapphire, 160, { life: [2.5, 3.5] }) },
    { at: 900, effect: { kind: 'sparks', n: 40, colors: [C.sapInk, C.white] } },
    { at: 1000, effect: { kind: 'burst', from: 'glyph', n: 90, colors: [C.sapInk, C.bone, C.white], options: { spread: 80, speed: [400, 800] } } },
  ],
  // The room goes dark, the safelight comes up, gold foil rains with two side cannons, embers
  // drift after; the plate is black and gold.
  max: [
    { at: 0, effect: { kind: 'thump' } },
    { at: 0, effect: { kind: 'dim', opacity: 0.7 } },
    { at: 350, effect: { kind: 'safelight', on: true } },
    { at: 1100, effect: { kind: 'dim', opacity: 0 } },
    { at: 1100, effect: { kind: 'flash', ms: 260, peak: 0.6 } },
    { at: 1150, effect: cannon('side-left', -55, foil, 120, { kind: 'foil', life: [3, 4] }) },
    { at: 1150, effect: cannon('side-right', -125, foil, 120, { kind: 'foil', life: [3, 4] }) },
    { at: 1250, effect: { kind: 'rain', n: 320, colors: C.gold, particle: 'foil', seconds: 3.5, size: [7, 13] } },
    { at: 1300, effect: { kind: 'sparks', n: 48, colors: [C.gold[0], C.gold[1], C.white] } },
    { at: 2600, effect: { kind: 'embers', n: 60, color: C.gold[0], seconds: 7 } },
    { at: 6000, effect: { kind: 'safelight', on: false } },
  ],
}

// Every level counts the credits up from 300ms, as the demo does.
export function scriptFor(level: CelebrationLevel): readonly Step[] {
  return [...SCRIPTS[level], { at: 300, effect: { kind: 'count', ms: 700 } }]
}

// Roughly when the last particle is gone, for tests and the handoff: each step's own length (a
// burst's longest life, a rain plus its fall, the embers' life) after its start.
const FALL_MS = 1500

function lengthOf(effect: Effect): number {
  switch (effect.kind) {
    case 'flash':
    case 'count':
      return effect.ms
    case 'burst':
      return (effect.options?.life?.[1] ?? 2.8) * 1000
    case 'sparks':
      return 700
    case 'rain':
      return effect.seconds * 1000 + FALL_MS
    case 'embers':
      return effect.seconds * 1000
    default:
      return 0
  }
}

export function estimatedEndMs(script: readonly Step[]): number {
  return Math.max(...script.map((step) => step.at + lengthOf(step.effect)))
}
