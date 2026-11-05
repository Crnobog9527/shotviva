import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import type { Job } from '../jobs'
import type { ObjectStore } from '../storage'
import type { Template } from '../templates'
import type { JobResponse, PartnerTemplate } from './partner-types'

// Partner image URLs are signed for 7 days, R2's presign maximum (ARCHITECTURE §8.3), so a
// Graylum conversation opened the next day still shows the picture.
export const PARTNER_IMAGE_URL_SECONDS = 7 * 24 * 60 * 60

export async function partnerImageUrl(store: ObjectStore, job: Pick<Job, 'status' | 'outputKey'>): Promise<string | null> {
  if (job.status !== 'succeeded' || !job.outputKey) return null
  return store.presignGet(job.outputKey, { expiresInSeconds: PARTNER_IMAGE_URL_SECONDS })
}

// What the job cost the user in the end: a failed job was refunded.
export const creditsCharged = (job: Pick<Job, 'status' | 'creditsCost'>) => (job.status === 'failed' ? 0 : job.creditsCost)

export const partnerFailureCode = (errorCode: string | null) =>
  errorCode === 'CONTENT_REJECTED' ? ('content_rejected' as const) : ('generation_failed' as const)

export function toJobResponse(job: Job, imageUrl: string | null): JobResponse {
  return {
    job_id: job.id,
    status: job.status,
    template_id: job.templateId,
    image_url: imageUrl,
    credits_charged: creditsCharged(job),
    error: job.status === 'failed' ? partnerFailureCode(job.errorCode) : null,
    created_at: job.createdAt.toISOString(),
    finished_at: job.finishedAt?.toISOString() ?? null,
  }
}

export function toPartnerTemplate(template: Template): PartnerTemplate {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    cover_before_url: template.coverBeforeUrl || null,
    cover_after_url: template.coverAfterUrl || null,
    credits_cost: template.creditsCost,
    fields: {
      images: template.fields.images,
      copy: template.fields.copy.map((field) => ({
        key: field.key,
        label: field.label,
        required: field.required,
        max_length: field.maxLength,
      })),
      aspect_ratios: template.fields.aspectRatios,
    },
  }
}

export type PartnerProfile = { credits: number; freeCredits: number; paidUntil: string | null }

const profileRow = z.object({
  credits: z.number().int(),
  // Added by T14's two-pool migration; until then every credit is in `credits`.
  free_credits: z.number().int().optional(),
  paid_until: z.string().nullable(),
})

// Whole row on purpose: naming free_credits in the select would fail before T14's migration.
export async function partnerProfile(db: SupabaseClient, userId: string): Promise<PartnerProfile> {
  const { data, error } = await db.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw new AppError('INTERNAL', `partner profile lookup failed: ${error.message}`)
  if (!data) throw new AppError('NOT_FOUND', 'Account not found')
  const row = profileRow.parse(data)
  return {
    credits: row.credits,
    freeCredits: row.free_credits ?? 0,
    paidUntil: row.paid_until === null ? null : new Date(row.paid_until).toISOString(),
  }
}

// "Connected as j***@gmail.com" without handing Graylum the full address.
export function maskEmail(email: string | null | undefined): string {
  if (!email) return 'Shotviva account'
  const at = email.lastIndexOf('@')
  if (at < 1) return 'Shotviva account'
  return `${email[0]}***${email.slice(at)}`
}

export async function partnerDisplayName(db: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await db.auth.admin.getUserById(userId)
  if (error) throw new AppError('INTERNAL', `partner display name lookup failed: ${error.message}`)
  return maskEmail(data.user?.email)
}
