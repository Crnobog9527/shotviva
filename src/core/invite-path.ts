// An org invite link (/join/org/<token>) is a credential: whoever holds it can join the company.
// Analytics and error reports must never carry the token, wherever the path shows up: as a page
// URL, as a pathname, or URL-encoded inside a login `next=` parameter. Pure, so the browser
// analytics config, the Sentry scrubber and the server logger share one rule.
const INVITE_PATH = /(\/join\/org\/|%2Fjoin%2Forg%2F)[^/?#&\s"'%]+/gi

export function redactInvitePath(value: string): string {
  return value.replace(INVITE_PATH, '$1[redacted]')
}
