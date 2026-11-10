// Tells the server which "your wish came true" notices the banner has shown. A plain fetch to a
// route handler rather than a server action, so the page is not refetched under the banner
// (src/app/api/wishlist/notices/seen). keepalive lets the mark finish if the user leaves the
// page straight away. The response is not read: a failed mark is ignored (ARCHITECTURE §15.4).
export async function markNoticesSeen(requestIds: string[]): Promise<void> {
  await fetch('/api/wishlist/notices/seen', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: requestIds }),
    keepalive: true,
  })
}
