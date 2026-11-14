// The date styles messages name (`{date, date, medium}`), as the full ICU formatter defines them.
// Messages are precompiled for next-intl's small formatter (next.config.ts), which knows only the
// styles listed here: without them `medium` fell back to numeric dates (2026/11/14, not
// 2026年11月14日 / Nov 14, 2026). The server-rendered client providers inherit these from request.ts;
// a provider created in the browser (admin preview-provider.tsx) passes them itself.
export const MESSAGE_FORMATS = {
  dateTime: {
    short: { month: 'numeric', day: 'numeric', year: '2-digit' },
    medium: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  },
} as const
