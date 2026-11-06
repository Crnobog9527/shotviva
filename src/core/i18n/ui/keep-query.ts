// The same page in the other language keeps its query (Graylum's state and return_to on
// /connect/graylum, `next` on /login). Added at click time: the rendered href stays the clean
// page address for crawlers, and static pages never read search params while rendering.
export function keepQuery(link: HTMLAnchorElement): void {
  const { search } = window.location
  const samePage = link.pathname !== '/' && link.pathname !== '/zh'
  if (search && samePage && !link.search) link.search = search
}
