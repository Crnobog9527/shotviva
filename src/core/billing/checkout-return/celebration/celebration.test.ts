import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_PRODUCTS } from '../../stripe/test-products'
import { burst, embers, rainTick, sparks } from './emitters'
import { alive, step, type Engine, type Particle } from './engine'
import { levelOf, plateMaterial } from './levels'
import { C } from './palette'
import { play, type Stage } from './player'
import { hasCelebrated, markCelebrated } from './seen'
import { estimatedEndMs, scriptFor, type Effect } from './timeline'

// The purchase celebration (T55, comps-v3-b demo-celebrate.html, DESIGN 「购买成功的庆祝动效」).

// A seeded generator so particle tests are repeatable.
function seeded(seed = 1) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

describe('levels', () => {
  it('packs step up S / M / L; monthly and yearly of a tier celebrate alike', () => {
    expect(TEST_PRODUCTS.map(p => levelOf(p.id, p.tier === 'pack' ? null : p.tier))).toEqual(['starter', 'starter', 'pro', 'pro', 'max', 'max', 'pack_s', 'pack_m', 'pack_l'])
    expect(levelOf('studio_monthly', 'pro')).toBe(levelOf('pro_yearly', 'pro'))
  })

  it('only Pro and Max put their material on the plate', () => {
    expect(['pack_s', 'pack_m', 'pack_l', 'starter', 'pro', 'max'].map((l) => plateMaterial(l as never))).toEqual([null, null, null, null, 'pro', 'max'])
  })
})

describe('timelines', () => {
  const kinds = (level: Parameters<typeof scriptFor>[0]) => scriptFor(level).map((s) => s.effect.kind)
  const end = (level: Parameters<typeof scriptFor>[0]) => estimatedEndMs(scriptFor(level))

  it('every level counts the credits up from 300ms for 700ms', () => {
    for (const level of ['pack_s', 'pack_m', 'pack_l', 'starter', 'pro', 'max'] as const) {
      expect(scriptFor(level)).toContainEqual({ at: 300, effect: { kind: 'count', ms: 700 } })
    }
  })

  it('each level is a step up, about 1s for a pack, 2.5–3s Starter, 3.5–4s Pro, 7s+ Max', () => {
    expect(end('pack_s')).toBeLessThanOrEqual(1000)
    expect(end('pack_m')).toBeLessThanOrEqual(1000)
    expect(end('starter')).toBeGreaterThan(end('pack_m'))
    expect(end('starter')).toBeLessThanOrEqual(3200)
    expect(end('pro')).toBeGreaterThan(end('starter'))
    expect(end('pro')).toBeLessThanOrEqual(4000)
    expect(end('max')).toBeGreaterThanOrEqual(7000)
  })

  it('packs: a flash; M adds sparks; L adds a disc shower. No confetti', () => {
    expect(kinds('pack_s')).toEqual(['flash', 'count'])
    expect(kinds('pack_m')).toContain('sparks')
    expect(scriptFor('pack_l').some((s) => s.effect.kind === 'rain' && s.effect.particle === 'disc')).toBe(true)
    for (const level of ['pack_s', 'pack_m', 'pack_l'] as const) expect(kinds(level)).not.toContain('burst')
  })

  it('Pro: sapphire cannons from both bottom corners and a thump, no dim or gold', () => {
    const effects = scriptFor('pro').map((s) => s.effect)
    const cannons = effects.filter((e): e is Extract<Effect, { kind: 'burst' }> => e.kind === 'burst' && e.from.startsWith('bottom'))
    expect(cannons.map((c) => c.from)).toEqual(['bottom-left', 'bottom-right'])
    for (const c of cannons) expect(c.colors).toContain(C.sapFlag)
    expect(effects.map((e) => e.kind)).toContain('thump')
    expect(JSON.stringify(effects)).not.toContain(C.gold[0])
    expect(effects.map((e) => e.kind)).not.toContain('dim')
  })

  it('Max: the room dims, the safelight rises then falls, foil cannons and foil rain, embers after', () => {
    const steps = scriptFor('max')
    expect(steps.filter((s) => s.effect.kind === 'dim').map((s) => [s.at, (s.effect as { opacity: number }).opacity])).toEqual([[0, 0.7], [1100, 0]])
    expect(steps.filter((s) => s.effect.kind === 'safelight').map((s) => (s.effect as { on: boolean }).on)).toEqual([true, false])
    expect(steps.some((s) => s.effect.kind === 'burst' && s.effect.options?.kind === 'foil')).toBe(true)
    expect(steps.some((s) => s.effect.kind === 'rain' && s.effect.particle === 'foil')).toBe(true)
    const ember = steps.find((s) => s.effect.kind === 'embers')
    expect(ember?.at).toBeGreaterThan(2000)
  })
})

