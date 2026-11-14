'use client'

// The browser's own notification when a photo settles while this tab is out of view. Asked for
// only from a button the user presses after starting a job, never on page load. Desktop only:
// phone browsers either have no Notification (iOS outside a home-screen app) or refuse it
// without a service worker (Android), and there the in-app notice and the tab title do the job.
const supported = () =>
  typeof window !== 'undefined' && 'Notification' in window && window.matchMedia('(pointer: fine)').matches

export const canAskNotify = () => supported() && Notification.permission === 'default'

export const notifyGranted = () => supported() && Notification.permission === 'granted'

export async function askNotify(): Promise<boolean> {
  if (!canAskNotify()) return notifyGranted()
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

const ICON = '/icons/icon-192.png'

// One notification for the latest news (same tag: a batch replaces it rather than stacking).
export function notifyIfHidden(title: string, body: string, open: () => void) {
  if (!notifyGranted() || document.visibilityState !== 'hidden') return
  try {
    const notice = new Notification(title, { body, tag: 'shotviva-generation', icon: ICON })
    notice.onclick = () => {
      window.focus()
      open()
      notice.close()
    }
  } catch {
    // A browser that only allows notifications from a service worker: the in-app notice stands.
  }
}
