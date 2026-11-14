/**
 * Prints the output size table (modules/image/provider/output-size.ts) with each size's output
 * tokens next to its tier's square, and fails if any size breaks the rules of ARCHITECTURE §8.1:
 * edges multiples of 16, long:short ≤ 3:1, and tokens ≤ the square on every model and quality
 * OpenAI's calculator lists (formula in output-tokens.ts). Also sweeps photo ratios for
 * 'original'. Run after changing the table or the token formula:
 *
 *   pnpm tsx scripts/check-output-sizes.ts
 */
import { RESOLUTIONS } from '../src/core/templates/output-options'
import { OUTPUT_SIZES, outputSize, TIER_EDGE, withinSquareTokens } from '../src/modules/image/provider/output-size'
import { outputTokens } from '../src/modules/image/provider/output-tokens'

type Size = { width: number; height: number }

function problems({ width, height }: Size, edge: number): string[] {
  const out: string[] = []
  if (width % 16 || height % 16) out.push('edge not a multiple of 16')
  if (Math.max(width, height) / Math.min(width, height) > 3) out.push('ratio over 3:1')
  if (width * height > edge * edge) out.push('more pixels than the square')
  if (!withinSquareTokens(width, height, edge)) out.push('more tokens than the square')
  return out
}

let failures = 0
for (const resolution of RESOLUTIONS) {
  const edge = TIER_EDGE[resolution]
  const square = outputTokens('gpt-image-2.5', edge, edge, 'high')
  process.stdout.write(`\n${resolution} (square ${edge}², high ${square} tokens)\n`)
  for (const [aspect, text] of Object.entries(OUTPUT_SIZES[resolution])) {
    const size = outputSize(resolution, aspect)
    const issues = problems(size, edge)
    failures += issues.length
    const tokens = outputTokens('gpt-image-2.5', size.width, size.height, 'high')
    process.stdout.write(`  ${aspect.padEnd(5)} ${text.padEnd(10)} high ${String(tokens).padStart(5)}  ${issues.join(', ') || 'ok'}\n`)
  }
  for (let i = 0; i <= 400; i += 1) {
    const ratio = Math.exp(Math.log(1 / 3) + (i * Math.log(9)) / 400)
    const issues = problems(outputSize(resolution, 'original', { width: Math.round(ratio * 10_000), height: 10_000 }), edge)
    failures += issues.length
  }
}
process.stdout.write(failures === 0 ? '\nAll sizes pass.\n' : `\n${failures} problem(s).\n`)
process.exit(failures === 0 ? 0 : 1)
