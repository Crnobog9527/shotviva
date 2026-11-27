// User agents that get blocking metadata instead of the cached page (next.config.ts
// `htmlLimitedBots`). Plain module (no imports) because next.config.ts reads it at build time.
//
// Next's default list (next/dist/shared/lib/router/utils/html-bots.js) also holds the search
// crawlers and audit tools: Bingbot, Google-InspectionTool (Search Console live test),
// Chrome-Lighthouse (PageSpeed Insights), Yandex, Baidu, DuckDuckBot, Applebot and others. With
// Cache Components every page is a PPR route, and Next sends a matching user agent past the
// prerendered shell to a fresh blocking render (`x-vercel-cache: BYPASS`, `private, no-store`),
// so Bingbot waited 1.5-1.8 s per page while visitors got the cached copy in 0.2-0.3 s. Every
// public page's cached HTML already carries the title, description, canonical and hreflang in its
// <head> (no metadata is streamed into the body), so those crawlers now take the same cached
// page as a browser. The share pages (/t, /g) have no shell and render per request for everyone;
// their noindex is in the <head> either way.
//
// Kept: link-preview fetchers (and the Wayback archiver). They read the <head> once, run no
// script, are rare, and are the ones that would miss metadata if a page ever started streaming
// it. Only names from Next's default list, so no new user agent is sent past the cache.
// Matched case-insensitively by Next; Vercel's route matcher gets the same source.
export const HTML_LIMITED_BOTS =
  /facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|vkShare|quora link preview|redditbot|tumblr|bitlybot|ia_archiver/i
