// Photos' grid and its day label, shared by the finished tiles (server) and the developing ones
// (client): three columns on a phone, four from sm, six from lg.
export const GRID = 'grid grid-cols-3 gap-1 px-(--gutter) sm:grid-cols-4 md:gap-2 lg:grid-cols-6'
export const DAY_BAR = 'pointer-events-none sticky top-[calc(var(--sat)+8px)] z-10 px-(--gutter) pt-5 pb-2 md:top-16'
export const DAY_LABEL = 'frost hairline inline-flex min-h-8 items-baseline gap-2 rounded-full px-3 py-1.5'
