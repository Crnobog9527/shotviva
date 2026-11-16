import 'server-only'

import sharp from 'sharp'

import { pickVessel, readVesselBytes, type DishwareItem } from '../../dishware'
import { logger } from '../../logger'
import type { InputImage, ObjectStore } from '../../storage'
import { PROMPT_MAX_LENGTH, renderPrompt, type GenerationInputs } from '../../templates'
import type { FoodFlowPrompts } from '../../templates/food-flow'
import type { ProviderImage, ProviderInput, ProviderPrices } from '../provider'
import { chooseFoodFlow, isLibraryCategory, type FoodChoice, type FoodToggles } from './plan'
import { dishText, userDishName, type DishReader, type DishReaderUsage, type DishReading } from './reading'

// The flow step of a food template's job (ARCHITECTURE §5.1c「餐饮开关的出图流程」), run once the
// job's credits (or a test run's budget) are held: read the dish, pick a vessel, and turn the
// ordinary call into the chosen flow's. It never fails the job: anything that goes wrong leaves
// the ordinary call, rendered with both toggles off (flow 1).

export type FoodDeps = {
  // Built only for a job that runs a flow: it reads the decision row's key.
  reader: () => Promise<DishReader | null>
  // The active library; the route reads it cached, the trial script straight.
  vessels: () => Promise<readonly DishwareItem[]>
  random?: (n: number) => number
  timeoutMs?: number
  // Told which flow each job ran and why it fell back (templates:trial prints it per run).
  onOutcome?: (report: FoodReport) => void
}

export type FoodReport = { flow: FoodChoice['kind']; fallback: FoodChoice['fallback'] | null; readError: string | null }

export const DISH_READ_TIMEOUT_MS = 20_000
// Enough to count garnish and see the skin's colour; a few hundred input tokens.
const READ_EDGE = 1024

export type FoodPlan = { prompts: FoodFlowPrompts; toggles: FoodToggles }
type Call = Omit<ProviderInput, 'signal'>
export type FoodOutcome = {
  call: Call; usage: DishReaderUsage | null; prices?: ProviderPrices | null; choice: FoodChoice
  vesselId?: string | undefined; category?: string | undefined
  // Why the reading failed, when it did (shown by templates:trial).
  readError?: string | undefined
}

