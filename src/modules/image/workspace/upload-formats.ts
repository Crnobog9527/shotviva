import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from '@/core/storage/rules'

// "JPG, PNG or WebP · up to 20MB", from the same rules the upload enforces (DESIGN §4.3).
const NAMES: Record<string, string> = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' }
const names = UPLOAD_CONTENT_TYPES.map((type) => NAMES[type] ?? type)

export const UPLOAD_FORMATS = `${names.slice(0, -1).join(', ')} or ${names.at(-1)} · up to ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`
