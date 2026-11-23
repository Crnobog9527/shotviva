import { serviceWorkerResponse } from '@/core/offline/server'

// The service worker (core/offline): public by nature (AGENTS §6), served at the site root so its
// scope is the whole site. It answers only content-hashed static files and the catalogue file at a
// version; pages and every other request go to the network. The proxy matcher skips this path.
export function GET() {
  return serviceWorkerResponse()
}
