// The individual sources behind 「流量从哪里来」 (ARCHITECTURE §16.2b), one entry per channel the
// Owner can act on. The HogQL classifier in sources.ts is generated from this table, in this
// order, so a more specific host is listed before a broader one (gemini.google.com before
// google.*, edgeservices.bing.com before bing.com). Every group ends with its 「其他…」 entry.
//
// tags: names in utm_source or a non-promoter ?ref= value, matched whole, optionally with a
//   domain ending (chatgpt, chatgpt.com) unless `bare`: X lists its endings itself, so x.ai
//   (xAI, Grok) is not X.
// hosts: referrer hosts as regex fragments. Any subdomain matches unless `exact`, where only the
//   bare host or www. does (accounts.google.com must not count as Google search).
//
// What cannot be told apart from the page view alone:
// - Google AI Overviews and AI Mode send the visitor with the same google.com referrer as a plain
//   search result (the #:~:text= fragment is stripped before capture), so they count as Google.
// - Copilot answers inside bing.com send bing.com, so they count as Bing; Copilot in Edge
//   (edgeservices.bing.com) and copilot.microsoft.com are recognised as Copilot.
// - Grok inside x.com sends x.com, so it counts as X; grok.com is Grok.
// - Apps (WeChat, Xiaohongshu, TikTok) often hide the referrer: those visits look direct unless
//   the link carries utm_source or ?ref=.

export const DETAILED_GROUPS = ['search', 'ai', 'social', 'ads'] as const
export type DetailedGroup = (typeof DETAILED_GROUPS)[number]

export type SourceDef = { key: string; group: DetailedGroup; tags?: readonly string[]; bare?: boolean; hosts?: readonly string[]; exact?: boolean }

export const AI_SOURCES: readonly SourceDef[] = [
  { key: 'ai:chatgpt', group: 'ai', tags: ['chatgpt', 'openai'], hosts: ['chatgpt[.]com', 'chat[.]openai[.]com'] },
  { key: 'ai:gemini', group: 'ai', tags: ['gemini', 'bard'], hosts: ['gemini[.]google[.]com', 'bard[.]google[.]com'] },
  { key: 'ai:perplexity', group: 'ai', tags: ['perplexity'], hosts: ['perplexity[.]ai'] },
  { key: 'ai:claude', group: 'ai', tags: ['claude', 'anthropic'], hosts: ['claude[.]ai'] },
  { key: 'ai:copilot', group: 'ai', tags: ['copilot'], hosts: ['copilot[.]microsoft[.]com', 'copilot[.]cloud[.]microsoft', 'edgeservices[.]bing[.]com'] },
  { key: 'ai:deepseek', group: 'ai', tags: ['deepseek'], hosts: ['deepseek[.]com'] },
  { key: 'ai:kimi', group: 'ai', tags: ['kimi', 'moonshot'], hosts: ['kimi[.]com', 'kimi[.]moonshot[.]cn', 'moonshot[.]cn'] },
  { key: 'ai:doubao', group: 'ai', tags: ['doubao'], hosts: ['doubao[.]com'] },
  { key: 'ai:grok', group: 'ai', tags: ['grok', 'xai', 'x[.]ai'], hosts: ['grok[.]com', 'x[.]ai'] },
  {
    key: 'ai:other',
    group: 'ai',
    tags: ['poe', 'phind', 'you', 'mistral', 'meta', 'meta-ai', 'metaai', 'yuanbao', 'tongyi', 'qwen', 'metaso', 'zhipu', 'chatglm'],
    hosts: ['poe[.]com', 'phind[.]com', 'you[.]com', 'chat[.]mistral[.]ai', 'meta[.]ai', 'yuanbao[.]tencent[.]com', 'tongyi[.]aliyun[.]com', 'qianwen[.]aliyun[.]com', 'metaso[.]cn', 'chatglm[.]cn'],
  },
]

export const SEARCH_SOURCES: readonly SourceDef[] = [
  { key: 'search:google', group: 'search', tags: ['google'], hosts: ['google[.][a-z.]+'], exact: true },
  { key: 'search:bing', group: 'search', tags: ['bing'], hosts: ['bing[.]com', 'cn[.]bing[.]com', 'm[.]bing[.]com'], exact: true },
  { key: 'search:baidu', group: 'search', tags: ['baidu'], hosts: ['baidu[.]com', 'm[.]baidu[.]com'], exact: true },
  { key: 'search:duckduckgo', group: 'search', tags: ['duckduckgo', 'ddg'], hosts: ['duckduckgo[.]com'], exact: true },
  {
    key: 'search:yahoo',
    group: 'search',
    tags: ['yahoo'],
    hosts: ['search[.]yahoo[.]com', 'r[.]search[.]yahoo[.]com', '[a-z]{2}[.]search[.]yahoo[.]com', 'search[.]yahoo[.]co[.]jp', 'yahoo[.]co[.]jp'],
    exact: true,
  },
  { key: 'search:yandex', group: 'search', tags: ['yandex'], hosts: ['yandex[.][a-z.]+', 'ya[.]ru'], exact: true },
  { key: 'search:naver', group: 'search', tags: ['naver'], hosts: ['search[.]naver[.]com', 'm[.]search[.]naver[.]com', 'naver[.]com'], exact: true },
  { key: 'search:sogou', group: 'search', tags: ['sogou'], hosts: ['sogou[.]com', 'm[.]sogou[.]com'], exact: true },
  {
    key: 'search:other',
    group: 'search',
    tags: ['ecosia', 'startpage', 'brave', 'qwant', 'seznam', 'so360', 'sm'],
    hosts: ['ecosia[.]org', 'startpage[.]com', 'search[.]brave[.]com', 'qwant[.]com', 'seznam[.]cz', 'so[.]com', 'm[.]so[.]com', 'sm[.]cn', 'm[.]sm[.]cn'],
    exact: true,
  },
]

