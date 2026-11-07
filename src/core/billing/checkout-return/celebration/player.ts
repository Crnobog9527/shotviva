import { burst, embers, rainTick, sparks } from './emitters'
import type { Engine, Rng } from './engine'
import type { Effect, Origin, Step } from './timeline'

// Plays a script: schedules each step, runs rains as 50ms ticks, and calls `done` once nothing
// is pending (no step, rain or count left) and the last particle has landed. `stop()` cancels
// everything at once (the visitor clicked to skip, or the page went away).

export type Stage = {
  engine: Engine
  rng: Rng
  // Centre of the plate's tick, in viewport pixels.
  glyph(): readonly [number, number]
  flash(ms: number, peak: number): void
  dim(opacity: number): void
  safelight(on: boolean): void
  thump(): void
  // Counts the added credits up over `ms`; calls `end` when it has.
  count(ms: number, end: () => void): void
}

function originOf(stage: Stage, from: Origin): readonly [number, number] {
  const { width, height } = stage.engine.size()
  if (from === 'glyph') return stage.glyph()
  if (from === 'bottom-left') return [0, height]
  if (from === 'bottom-right') return [width, height]
  return [from === 'side-left' ? 0 : width, height * 0.8]
}

export function play(stage: Stage, script: readonly Step[], done: () => void): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let pending = 0
  let stopped = false
  const settle = () => {
    if (!stopped && pending === 0 && !stage.engine.running()) {
      stopped = true
      done()
    }
  }
  const later = (ms: number, run: () => void) => {
    pending += 1
    const id = setTimeout(() => {
      timers.delete(id)
      run()
      pending -= 1
      settle()
    }, ms)
    timers.add(id)
  }
  const hold = () => {
    pending += 1
    return () => {
      pending -= 1
      settle()
    }
  }
  const apply = (effect: Effect) => applyEffect(stage, effect, later, hold)
  for (const step of script) later(step.at, () => apply(step.effect))
  const poll = setInterval(settle, 250)
  return () => {
    stopped = true
    clearInterval(poll)
    for (const id of timers) clearTimeout(id)
    timers.clear()
  }
}

type Later = (ms: number, run: () => void) => void

type ParticleEffect = Extract<Effect, { kind: 'burst' | 'sparks' | 'rain' | 'embers' }>

function applyEffect(stage: Stage, effect: Effect, later: Later, hold: () => () => void): void {
  switch (effect.kind) {
    case 'flash': return stage.flash(effect.ms, effect.peak)
    case 'count': return stage.count(effect.ms, hold())
    case 'thump': return stage.thump()
    case 'dim': return stage.dim(effect.opacity)
    case 'safelight': return stage.safelight(effect.on)
    default: return spawnEffect(stage, effect, later)
  }
}

function spawnEffect(stage: Stage, effect: ParticleEffect, later: Later): void {
  const { engine, rng } = stage
  const { width, height } = engine.size()
  if (effect.kind === 'burst') {
    const [x, y] = originOf(stage, effect.from)
    engine.spawn(burst(rng, x, y, effect.n, effect.colors, effect.options))
  } else if (effect.kind === 'sparks') {
    const [x, y] = stage.glyph()
    engine.spawn(sparks(rng, x, y, effect.n, effect.colors))
  } else if (effect.kind === 'rain') {
    // A tick every 50ms for the rain's length, as the demo's setInterval did.
    const ticks = Math.round(effect.seconds * 20)
    const each = Math.ceil(effect.n / ticks)
    for (let i = 0; i < ticks; i += 1) later(i * 50, () => engine.spawn(rainTick(rng, width, each, effect.colors, effect.particle, effect.size)))
  } else {
    engine.spawn(embers(rng, width, height, effect.n, effect.color, effect.seconds))
  }
}