async function photoDataUrl(photo: InputImage): Promise<string> {
  const jpeg = await sharp(photo.bytes).resize({ width: READ_EDGE, height: READ_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

// Why a reading failed, short and ours (adapters only put the status in their messages).
const failureOf = (error: unknown) => (error instanceof Error ? error.message : 'unknown').slice(0, 160)

async function readDish(food: FoodDeps, reader: DishReader | null, instructions: string, photo: InputImage, dishName: string) {
  if (!reader) return { error: 'no dish-reading or decision line switched on' }
  try {
    const signal = AbortSignal.timeout(food.timeoutMs ?? DISH_READ_TIMEOUT_MS)
    return await reader.read({ imageDataUrl: await photoDataUrl(photo), instructions, signal, ...(dishName ? { userDishName: dishName } : {}) })
  } catch (error) {
    logger.warn('food_flow.read_failed', { error })
    return { error: failureOf(error) }
  }
}

async function vesselFor(store: ObjectStore, food: FoodDeps, reading: DishReading | null, toggles: FoodToggles) {
  if (!reading || !toggles.tableware || !isLibraryCategory(reading.category)) return null
  try {
    const item = pickVessel(await food.vessels(), reading.category, food.random, reading.dishware)
    if (!item) return null
    const image: ProviderImage = { bytes: await readVesselBytes(store, item.imageKey), contentType: 'image/webp', width: item.width, height: item.height }
    return { item, image }
  } catch (error) {
    logger.warn('food_flow.vessel_unavailable', { error })
    return null
  }
}

// The fixed sizes 'original' can stand for once the photo is not the first image: the closest one
// to the photo's ratio (tall poster sizes are never a dish photo's).
const PHOTO_ASPECTS = ['16:9', '3:2', '4:3', '1:1', '4:5', '2:3', '9:16'] as const
export function nearestAspect(width: number, height: number): string {
  const target = Math.log(width / height)
  const distance = (aspect: string) => {
    const [w, h] = aspect.split(':').map(Number) as [number, number]
    return Math.abs(Math.log(w / h) - target)
  }
  return PHOTO_ASPECTS.reduce((best, aspect) => (distance(aspect) < distance(best) ? aspect : best))
}

type Parts = { photo: InputImage; vessel: { item: DishwareItem; image: ProviderImage } | null; refs: ProviderImage[]; reading: DishReading }

function flowImages(kind: FoodChoice['kind'], parts: Parts): ProviderImage[] {
  const vessel = parts.vessel ? [parts.vessel.image] : []
  if (kind === 'dishware') return [parts.photo, ...vessel, ...parts.refs]
  if (kind === 'plating_vessel') return [...vessel, ...parts.refs]
  return parts.refs
}

function flowBody(prompts: FoodFlowPrompts, kind: FoodChoice['kind']): string | undefined {
  if (kind === 'dishware') return prompts.dishware
  if (kind === 'plating_vessel') return prompts.plating_vessel
  return kind === 'plating' ? prompts.plating : undefined
}

// The chosen flow's call, or null when its body is missing or renders too long.
function flowCall(base: Call, prompts: FoodFlowPrompts, choice: FoodChoice, parts: Parts, inputs: GenerationInputs): Call | null {
  const body = flowBody(prompts, choice.kind)
  if (!body) return null
  const images = flowImages(choice.kind, parts)
  const photoCount = images.length - parts.refs.length
  const copy = { ...inputs.copy, food_dish: dishText(parts.reading), food_dishware: parts.reading.dishware, food_vessel: parts.vessel?.item.shape ?? '' }
  const text = renderPrompt(body, { ...inputs, copy, toggles: {} }, {}, { photo_count: photoCount, style_ref_count: parts.refs.length })
  if (text.length > PROMPT_MAX_LENGTH) return null
  // Without the photo first, 'original' would follow the vessel or the cover: pin the photo's ratio.
  const followsPhoto = choice.kind !== 'dishware' && base.aspectRatio === 'original'
  const aspectRatio = followsPhoto ? nearestAspect(parts.photo.width, parts.photo.height) : base.aspectRatio
  return { ...base, prompt: text, images, photoCount, aspectRatio }
}

const FLOW_1: FoodChoice = { kind: 'both_off', fallback: 'read_failed' }

// The reading, the vessel and the choice, before any call is built.
async function decide(store: ObjectStore, food: FoodDeps, plan: FoodPlan, photo: InputImage, dishName: string) {
  const reader = await food.reader()
  const read = await readDish(food, reader, plan.prompts.read, photo, dishName)
  const reading = 'reading' in read ? read.reading : null
  const vessel = await vesselFor(store, food, reading, plan.toggles)
  const choice = chooseFoodFlow(plan.toggles, reading, vessel !== null)
  const facts = { usage: 'usage' in read ? read.usage : null, prices: reader?.prices ?? null, category: reading?.category,
    vesselId: vessel?.item.id, readError: 'error' in read ? read.error : undefined }
  return { reading, vessel, choice, facts }
}

// `base`: the ordinary call with both toggles off, its images the photo then the references.
export async function runFoodFlow(deps: { store: ObjectStore; food?: FoodDeps | null }, plan: FoodPlan, base: Call, photos: readonly InputImage[], inputs: GenerationInputs): Promise<FoodOutcome> {
  const refs = base.images.slice(photos.length)
  const [photo] = photos
  // Every flow puts the dish into the cover; without a reference (or a photo) there is nothing to edit.
  if (!deps.food || !photo || refs.length === 0) return { call: base, usage: null, choice: FLOW_1 }
  const { reading, vessel, choice, facts } = await decide(deps.store, deps.food, plan, photo, userDishName(inputs.copy))
  if (!reading || choice.kind === 'both_off') return { ...facts, choice, call: base }
  const call = flowCall(base, plan.prompts, choice, { photo, vessel, refs, reading }, inputs)
  return call ? { ...facts, choice, call } : { ...facts, choice: FLOW_1, call: base }
}
