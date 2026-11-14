import { z } from 'zod'

import { cleanPosterLine } from '../poster/content'

// 店铺信息 (ARCHITECTURE §5.3「每周复用」, table 1510): what a store owner types once and every
// poster template with matching fields fills in. Pure, shared by the settings card, the API and
// the editors. Limits match the poster blocks they fill (header.brand, footer.phones, …).

export const STORE_LIMITS = { name: 24, nameEn: 48, phone: 20, phones: 3, address: 60, wechat: 40 } as const

const line = (max: number) => z.string().transform(cleanPosterLine).pipe(z.string().max(max))

export const storeTextSchema = z.object({
  name: line(STORE_LIMITS.name),
  nameEn: line(STORE_LIMITS.nameEn),
  // Empty boxes are dropped, so a cleared phone never reaches a poster as a blank line.
  phones: z.array(line(STORE_LIMITS.phone)).max(STORE_LIMITS.phones).transform((phones) => phones.filter(Boolean)),
  address: line(STORE_LIMITS.address),
  wechat: line(STORE_LIMITS.wechat),
  autofill: z.boolean(),
})

export type StoreText = z.infer<typeof storeTextSchema>

// What the editors receive: the text, and the QR code as a fresh upload when one was asked for
// (a copy of the kept one, like Make again's photos).
export type StoreQr = { inputKey: string; bytes: number; url: string }
export type StoreProfile = StoreText & { hasQr: boolean; qrUrl: string | null }
export type StoreFill = StoreText & { hasQr: boolean; qr: StoreQr | null }

export const EMPTY_STORE: StoreText = { name: '', nameEn: '', phones: [], address: '', wechat: '', autofill: true }

// Nothing typed yet: no row is worth saving or offering.
export const storeIsEmpty = (store: Pick<StoreText, 'name' | 'nameEn' | 'phones' | 'address' | 'wechat'>, hasQr = false): boolean =>
  !hasQr && !store.name && !store.nameEn && store.phones.length === 0 && !store.address && !store.wechat

// How the phones and WeChat read in one 「电话或微信」 field.
export function contactLine(store: Pick<StoreText, 'phones' | 'wechat'>): string {
  return [...store.phones, ...(store.wechat ? [store.wechat] : [])].join(' / ')
}

// What the settings card saves: the text, and a new QR upload (inputs/ key), 'remove', or nothing
// to keep the saved one.
export type StoreSave = StoreText & { qr?: string }
export type StoreActions = { load(): Promise<StoreProfile>; save(input: StoreSave): Promise<StoreProfile> }