describe('emitters and physics', () => {
  it('a burst fans out within its spread, upward by default', () => {
    const ps = burst(seeded(), 100, 500, 50, [C.bone], { spread: 20 })
    expect(ps).toHaveLength(50)
    for (const p of ps) {
      const deg = (Math.atan2(p.vy, p.vx) * 180) / Math.PI
      expect(deg).toBeGreaterThanOrEqual(-110)
      expect(deg).toBeLessThanOrEqual(-70)
      expect(p.kind).toBe('paper')
    }
  })

  it('sparks ring out, rain falls from above the top, embers rise', () => {
    expect(sparks(seeded(), 0, 0, 8, [C.white]).every((p) => p.kind === 'spark' && p.life <= 0.7)).toBe(true)
    expect(rainTick(seeded(), 400, 5, C.gold, 'foil', [7, 13]).every((p) => p.y === -20 && p.vy > 0 && p.kind === 'foil')).toBe(true)
    expect(embers(seeded(), 400, 800, 5, C.gold[0], 7).every((p) => p.vy < 0 && p.g < 0)).toBe(true)
  })

  it('a step applies gravity and ages the particle; it dies when old or below the screen', () => {
    const p: Particle = { kind: 'disc', x: 0, y: 0, vx: 0, vy: 0, g: 1000, drag: 0, rot: 0, vr: 0, ph: 0, flutter: 0, w: 8, h: 8, c: '#fff', life: 1, alpha: 1 }
    step(p, 0.1, 0)
    expect(p.vy).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(10)
    expect(p.life).toBeCloseTo(0.9)
    expect(alive(p, 800)).toBe(true)
    expect(alive({ ...p, y: 900 }, 800)).toBe(false)
    expect(alive({ ...p, life: 0 }, 800)).toBe(false)
  })
})

describe('once per payment', () => {
  const memory = () => {
    const data = new Map<string, string>()
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
  }

  it('remembers a payment, keeps only the last 20, and shrugs off broken storage', () => {
    const store = memory()
    expect(hasCelebrated(store, 'cs_test_1')).toBe(false)
    markCelebrated(store, 'cs_test_1')
    expect(hasCelebrated(store, 'cs_test_1')).toBe(true)
    for (let i = 0; i < 25; i += 1) markCelebrated(store, `PAY_${i}`)
    expect(hasCelebrated(store, 'cs_test_1')).toBe(false)
    expect(hasCelebrated(store, 'PAY_24')).toBe(true)
    const broken = { getItem: () => 'not json', setItem: () => { throw new Error('quota') } }
    expect(hasCelebrated(broken, 'x')).toBe(false)
    expect(() => markCelebrated(broken, 'x')).not.toThrow()
  })
})

describe('player', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function stage() {
    const spawned: Particle[][] = []
    let live = false
    const engine: Engine = {
      spawn: (ps) => void spawned.push(ps),
      running: () => live,
      size: () => ({ width: 400, height: 800 }),
      clear: () => undefined,
      destroy: () => undefined,
    }
    const calls: string[] = []
    const s: Stage = {
      engine,
      rng: seeded(),
      glyph: () => [200, 200],
      flash: (ms) => void calls.push(`flash:${ms}`),
      dim: (o) => void calls.push(`dim:${o}`),
      safelight: (on) => void calls.push(`safe:${on}`),
      thump: () => void calls.push('thump'),
      count: (ms, end) => {
        calls.push(`count:${ms}`)
        setTimeout(end, ms)
      },
    }
    return { s, spawned, calls, setLive: (v: boolean) => (live = v) }
  }

  it('plays the steps on time and calls done once nothing is left', () => {
    const { s, spawned, calls } = stage()
    const done = vi.fn()
    play(s, scriptFor('pack_m'), done)
    vi.advanceTimersByTime(299)
    expect(calls).toEqual(['flash:140'])
    vi.advanceTimersByTime(1)
    expect(spawned).toHaveLength(1)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(700)
    expect(done).toHaveBeenCalledOnce()
  })

  it('waits for the last particle, and stop() cancels what is left', () => {
    const { s, calls, setLive } = stage()
    const done = vi.fn()
    setLive(true)
    const stop = play(s, scriptFor('max'), done)
    vi.advanceTimersByTime(1200)
    expect(calls).toEqual(expect.arrayContaining(['thump', 'dim:0.7', 'safe:true', 'dim:0', 'flash:260']))
    stop()
    vi.advanceTimersByTime(10_000)
    expect(calls).not.toContain('safe:false')
    expect(done).not.toHaveBeenCalled()
  })
})
