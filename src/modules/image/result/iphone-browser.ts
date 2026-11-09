// Request Desktop Website can present an iPhone as a Mac. Touch and the physical screen's
// shorter edge distinguish the phone in either orientation from a Mac or iPad.
export function isIphoneBrowser(browser: Pick<Navigator, 'userAgent' | 'maxTouchPoints'>, display: Pick<Screen, 'width' | 'height'>): boolean {
  if (/iPhone/i.test(browser.userAgent)) return true
  return /Macintosh/i.test(browser.userAgent) && browser.maxTouchPoints > 1 && Math.min(display.width, display.height) <= 480
}
