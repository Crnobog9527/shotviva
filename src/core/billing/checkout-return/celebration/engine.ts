// The particle engine of comps-v3-b demo-celebrate.html (T55): one full-screen canvas, no
// library. Five kinds: paper (confetti that turns in the air), foil (gold leaf with a glint),
// disc (credit coins), spark (short streaks) and ember (slow rising glows). The loop runs only
// while particles are alive and reports when the last one is gone.

export type Kind = 'paper' | 'foil' | 'disc' | 'spark' | 'ember'

export type Particle = {
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  g: number
  drag: number
  rot: number
  vr: number
  ph: number
  flutter: number
  w: number
  h: number
  c: string
  life: number
  alpha: number
}

export type Rng = () => number

export const between = (rng: Rng, a: number, b: number) => a + rng() * (b - a)
export const pickOf = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)] as T

// One step of the physics: gravity, drag, the paper's flutter, movement and spin. Pure, so the
// motion is unit-tested.
export function step(p: Particle, dt: number, now: number): void {
  p.vy += p.g * dt
  p.vx *= 1 - p.drag * dt
  p.vy *= 1 - p.drag * dt
  if (p.flutter) p.vx += Math.sin(now / 180 + p.ph) * p.flutter * dt
  p.x += p.vx * dt
  p.y += p.vy * dt
  p.rot += p.vr * dt
  p.life -= dt
}

export const alive = (p: Particle, height: number) => p.life > 0 && p.y < height + 40

type Ctx = CanvasRenderingContext2D

function drawLeaf(cx: Ctx, p: Particle, a: number, now: number) {
  // The piece turning in the air: its height breathes with the spin.
  const turn = p.kind === 'foil' ? Math.abs(Math.cos(now / 150 + p.ph)) * 0.9 + 0.1 : Math.abs(Math.cos(now / 220 + p.ph)) * 0.8 + 0.2
  cx.scale(1, turn)
  cx.fillStyle = p.c
  cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
  if (p.kind !== 'foil') return
  cx.globalAlpha = a * (0.25 + 0.55 * Math.abs(Math.sin(now / 90 + p.ph)))
  cx.fillStyle = '#fff'
  cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 0.35)
}

function drawDisc(cx: Ctx, p: Particle, a: number, now: number) {
  cx.fillStyle = p.c
  cx.beginPath()
  cx.ellipse(0, 0, p.w / 2, (p.w / 2) * (Math.abs(Math.cos(now / 160 + p.ph)) * 0.8 + 0.2), 0, 0, Math.PI * 2)
  cx.fill()
  cx.globalAlpha = a * 0.5
  cx.fillStyle = '#fff'
  cx.beginPath()
  cx.ellipse(-p.w * 0.15, -p.w * 0.15, p.w * 0.18, p.w * 0.12, 0, 0, Math.PI * 2)
  cx.fill()
}

function drawSpark(cx: Ctx, p: Particle) {
  cx.strokeStyle = p.c
  cx.lineWidth = p.w
  cx.lineCap = 'round'
  cx.beginPath()
  cx.moveTo(0, 0)
  cx.lineTo(-p.vx * 0.03, -p.vy * 0.03)
  cx.stroke()
}

function drawEmber(cx: Ctx, p: Particle) {
  cx.fillStyle = p.c
  cx.shadowColor = p.c
  cx.shadowBlur = 10
  cx.beginPath()
  cx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
  cx.fill()
}

export function draw(cx: Ctx, p: Particle, now: number): void {
  const a = Math.min(1, p.life / 0.6) * p.alpha
  cx.save()
  cx.globalAlpha = a
  cx.translate(p.x, p.y)
  cx.rotate(p.rot)
  if (p.kind === 'paper' || p.kind === 'foil') drawLeaf(cx, p, a, now)
  else if (p.kind === 'disc') drawDisc(cx, p, a, now)
  else if (p.kind === 'spark') drawSpark(cx, p)
  else drawEmber(cx, p)
  cx.restore()
}

export type Engine = {
  spawn(particles: Particle[]): void
  // Whether particles are still in the air.
  running(): boolean
  size(): { width: number; height: number }
  clear(): void
  destroy(): void
}

// Device pixels capped at 2: past that the extra pixels cost frames, not sharpness anyone sees.
export function createEngine(canvas: HTMLCanvasElement, onIdle: () => void): Engine {
  const cx = canvas.getContext('2d')
  let width = 0
  let height = 0
  let particles: Particle[] = []
  let raf = 0
  let last = 0
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = width * dpr
    canvas.height = height * dpr
    cx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    cx?.clearRect(0, 0, width, height)
    for (const p of particles) step(p, dt, now)
    particles = particles.filter((p) => alive(p, height))
    if (cx) for (const p of particles) draw(cx, p, now)
    raf = particles.length ? requestAnimationFrame(frame) : 0
    if (!raf) onIdle()
  }
  resize()
  window.addEventListener('resize', resize)
  return {
    spawn(next) {
      particles.push(...next)
      if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    },
    running: () => raf !== 0,
    size: () => ({ width, height }),
    clear() {
      particles = []
      cancelAnimationFrame(raf)
      raf = 0
      cx?.clearRect(0, 0, width, height)
    },
    destroy() {
      this.clear()
      window.removeEventListener('resize', resize)
    },
  }
}
