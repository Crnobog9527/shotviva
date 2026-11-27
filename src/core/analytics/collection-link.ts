// Template collection share links (ARCHITECTURE §5.1g): opening /s/t/<id> remembers the link in
// the first-party sv_tshare cookie (30 days, only the 12-character link id), which the sign-up
// event reads, so sign-ups can be counted per collection. Nothing about the person.

export const COLLECTION_COOKIE = 'sv_tshare'
export const COLLECTION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60

const COLLECTION_ID = /^[a-z0-9]{12}$/

export const isCollectionId = (value: unknown): value is string => typeof value === 'string' && COLLECTION_ID.test(value)

export const parseCollectionMark = (value: string | null | undefined): string | null => (isCollectionId(value) ? value : null)