export const SOCIAL_SOURCES: readonly SourceDef[] = [
  { key: 'social:x', group: 'social', tags: ['x', 'x[.]com', 'twitter', 'twitter[.]com', 't[.]co'], bare: true, hosts: ['x[.]com', 'twitter[.]com', 't[.]co'] },
  { key: 'social:reddit', group: 'social', tags: ['reddit'], hosts: ['reddit[.]com', 'redd[.]it'] },
  { key: 'social:youtube', group: 'social', tags: ['youtube', 'yt'], hosts: ['youtube[.]com', 'youtu[.]be'] },
  { key: 'social:xiaohongshu', group: 'social', tags: ['xiaohongshu', 'xhs', 'rednote'], hosts: ['xiaohongshu[.]com', 'xhslink[.]com'] },
  { key: 'social:facebook', group: 'social', tags: ['facebook', 'fb'], hosts: ['facebook[.]com', 'fb[.]com', 'fb[.]me'] },
  { key: 'social:instagram', group: 'social', tags: ['instagram', 'ig'], hosts: ['instagram[.]com'] },
  { key: 'social:tiktok', group: 'social', tags: ['tiktok'], hosts: ['tiktok[.]com'] },
  { key: 'social:linkedin', group: 'social', tags: ['linkedin'], hosts: ['linkedin[.]com', 'lnkd[.]in'] },
  { key: 'social:wechat', group: 'social', tags: ['wechat', 'weixin'], hosts: ['weixin[.]qq[.]com', 'weixin110[.]qq[.]com', 'wx[.]qq[.]com'] },
  { key: 'social:zhihu', group: 'social', tags: ['zhihu'], hosts: ['zhihu[.]com'] },
  { key: 'social:bilibili', group: 'social', tags: ['bilibili'], hosts: ['bilibili[.]com', 'b23[.]tv'] },
  { key: 'social:producthunt', group: 'social', tags: ['producthunt', 'product-hunt'], hosts: ['producthunt[.]com'] },
  {
    key: 'social:other',
    group: 'social',
    tags: ['pinterest', 'threads', 'weibo', 'douyin', 'discord', 'telegram', 'hackernews', 'hn', 'mastodon', 'bluesky'],
    hosts: ['pinterest[.][a-z.]+', 'threads[.]net', 'threads[.]com', 'weibo[.]com', 'douyin[.]com', 'discord[.]com', 't[.]me', 'telegram[.]org', 'news[.]ycombinator[.]com', 'bsky[.]app'],
  },
]

// Order matters: AI before search (gemini.google.com, edgeservices.bing.com).
export const SOURCE_TABLE: readonly SourceDef[] = [...AI_SOURCES, ...SEARCH_SOURCES, ...SOCIAL_SOURCES]

// Paid clicks, checked before utm_source and the referrer. utm_medium marks a paid link.
export const PAID_MEDIUM = '^(cpc|ppc|paid.*|ads?|display|cpm|paidsocial|paid_social)$'
export const AD_SOURCES = [
  { key: 'ads:google', clickIds: ['gclid', 'gbraid', 'wbraid'], tags: ['google', 'googleads', 'adwords'] },
  { key: 'ads:microsoft', clickIds: ['msclkid'], tags: ['bing', 'microsoft', 'microsoftads'] },
  { key: 'ads:tiktok', clickIds: ['ttclid'], tags: ['tiktok'] },
  { key: 'ads:meta', clickIds: [], tags: ['facebook', 'fb', 'instagram', 'ig', 'meta'] },
  { key: 'ads:other', clickIds: [], tags: [] },
] as const

// Keys with no individual entries.
export const SINGLE_KEYS = ['affiliate', 'direct', 'other'] as const

export const ALL_SOURCE_KEYS: readonly string[] = [...SOURCE_TABLE.map((def) => def.key), ...AD_SOURCES.map((ad) => ad.key), ...SINGLE_KEYS]

export const groupOfKey = (key: string): string => key.split(':')[0] ?? 'other'

// HogQL regex literals (single-quoted), also valid JavaScript regexes for the tests.
export const tagPattern = (tags: readonly string[], bare = false) => `'^(${tags.join('|')})${bare ? '' : '([.][a-z.]+)?'}$'`
export const hostPattern = (def: Pick<SourceDef, 'hosts' | 'exact'>) =>
  `'^${def.exact ? '(www[.])?' : '([a-z0-9-]+[.])*'}(${(def.hosts ?? []).join('|')})$'`
