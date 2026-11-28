import { NavAccount } from '@/core/content'

import { MemberSwitch } from './member-switch'

// The right end of the marketing top bar (DESIGN §6.9 item 4): signed out in the static HTML, and
// the member's bar once the browser finds a session cookie (core/auth/session-hint.ts). Both are
// rendered here on the server, so their labels stay out of the client messages; the browser only
// picks one. No request-time read: marketing pages are fully static and hydrate without waiting
// for a function. A lapsed cookie still shows Open app; /generate then sends them to sign in.
export function NavAccountSlot() {
  return <MemberSwitch guest={<NavAccount signedIn={false} />} member={<NavAccount signedIn />} />
}
