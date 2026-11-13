// User agents that get the whole page rendered on request instead of the prerendered shell
// (next.config.ts `htmlLimitedBots`). Next's default list (next/dist/shared/lib/router/utils/
// html-bots.js, 16.4) minus `Chrome-Lighthouse`: with Cache Components an HTML-limited bot skips
// the cached shell and waits for a dynamic render in sfo1, so Lighthouse and PageSpeed Insights
// timed a page no visitor gets (TTFB ~2.3 s against ~0.2 s, mobile LCP ~3.4 s). Lighthouse runs a
// full Chrome and reads streamed metadata like any visitor. The crawlers stay on the list: they
// need the metadata in the first `<head>`. A test pins this to Next's list, so an upgrade that
// changes it fails CI instead of silently diverging.
export const HTML_LIMITED_BOTS =
  /[\w-]+-Google|Google-[\w-]+|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i
