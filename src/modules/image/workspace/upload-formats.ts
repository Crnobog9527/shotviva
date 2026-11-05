import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from '@/core/storage/rules'

// Values for app.workspace.formats ("JPG, PNG or WebP · up to 20MB"), from the same rules the
// upload enforces (DESIGN §4.3). Format names are proper nouns; the sentence is in messages.
const NAMES: Record<string, string> = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' }

export const UPLOAD_FORMAT_NAMES = UPLOAD_CONTENT_TYPES.map((type) => NAMES[type] ?? type)
export const UPLOAD_MAX_MB = MAX_UPLOAD_BYTES / 1024 / 1024
