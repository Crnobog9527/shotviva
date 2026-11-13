import { describe, expect, it, vi } from 'vitest'

import { layOnMatte } from './compress-image'

// A stand-in 2D context: just what layOnMatte reads and writes.
function context(pixels: number[]) {
  const fills: string[] = []
  const ctx = {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    getImageData: vi.fn(() => ({ data: Uint8ClampedArray.from(pixels) })),
    fillRect: vi.fn(() => fills.push(`${ctx.globalCompositeOperation}:${ctx.fillStyle}`)),
  }
  return { ctx, fills }
}

describe('layOnMatte (browser JPEG compression of a see-through upload)', () => {
  it('paints white behind a transparent dark logo, then restores normal drawing', () => {
    const { ctx, fills } = context([0, 0, 0, 0, 20, 30, 120, 255])
    layOnMatte(ctx as unknown as CanvasRenderingContext2D, 2, 1)
    expect(fills).toEqual(['destination-over:rgb(255, 255, 255)'])
    expect(ctx.globalCompositeOperation).toBe('source-over')
  })

  it('leaves an opaque image alone', () => {
    const { ctx, fills } = context([20, 30, 120, 255, 1, 2, 3, 255])
    layOnMatte(ctx as unknown as CanvasRenderingContext2D, 2, 1)
    expect(fills).toEqual([])
  })
})
