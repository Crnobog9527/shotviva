// iPadOS and Request Desktop Website can identify as Macintosh. A Multi-Touch device
// in that mode still uses the iOS share sheet, in any orientation or window size.
export function isIosBrowser(browser: Pick<Navigator, 'userAgent' | 'maxTouchPoints'>): boolean {
  return /iPhone|iPad|iPod/i.test(browser.userAgent) || (/Macintosh/i.test(browser.userAgent) && browser.maxTouchPoints > 1)
}
