// The series cards' crossfade, as plain DOM (series-card.tsx draws the markup, marketing.css the
// fade). Kept free of React so it is testable on its own and costs the marketing pages a few
// hundred bytes. One transition only: the next pair fades in over the current one, which stays
// opaque under it, so a frame is never half empty; going back to the first pair, the top layer
// fades out over it.

export const FADE_MS = 700
// On a layer that may load its pictures (marketing.css shows only these).
export const LOADING_CLASS = 'mk-ld'
// How long a pair rests: quicker under a resting pointer, gentler when it plays on its own in view.
export const HOVER_HOLD_MS = 1500
export const VIEW_HOLD_MS = 2600
// A pointer passing over a card on its way elsewhere does not start it.
export const HOVER_DELAY_MS = 220

// Every <img> of a layer settled: loaded and decoded, or failed. A complete image is settled
// even when it is broken (naturalWidth 0): its load and error events have already fired, so
// waiting for them would stop the card for good; it shows whatever it has instead.
function ready(layer: Element): Promise<unknown> {
  return Promise.all(
    [...layer.querySelectorAll('img')].map((img) =>
      img.complete
        ? img.decode().catch(() => undefined)
        : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true })
            img.addEventListener('error', resolve, { once: true })
          }),
    ),
  )
}

export type Cycler = { start(delay: number, hold: number): void; stop(): void }
type Schedule = (run: () => void, ms: number) => number
type Cancel = (id: number) => void

// One card's frame: index 0 is the server-drawn pair under the layers, 1..n the layers.
export function cycler(
  frame: HTMLElement,
  schedule: Schedule = (run, ms) => window.setTimeout(run, ms),
  cancel: Cancel = (id) => window.clearTimeout(id),
): Cycler {
  const layers = [...frame.querySelectorAll<HTMLElement>('.mk-sl')]
  // A layer joins the layout (still transparent) only just before its turn, so its lazy images
  // load then: one pair ahead, not the whole series the moment the card is armed. From mainland
  // China, where the site moves a few KB/s, arming every layer at once queued all of a series'
  // pictures on the first view of /zh (2026-11-12).
  const arm = (layer: number) => layers[layer]?.classList.add(LOADING_CLASS)
  let index = 0
  let timer: number | undefined
  let run = 0

  const show = (next: number) => {
    const current = layers[index - 1]
    const incoming = layers[next - 1]
    if (incoming) {
      // The outgoing layer holds still under the incoming one, and drops out once covered.
      if (current) {
        current.classList.replace('mk-on', 'mk-was')
        schedule(() => current.classList.remove('mk-was'), FADE_MS)
      }
      incoming.classList.add('mk-on')
    } else current?.classList.remove('mk-on')
    index = next
  }

  const step = async (hold: number, token: number) => {
    const next = (index + 1) % (layers.length + 1)
    arm(next - 1)
    if (next > 0) await ready(layers[next - 1] as HTMLElement)
    // The one after starts loading while this one rests.
    arm(next)
    if (token !== run) return
    if (!document.hidden) show(next)
    timer = schedule(() => void step(hold, token), hold + FADE_MS)
  }

  return {
    start(delay, hold) {
      if (!layers.length || timer !== undefined) return
      const token = ++run
      // Armed: the first layer starts loading now; each later one a turn ahead (arm above).
      frame.classList.add('mk-armed')
      arm(0)
      timer = schedule(() => void step(hold, token), delay)
    },
    stop() {
      run++
      if (timer !== undefined) cancel(timer)
      timer = undefined
    },
  }
}
