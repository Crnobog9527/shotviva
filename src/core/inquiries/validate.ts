import { z } from 'zod'

import {
  INQUIRY_NEEDS,
  INQUIRY_PLATFORMS,
  INQUIRY_USES,
  LIMITS,
  MONTHLY_VOLUMES,
  START_TIMES,
  TEAM_SIZES,
  type InquiryNeed,
  type InquiryPlatform,
  type InquiryUse,
  type MonthlyVolume,
  type StartTime,
  type TeamSize,
} from './rules'

// One validator for the browser (inline errors) and the server (the real check, AGENTS §4).
// Pure: no copy here, only an error code per field; the form words them.

export type InquiryValues = {
  name: string
  email: string
  company: string
  volume: MonthlyVolume | ''
  uses: InquiryUse[]
  message: string
  jobTitle: string
  website: string
  wechat: string
  phone: string
  teamSize: TeamSize | ''
  country: string
  platforms: InquiryPlatform[]
  needs: InquiryNeed[]
  startTime: StartTime | ''
  consent: boolean
}

export type InquiryField = keyof InquiryValues
export type FieldError = 'required' | 'chooseOne' | 'chooseAny' | 'email' | 'phone' | 'website' | 'tooShort' | 'tooLong' | 'consent'
export type FieldErrors = Partial<Record<InquiryField, FieldError>>

export const EMPTY_INQUIRY: InquiryValues = {
  name: '',
  email: '',
  company: '',
  volume: '',
  uses: [],
  message: '',
  jobTitle: '',
  website: '',
  wechat: '',
  phone: '',
  teamSize: '',
  country: '',
  platforms: [],
  needs: [],
  startTime: '',
  consent: false,
}

// The order errors are found in, which is the order the form shows the fields (focus goes to
// the first one).
export const FIELD_ORDER: readonly InquiryField[] = [
  'name',
  'email',
  'jobTitle',
  'phone',
  'wechat',
  'company',
  'website',
  'teamSize',
  'country',
  'platforms',
  'volume',
  'uses',
  'needs',
  'startTime',
  'message',
  'consent',
]

const emailFormat = z.email()
// Digits after a "+", once spaces, dashes, dots and brackets are dropped: E.164 is at most 15.
const PHONE = /^\+\d{6,15}$/
// A web address or a shop link, with or without the scheme; any script's letters in the name.
const WEBSITE = /^(https?:\/\/)?([\p{L}\p{N}-]+\.)+[\p{L}]{2,}(:\d{2,5})?([/?#]\S*)?$/iu

function text(value: string, required: boolean, max: number, min = 1): FieldError | null {
  const length = value.trim().length
  if (length === 0) return required ? 'required' : null
  if (length < min) return 'tooShort'
  return length > max ? 'tooLong' : null
}

const CHECKS: { [K in InquiryField]: (values: InquiryValues) => FieldError | null } = {
  name: (v) => text(v.name, true, LIMITS.name),
  email: (v) => text(v.email, true, LIMITS.email) ?? (emailFormat.safeParse(v.email.trim()).success ? null : 'email'),
  company: (v) => text(v.company, true, LIMITS.company),
  volume: (v) => (v.volume ? null : 'chooseOne'),
  uses: (v) => (v.uses.length > 0 ? null : 'chooseAny'),
  message: (v) => text(v.message, true, LIMITS.message, LIMITS.messageMin),
  jobTitle: (v) => text(v.jobTitle, false, LIMITS.jobTitle),
  website: (v) => text(v.website, false, LIMITS.website) ?? (!v.website.trim() || WEBSITE.test(v.website.trim()) ? null : 'website'),
  wechat: (v) => text(v.wechat, false, LIMITS.wechat),
  phone: (v) => text(v.phone, false, LIMITS.phone) ?? (!v.phone.trim() || PHONE.test(v.phone.replace(/[\s().-]/g, '')) ? null : 'phone'),
  teamSize: () => null,
  country: (v) => text(v.country, false, LIMITS.country),
  platforms: () => null,
  needs: () => null,
  startTime: () => null,
  consent: (v) => (v.consent ? null : 'consent'),
}

export function fieldError(field: InquiryField, values: InquiryValues): FieldError | null {
  return CHECKS[field](values)
}

export function validateInquiry(values: InquiryValues): FieldErrors {
  const errors: FieldErrors = {}
  for (const field of FIELD_ORDER) {
    const error = CHECKS[field](values)
    if (error) errors[field] = error
  }
  return errors
}

// The browser's post, before validateInquiry: right types and known choices only. Strings are
// capped well above the limits so an oversized post fails here without being copied around.
const str = z.string().max(4000).default('')
const pick = <T extends readonly [string, ...string[]]>(values: T) => z.union([z.enum(values), z.literal('')]).default('')
const many = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .default([])
    .transform((list) => [...new Set(list)])

export const inquiryShape = z.strictObject({
  name: str,
  email: str,
  company: str,
  volume: pick(MONTHLY_VOLUMES),
  uses: many(INQUIRY_USES),
  message: str,
  jobTitle: str,
  website: str,
  wechat: str,
  phone: str,
  teamSize: pick(TEAM_SIZES),
  country: str,
  platforms: many(INQUIRY_PLATFORMS),
  needs: many(INQUIRY_NEEDS),
  startTime: pick(START_TIMES),
  consent: z.boolean().default(false),
})
