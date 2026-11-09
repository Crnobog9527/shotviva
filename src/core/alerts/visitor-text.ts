// Words a visitor typed (the business inquiry's company name, T86) going into a Feishu text
// message. Feishu reads `<at user_id="all"></at>` in a text message as "@everyone" and turns
// addresses into links, so: no angle brackets, no URL scheme, and a dot inside anything shaped
// like a domain becomes a full-width 「．」 so it is not linked. One line, cut to `max` characters.
const SCHEME = /\b[a-z][a-z0-9+.-]*:\/\//giu
const DOMAIN_DOT = /([\p{L}\p{N}-])\.(?=[\p{L}\p{N}-]*\p{L})/gu

export function visitorText(value: string, max: number): string {
  const line = value
    .replace(/[<>]/g, '')
    .replace(SCHEME, '')
    .replace(/:\/\//g, ': //')
    .replace(DOMAIN_DOT, '$1．')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = [...line]
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : line
}
