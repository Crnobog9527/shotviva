import { z } from 'zod'

import { catalogPricingSchema } from './catalog-pricing'
import { resolutionSchema, withTierKeys } from './db-resolution'
import { OUTPUT_ASPECTS, RESOLUTIONS } from './output-options'

// OpenAI's Images edit endpoint takes up to 16 input images for GPT image models
// (https://developers.openai.com/api/reference/resources/images/methods/edit). Every photo slot
// and style reference goes to /images/edits as one image[] entry, so this is the whole count.
export const OPENAI_MAX_REFERENCES = 16

export const estimatedImageCostsSchema = withTierKeys(z.partialRecord(z.enum(RESOLUTIONS), z.number().positive().finite()))
export type EstimatedImageCosts = z.infer<typeof estimatedImageCostsSchema>

export const imageCapabilitiesSchema = withTierKeys(z.object({
  resolutions: z.array(resolutionSchema).min(1),
  aspectRatios: z.array(z.enum(OUTPUT_ASPECTS)).refine((values) => !values.includes('original')),
  providerAspectRatios: z.array(z.string().regex(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/)).optional(),
  originalRatio: z.boolean(),
  minReferences: z.number().int().nonnegative(),
  maxReferences: z.number().int().nonnegative(),
  // Where `resolutions` came from and the admin's narrower choice or declaration (PR-1b,
  // providers/tier-support.ts). Absent on snapshots written before: read as detected, no choice.
  resolutionSource: z.enum(['spec', 'catalog', 'declared', 'unknown']).optional(),
  resolutionLimit: z.array(resolutionSchema).min(1).optional(),
  catalogVersion: z.literal(1).optional(),
  catalogImageCosts: estimatedImageCostsSchema.optional(),
  catalogPricing: catalogPricingSchema.optional(),
  fetchedAt: z.iso.datetime({ offset: true }),
}).refine((caps) => caps.maxReferences >= caps.minReferences))
export type ImageCapabilities = z.infer<typeof imageCapabilitiesSchema>
