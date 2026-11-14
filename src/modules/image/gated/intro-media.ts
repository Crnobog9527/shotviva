// The demos' pictures: real outputs from /cases and the home page, cut to 240×300 webp in
// /public/intros (about 7 KB each) so an intro loads fast on a phone. Transparent cut-outs are
// shown on white, the way the "white background" download gives them.
const src = (name: string) => `/intros/${name}.webp`

export type Pair = { phone: string; result: string }

// Batch: five product photos, one white-background result each; the rest of the 30 is a count.
export const BATCH_PAIRS: readonly Pair[] = ['dress', 'sneaker', 'tote', 'speaker', 'coat'].map((item) => ({ phone: src(`${item}-phone`), result: src(`${item}-white`) }))

// Several templates: the same three templates (white background, lifestyle scene, promo poster)
// on two product photos, so every column really is one template.
export const TEMPLATE_KEYS = ['white', 'scene', 'promo'] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]

export type MatrixRow = { phone: string; results: Record<TemplateKey, string> }

export function matrixRows(locale: string): MatrixRow[] {
  const promoSneaker = locale === 'zh' ? 'sneaker-promo-zh' : 'sneaker-promo-en'
  return [
    { phone: src('sneaker-phone'), results: { white: src('sneaker-white'), scene: src('sneaker-scene'), promo: src(promoSneaker) } },
    { phone: src('tote-phone'), results: { white: src('tote-white'), scene: src('tote-scene'), promo: src('tote-promo') } },
  ]
}

// When each phase of a demo begins (ms), see usePlayback.
// Batch: photos arrive, the template is chosen, results develop, the ZIP is ready.
export const BATCH_STARTS = [200, 1500, 2300, 5000] as const
// Matrix: photos and templates arrive, the cells develop one by one, the total is shown.
export const CELL_STAGGER = 220
export const matrixStarts = (cells: number) => [200, 900, 900 + cells * CELL_STAGGER + 700] as const

// The guide's "Example results" row, five finished results per tab: the batch's white
// backgrounds, then the templates' three looks on the sneaker and two on the tote.
export function sampleResults(tab: 'batch' | 'templates', locale: string): string[] {
  if (tab === 'batch') return BATCH_PAIRS.map((pair) => pair.result)
  const [sneaker, tote] = matrixRows(locale)
  return [sneaker!.results.white, sneaker!.results.scene, sneaker!.results.promo, tote!.results.scene, tote!.results.promo]
}
