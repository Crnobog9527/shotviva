import { describe, expect, it, vi } from 'vitest'

import { jpeg } from '../../../../tests/fakes/images'
import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import type { DishwareItem } from '../../dishware/types'
import type { GenerationInputs } from '../../templates'
import type { ProviderImage, ProviderInput } from '../provider'
import type { DishReader, DishReading } from './reading'
import { nearestAspect, runFoodFlow, type FoodDeps, type FoodPlan } from './run'
import { foodStep, withReadCost } from './step'

// Fake prompts only (ARCHITECTURE §5.1c: the real ones are private).
const PROMPTS = {
  read: 'READ',
  dishware: 'DISHWARE {{photo_count}}+{{style_ref_count}}',
  plating: 'PLATING [{{food_dish}}] in [{{food_dishware}}]',
  plating_vessel: 'VESSEL [{{food_dish}}] in [{{food_vessel}}]',
}
const READING: DishReading = {
  dish_name: 'Fish', main_ingredients: [{ name: 'fish', color: 'silver' }], sauce: 'soy', garnish: [],
  dishware: 'white oval plate', category: 'long',
}
const VESSEL: DishwareItem = {
  id: '00000000-0000-4000-8000-0000000000a1', label: 'long-a', category: 'long', shape: 'teardrop platter',
  imageKey: 'dishware/00000000-0000-4000-8000-0000000000a1-0123456789abcdef.webp', width: 1024, height: 683, isActive: true,
}
const inputs: GenerationInputs = { copy: {}, aspectRatio: '2:3', note: '', toggles: { plating: false, tableware: false }, confirmed: [] }

async function setup(reading: DishReading | Error = READING, vessels: DishwareItem[] = [VESSEL]) {
  const r2 = createMemoryStore()
  const vesselBytes = await jpeg(32, 24)
  r2.upload(VESSEL.imageKey, vesselBytes, 'image/webp')
  const photo = { bytes: await jpeg(1600, 1200), contentType: 'image/jpeg' as const, width: 1600, height: 1200 }
  const cover: ProviderImage = { bytes: Uint8Array.of(7), contentType: 'image/webp', width: 10, height: 15 }
  const read = vi.fn<DishReader['read']>(async () => {
    if (reading instanceof Error) throw reading
    return { reading, usage: { inputTokens: 900, outputTokens: 120 } }
  })
  const reader: DishReader = { tag: 'judge/luna', prices: { inputTextPerM: 0.1, inputImagePerM: null, outputPerM: 0.5 }, read }
  const food: FoodDeps = { reader: async () => reader, vessels: async () => vessels, random: () => 0 }
  const base: Omit<ProviderInput, 'signal'> = {
    prompt: 'BOTH-OFF', images: [photo, cover], photoCount: 1, aspectRatio: '2:3', resolution: '1k', quality: 'medium', params: {},
  }
  return { deps: { store: r2.store, food }, base, photo, cover, vesselBytes, read }
}

const plan = (plating: boolean, tableware: boolean): FoodPlan => ({ prompts: PROMPTS, toggles: { plating, tableware } })

