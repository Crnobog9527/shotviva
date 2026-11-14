import { describe, expect, it, vi } from 'vitest'

import type { GenerationProvider, ImageRequestOptions, ProviderInput } from '@/core/jobs'
import type { EditParams } from '@/core/templates'

import { arkRequest } from '../provider/ark-image-provider'
import type { EditClassification } from './classify-scope'
import { editProviderCall, editRoute, type EditPipeline } from './edit-pipeline'

const ARK_LINE = '00000000-0000-4000-8000-0000000000a1'
const params: EditParams = {
  input_fidelity: 'high',
  classifier: 'c',
  constraints: { object: 'C-OBJECT', background: '', style: '', subject: '', global: '', fallback: 'C-FALLBACK' },
  reframe: 'REFRAME',
}
const pipeline = (providerId: string | null): EditPipeline => ({
  template: { id: 'edit', quality: 'medium' } as EditPipeline['template'],
  prompt: { body: 'WRAPPER', styleRefs: [], version: 3, providerId, modelParams: params },
  params,
})
const decision: EditClassification = { scope: 'object', confidence: 0.9, keep: ['mug'], change: 'x', usage: null, identitySwap: false }
const source = { bytes: new Uint8Array([1, 2]), contentType: 'image/jpeg' as const, width: 1536, height: 1024 }
const provider = (id: string): GenerationProvider => ({ id, generate: vi.fn() })

describe('editRoute', () => {
  it('asks the resolver for the edit template’s bound line with the one source image', async () => {
    const resolve = vi.fn(async (id: string | null, request: ImageRequestOptions) => (void request, provider(`${id}/doubao-seedream-5-5`)))
    const route = await editRoute(resolve, pipeline(ARK_LINE), { resolution: '2k', aspectRatio: '4:3' })
    expect(route.id).toBe(`${ARK_LINE}/doubao-seedream-5-5`)
    expect(resolve).toHaveBeenCalledWith(ARK_LINE, { resolution: '2k', aspectRatio: '4:3', referenceCount: 1, tierFallback: true })
  })

  it('follows the default line when the edit template has no binding', async () => {
    const resolve = vi.fn(async () => provider('default/gpt'))
    expect((await editRoute(resolve, pipeline(null), { resolution: '1k', aspectRatio: 'original' })).id).toBe('default/gpt')
    expect(resolve).toHaveBeenCalledWith(null, { resolution: '1k', aspectRatio: 'original', referenceCount: 1, tierFallback: true })
  })

  it('refuses a line that cannot take the source image before anything is charged', async () => {
    const textOnly = async () => ({ ...provider('x/text-only'), maxReferences: 0 })
    await expect(editRoute(textOnly, pipeline(ARK_LINE), { resolution: '1k', aspectRatio: '1:1' })).rejects.toMatchObject({ code: 'REFERENCE_IMAGE_LIMIT' })
  })
})

describe('an edit on the Ark line', () => {
  const call = (resolution: '1k' | '2k' | '4k', aspect: string, reframed = false): ProviderInput => ({
    ...editProviderCall(pipeline(ARK_LINE), decision, { image: source, instruction: 'make the mug red', aspect, reframed, resolution }),
    signal: new AbortController().signal,
  })

  it('sends the source as the input image, the composed prompt and no OpenAI-only field', () => {
    const body = arkRequest('doubao-seedream-5-5-261028', call('2k', '4:3'))
    expect(body.image).toBe(`data:image/jpeg;base64,${Buffer.from([1, 2]).toString('base64')}`)
    expect(body.prompt).toBe('WRAPPER\n\nC-OBJECT Keep unchanged: mug.\n\nmake the mug red')
    expect(body).not.toHaveProperty('input_fidelity')
    expect(body).not.toHaveProperty('quality')
    expect(body.size).toMatch(/^\d+x\d+$/)
  })

  it('appends the reframe paragraph and sizes “original” from the source work', () => {
    const reframed = arkRequest('m', call('1k', '1:1', true))
    expect(reframed.prompt.endsWith('\n\nREFRAME')).toBe(true)
    const [width, height] = arkRequest('m', call('1k', 'original')).size.split('x').map(Number)
    expect(width! / height!).toBeCloseTo(1536 / 1024, 1)
  })

  it('has no 4K tier: the adapter refuses it (routing sends 4K edits to the default line first)', () => {
    expect(() => arkRequest('m', call('4k', '1:1'))).toThrow(/no 4k tier/)
  })
})
