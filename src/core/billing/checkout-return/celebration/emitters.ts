import { between, pickOf, type Kind, type Particle, type Rng } from './engine'

// The demo's four emitters, as pure particle factories (no timers, no canvas): a fan of
// confetti or foil, a ring of sparks, one tick of a rain from the top, and a field of embers.

export type BurstOptions = { ang?: number; spread?: number; speed?: readonly [number, number]; kind?: Kind; g?: number; life?: readonly [number, number] }

const base = { rot: 0, vr: 0, ph: 0, flutter: 0, h: 0, alpha: 1 }

export function burst(rng: Rng, x: number, y: number, n: number, colors: readonly string[], options: BurstOptions = {}): Particle[] {
  const { ang = -90, spread = 60, speed = [500, 900], kind = 'paper', g = 1400, life = [1.8, 2.8] } = options
  return Array.from({ length: n }, () => {
    const a = ((ang + between(rng, -spread, spread)) * Math.PI) / 180
    const v = between(rng, speed[0], speed[1])
    return {
      ...base,
      kind,
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      g,
      drag: 1.4,
      rot: between(rng, 0, 6.3),
      vr: between(rng, -8, 8),
      ph: between(rng, 0, 6.3),
      flutter: kind === 'paper' ? 80 : 0,
      w: between(rng, 6, 12),
      h: between(rng, 8, 16),
      c: pickOf(rng, colors),
      life: between(rng, life[0], life[1]),
    }
  })
}

export function sparks(rng: Rng, x: number, y: number, n: number, colors: readonly string[]): Particle[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const v = between(rng, 260, 420)
    return { ...base, kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 300, drag: 3.2, w: between(rng, 1.5, 2.5), c: pickOf(rng, colors), life: between(rng, 0.4, 0.7) }
  })
}

// One 50ms tick of a rain falling from above the top edge across the whole width.
export function rainTick(rng: Rng, width: number, n: number, colors: readonly string[], kind: 'disc' | 'foil', size: readonly [number, number]): Particle[] {
  return Array.from({ length: n }, () => ({
    ...base,
    kind,
    x: between(rng, -20, width + 20),
    y: -20,
    vx: between(rng, -40, 40),
    vy: between(rng, 60, 160),
    g: kind === 'foil' ? 260 : 700,
    drag: 0.6,
    rot: between(rng, 0, 6.3),
    vr: between(rng, -3, 3),
    ph: between(rng, 0, 6.3),
    flutter: kind === 'foil' ? 120 : 0,
    w: between(rng, size[0], size[1]),
    h: between(rng, size[0] * 1.2, size[1] * 1.6),
    c: pickOf(rng, colors),
    life: 6,
  }))
}

export function embers(rng: Rng, width: number, height: number, n: number, color: string, dur: number): Particle[] {
  return Array.from({ length: n }, () => ({
    ...base,
    kind: 'ember',
    x: between(rng, 0, width),
    y: between(rng, height * 0.3, height + 20),
    vx: between(rng, -15, 15),
    vy: between(rng, -40, -15),
    g: -8,
    drag: 0.2,
    ph: between(rng, 0, 6.3),
    w: between(rng, 2, 4),
    c: color,
    alpha: between(rng, 0.4, 0.9),
    life: between(rng, dur * 0.5, dur),
  }))
}