describe('the food flows (§5.1c)', () => {
  it('tableware only: photo, library vessel, cover, in that order, one call, no dish description', async () => {
    const { deps, base, photo, cover, vesselBytes, read } = await setup()
    const out = await runFoodFlow(deps, plan(false, true), base, [photo], inputs)
    expect(out.choice).toEqual({ kind: 'dishware' })
    expect(out.call.images.map((image) => image.bytes)).toEqual([photo.bytes, vesselBytes, cover.bytes])
    expect(out.call).toMatchObject({ prompt: 'DISHWARE 2+1', photoCount: 2, aspectRatio: '2:3' })
    expect(out).toMatchObject({ vesselId: VESSEL.id, category: 'long', usage: { inputTokens: 900, outputTokens: 120 } })
    expect(read.mock.calls[0]?.[0].imageDataUrl).toMatch(/^data:image\/jpeg;base64,/)
    expect(read.mock.calls[0]?.[0].instructions).toBe('READ')
  })

  it('plating only: never sends the photo, describes the dish and the user dishware', async () => {
    const { deps, base, photo, cover } = await setup()
    const out = await runFoodFlow(deps, plan(true, false), base, [photo], inputs)
    expect(out.choice).toEqual({ kind: 'plating' })
    expect(out.call.images).toEqual([cover])
    expect(out.call.prompt).toBe('PLATING [Fish Main ingredients: fish (silver). Sauce: soy.] in [white oval plate]')
    expect(out.call.photoCount).toBe(0)
  })

  it('both on: vessel then cover, the vessel shape from the library', async () => {
    const { deps, base, photo, cover, vesselBytes } = await setup()
    const out = await runFoodFlow(deps, plan(true, true), base, [photo], inputs)
    expect(out.call.images.map((image) => image.bytes)).toEqual([vesselBytes, cover.bytes])
    expect(out.call.prompt).toContain('in [teardrop platter]')
  })

  it('pins the photo ratio when the photo is not the first image and the user asked for its own size', async () => {
    const { deps, base, photo } = await setup()
    const out = await runFoodFlow(deps, plan(true, false), { ...base, aspectRatio: 'original' }, [photo], { ...inputs, aspectRatio: 'original' })
    expect(out.call.aspectRatio).toBe('4:3')
    const kept = await runFoodFlow(deps, plan(false, true), { ...base, aspectRatio: 'original' }, [photo], { ...inputs, aspectRatio: 'original' })
    expect(kept.call.aspectRatio).toBe('original')
    expect(nearestAspect(1080, 1920)).toBe('9:16')
  })

  it('a failed reading leaves the ordinary call (flow 1) and costs nothing extra', async () => {
    const { deps, base, photo } = await setup(new Error('openai responses 400'))
    const out = await runFoodFlow(deps, plan(true, true), base, [photo], inputs)
    expect(out).toMatchObject({ call: base, usage: null, choice: { kind: 'both_off', fallback: 'read_failed' } })
  })

  it('an unclassifiable dish or an empty category keeps the user dishware', async () => {
    const { deps, base, photo } = await setup({ ...READING, category: 'unclassifiable' })
    expect((await runFoodFlow(deps, plan(false, true), base, [photo], inputs)).call).toBe(base)
    const both = await runFoodFlow(deps, plan(true, true), base, [photo], inputs)
    expect(both.choice).toEqual({ kind: 'plating', fallback: 'unclassifiable' })
    const empty = await setup(READING, [])
    expect((await runFoodFlow(empty.deps, plan(true, true), empty.base, [empty.photo], inputs)).choice).toEqual({ kind: 'plating', fallback: 'no_vessel' })
  })

  it('without the cover reference or a reader there is nothing to run', async () => {
    const { deps, base, photo, read } = await setup()
    const bare = { ...base, images: [photo] }
    expect((await runFoodFlow(deps, plan(true, false), bare, [photo], inputs)).call).toBe(bare)
    expect(read).not.toHaveBeenCalled()
    const none = await runFoodFlow({ ...deps, food: { ...deps.food, reader: async () => null } }, plan(true, false), base, [photo], inputs)
    expect(none.choice).toEqual({ kind: 'both_off', fallback: 'read_failed' })
  })
})

describe('the food step', () => {
  it('adds the reading to the screen tokens at the decision prices, and leaves a plan-less call alone', async () => {
    const { deps, base, photo } = await setup()
    const screen = { usage: { decision_input_tokens: 50, decision_output_tokens: 2 }, prices: null }
    const step = await foodStep(deps, plan(true, false), { call: base, photos: [photo], inputs, decision: screen }, { templateId: 't', runId: 'r' })
    expect(step.decision?.usage).toEqual({ decision_input_tokens: 950, decision_output_tokens: 122 })
    expect(await foodStep(deps, null, { call: base, photos: [photo], inputs }, { templateId: 't', runId: 'r' })).toEqual({ call: base, decision: undefined })
    expect(withReadCost(undefined, { inputTokens: 1, outputTokens: 2 }, null)).toEqual({ usage: { decision_input_tokens: 1, decision_output_tokens: 2 }, prices: null })
  })

  it('never throws once credits are held: an unexpected error sends the ordinary call', async () => {
    const { deps, base, photo } = await setup()
    const broken = { ...deps, food: { ...deps.food, reader: async () => { throw new Error('vault down') } } }
    const step = await foodStep(broken, plan(true, true), { call: base, photos: [photo], inputs }, { templateId: 't', runId: 'r' })
    expect(step.call).toBe(base)
  })
})
