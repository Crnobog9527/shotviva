// Links and images in a post: only addresses a reader can safely follow. Everything else
// (javascript:, data:, vbscript:, protocol-relative //host) is dropped and the text stays.

// A page of this site ("/pricing", "/zh/blog/x"), an anchor, https/http or a mail address.
const LINK = /^(?:https?:\/\/[^\s/?#]+|mailto:[^\s@]+@[^\s@]+|\/(?!\/)|#)\S*$/i
// An image is only ever our own /assets path or an https address.
const IMAGE = /^(?:https:\/\/[^\s/?#]+|\/(?!\/))\S*$/i

// Control characters and backslashes never belong in an address; browsers read "\" as "/".
const clean = (raw: string) => (/[\u0000-\u001f\u007f\\]/.test(raw) ? null : raw.trim())

export function safeLink(raw: string): string | null {
  const url = clean(raw)
  return url && LINK.test(url) ? url : null
}

export function safeImage(raw: string): string | null {
  const url = clean(raw)
  return url && IMAGE.test(url) ? url : null
}

export const isExternal = (href: string) => /^https?:\/\//i.test(href)
