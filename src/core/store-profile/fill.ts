import type { PosterContent } from '../poster/content'
import { contactLine, type StoreText } from './profile'

// Which template fields the store profile fills (§5.3「每周复用」). Plain copy fields match by key
// (the prize posters' venue / venue_en / address / contact); a dense-text poster fills its
// header's organiser and its footer. A value never replaces something the user typed: only an
// empty field, or one still holding the template's sample text, is filled.

type StoreValues = Pick<StoreText, 'name' | 'nameEn' | 'phones' | 'address' | 'wechat'>

const COPY_KEYS: Record<string, (store: StoreValues) => string> = {
  venue: (store) => store.name,
  store_name: (store) => store.name,
  shop_name: (store) => store.name,
  venue_en: (store) => store.nameEn,
  store_name_en: (store) => store.nameEn,
  address: (store) => store.address,
  contact: contactLine,
  phone: (store) => store.phones[0] ?? '',
  wechat: (store) => store.wechat,
}

// example: the cover's text a field starts from (fields.copy[].example, shotviva#638); a value
// still equal to it is replaced like an empty one.
type Field = { key: string; maxLength: number; type?: string; example?: string }

// The fields of this template the profile can fill, with what goes in each (empty values left out).
export function storeCopyValues(fields: readonly Field[], store: StoreValues): Record<string, string> {
  return Object.fromEntries(fields.flatMap((field) => {
    const value = field.type === 'select' ? '' : COPY_KEYS[field.key]?.(store).slice(0, field.maxLength) ?? ''
    return value ? [[field.key, value]] : []
  }))
}

// Whether the template has any field the profile fills (the editors only offer it then).
export const matchesStore = (fields: readonly Pick<Field, 'key'>[]): boolean => fields.some((field) => field.key in COPY_KEYS)

// Whether a field's value is the user's own: not blank and not still the cover's example.
export function typedBy(fields: readonly Pick<Field, 'key' | 'example'>[], copy: Record<string, string>) {
  const examples = new Map(fields.map((field) => [field.key, field.example]))
  return (key: string): boolean => Boolean(copy[key]?.trim()) && copy[key] !== examples.get(key)
}

// The copy with the profile filled into fields the user has not typed; `force` also replaces
// typed values (the user confirmed). Returns the keys that changed.
export function fillCopy(copy: Record<string, string>, values: Record<string, string>, typed: (key: string) => boolean, force = false) {
  const changed = Object.keys(values).filter((key) => values[key] !== copy[key] && (force || !typed(key)))
  return { copy: { ...copy, ...Object.fromEntries(changed.map((key) => [key, values[key]!])) }, changed }
}

// Typed values the profile would replace (asked before a manual fill).
export const copyConflicts = (copy: Record<string, string>, values: Record<string, string>, typed: (key: string) => boolean): string[] =>
  Object.keys(values).filter((key) => typed(key) && copy[key] !== values[key])

export const POSTER_STORE_PATHS = ['header.brand', 'header.brandEn', 'footer.phones', 'footer.address'] as const
type PosterPath = (typeof POSTER_STORE_PATHS)[number]

function posterValue(content: PosterContent, path: PosterPath): string {
  if (path === 'footer.phones') return content.footer.phones.join('\n')
  if (path === 'footer.address') return content.footer.address
  return path === 'header.brand' ? content.header.brand : content.header.brandEn
}

function storeValue(store: StoreValues, path: PosterPath): string {
  if (path === 'footer.phones') return store.phones.join('\n')
  if (path === 'footer.address') return store.address
  return path === 'header.brand' ? store.name : store.nameEn
}

// The poster with the profile filled in where the field is empty or `replaceable` (still the
// sample, or the user confirmed). Returns the paths that changed.
export function fillPoster(content: PosterContent, store: StoreValues, replaceable: (path: PosterPath) => boolean = () => false) {
  const changed = POSTER_STORE_PATHS.filter((path) => {
    const next = storeValue(store, path)
    const now = posterValue(content, path)
    return next !== '' && next !== now && (now.trim() === '' || replaceable(path))
  })
  const has = (path: PosterPath) => changed.includes(path)
  return {
    content: {
      ...content,
      header: { ...content.header, ...(has('header.brand') ? { brand: store.name } : {}), ...(has('header.brandEn') ? { brandEn: store.nameEn } : {}) },
      footer: { ...content.footer, ...(has('footer.phones') ? { phones: [...store.phones] } : {}), ...(has('footer.address') ? { address: store.address } : {}) },
    },
    changed: changed as string[],
  }
}
