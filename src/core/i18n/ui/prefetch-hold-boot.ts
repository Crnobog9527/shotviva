// Shared by the server (the page's inline script) and the browser (prefetch-hold.tsx).
export const HOLD_MAX_MS = 10_000

// The hold has to be there before the layout's links hydrate, which is before any effect of the
// page's: the page's HTML sets this flag while it is parsed, and the first HoldLinkPrefetch to
// mount swaps it for a counted hold. Never left set: it also goes after HOLD_MAX_MS.
export const BOOT_HOLD_SCRIPT = `window.__svHoldPrefetch=true;setTimeout(function(){window.__svHoldPrefetch=false},${HOLD_MAX_MS})`
