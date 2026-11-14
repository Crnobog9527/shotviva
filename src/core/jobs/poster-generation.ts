import 'server-only'

import { AppError } from '../errors'
import { requireFeature } from '../features'
import { partText } from '../poster'
import { pasteUserQr, readUserQr } from '../poster/qr-paste'
import { QR_PLACEHOLDER_INSTRUCTION, type QrFallback } from '../poster/qr-placeholder'
import { loadPosterPart, POSTER_FEATURE } from '../poster/sets'
import { qrFallbackFor, type PosterFields } from '../poster/template'
import { copyBackKeptInputs, loadInputImage } from '../storage'
import { DEFAULT_RESOLUTION, type GenerationInputs, type Resolution, type Template } from '../templates'
import { keptSlotIndex, storedSlotOrder } from '../templates/image-slots'
import type { GenerationRequest } from './generation-request'
import { findOwnJob } from './job-lookup'
import { keptInputsOf } from './kept-inputs'
import type { GenerationDeps } from './run-generation'

// The poster side of a generation request (ARCHITECTURE §5.3): the confirmed text of one page of
// the caller's saved set, the image slots that page may take, and a redraw's source.

// A poster template writes its text from the caller's own saved set (ARCHITECTURE §5.3), never
// from text the browser sends; every other template refuses a poster reference.
export async function posterPart(deps: GenerationDeps, req: GenerationRequest, template: Template, inputs: Pick<GenerationInputs, 'aspectRatio' | 'slots' | 'pasted'>) {
  const { aspectRatio } = inputs
  if (!template.fields.poster) {
    if (req.poster) throw new AppError('INVALID_INPUT', 'This template does not make posters')
    return null
  }
  const resolution = posterResolution(req)
  await (deps.allowPoster ?? ((userId: string) => requireFeature(userId, POSTER_FEATURE)))(req.userId)
  const { setId, part: index, redrawOf } = req.poster as NonNullable<GenerationRequest['poster']>
  const { content, part } = await loadPosterPart(deps.db, req.userId, { setId, part: index, templateId: template.id })
  assertPageSlots(template.fields.poster, part.kind, [...(inputs.slots ?? []), ...(inputs.pasted ?? [])])
  if (redrawOf) await assertSamePoster(deps, req.userId, redrawOf, { setId, part: index, templateId: template.id, resolution, aspectRatio })
  const qr = posterQr(template.fields.poster, part.kind, inputs.pasted)
  const record = { set_id: setId, part: index, kind: part.kind, page: part.page, pages: part.pages, ...(redrawOf ? { redraw_of: redrawOf } : {}), ...(qr ? { qr: true } : {}) }
  const text = partText(content, part)
  return { text: qr ? `${text}\n\n${QR_PLACEHOLDER_INSTRUCTION}` : text, record, qr }
}

// The user's QR code on this page (ARCHITECTURE §5.3 「二维码」): its upload and the page's fixed
// spot, or null when the template has none or the user uploaded none.
export type PosterQrJob = { upload: string; fallback: QrFallback }

function posterQr(poster: PosterFields, kind: string, pasted: GenerationInputs['pasted']): PosterQrJob | null {
  const upload = poster.qr ? pasted?.find((slot) => slot.key === poster.qr?.slot)?.upload : undefined
  return poster.qr && upload ? { upload, fallback: qrFallbackFor(poster.qr, kind) } : null
}

// Read before any credit moves: an upload without a readable code is refused (422), never pasted.
// What it returns pastes the code onto the finished poster; it throws when the pasted code does
// not read back, which fails the job and refunds it.
export async function posterQrFinisher(deps: Pick<GenerationDeps, 'store'>, qr: PosterQrJob) {
  const image = await loadInputImage(deps.store, qr.upload)
  const code = await readUserQr(image.bytes)
  if (!code) throw new AppError('INVALID_INPUT', 'The QR code could not be read; please upload a clearer one')
  return async (bytes: Uint8Array) => (await pasteUserQr(bytes, code, qr.fallback)).bytes
}

// A poster job comes from the website with its set, at any tier the template sells (ARCHITECTURE
// §5.3; 1K is sold too, the price check refuses a tier the template does not price).
function posterResolution(req: GenerationRequest): Resolution {
  if (!req.poster || req.source !== 'web') throw new AppError('INVALID_INPUT', 'Confirm the poster text first')
  return req.resolution ?? DEFAULT_RESOLUTION
}

type SamePoster = { setId: string; part: number; templateId: string; resolution: string; aspectRatio: string }

// A redraw names a finished poster of the caller's: the same set, poster and template, at the
// same resolution and size (a free redraw can never be an upgrade).
async function assertSamePoster(deps: GenerationDeps, userId: string, jobId: string, same: SamePoster) {
  const source = await findOwnJob(deps.db, userId, jobId)
  const poster = source?.inputs.poster as { set_id?: unknown; part?: unknown } | undefined
  const matches = source?.status === 'succeeded' && source.templateId === same.templateId && poster?.set_id === same.setId
    && poster.part === same.part && source.inputs.resolution === same.resolution && source.inputs.aspect_ratio === same.aspectRatio
  if (!matches) throw new AppError('INVALID_INPUT', 'Unknown poster to redraw')
}

// An image slot belongs to the page whose kind lists it (the prize photo goes to the prize page
// only), so another page never draws someone's prize photo.
// The QR code goes with every page.
export function assertPageSlots(poster: PosterFields | undefined, kind: string, slots: GenerationInputs['slots']) {
  const allowed = [...(poster?.kinds.find((item) => item.key === kind)?.slots ?? []), ...(poster?.qr ? [poster.qr.slot] : [])]
  if ((slots ?? []).some((slot) => !allowed.includes(slot.key))) throw new AppError('INVALID_INPUT', 'This page takes no such image')
}

// A redraw sends no uploads: the source poster's kept copies (T40) come back as fresh uploads in
// the same slots, so a redrawn prize page shows the same prize photo. None kept: none sent.
export async function redrawSlots(deps: GenerationDeps, req: GenerationRequest, template: Template): Promise<Record<string, string> | undefined> {
  const redrawOf = req.poster?.redrawOf
  if (!template.fields.poster || !redrawOf) return undefined
  const source = await findOwnJob(deps.db, req.userId, redrawOf)
  const kept = source ? keptInputsOf(source) : []
  if (!source || kept.length === 0) return undefined
  const order = storedSlotOrder(source.inputs.input_slots)
  const restored = await copyBackKeptInputs(deps.store, { userId: req.userId, jobId: source.id }, kept)
  const entries = restored.flatMap((photo, i) => {
    const slot = order[keptSlotIndex(kept[i]!) ?? -1]
    return slot ? [[slot, photo.inputKey] as const] : []
  })
  return entries.length ? Object.fromEntries(entries) : undefined
}
