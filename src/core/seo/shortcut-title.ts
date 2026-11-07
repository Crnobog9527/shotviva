// Home-screen shortcut name on Huawei Browser (HarmonyOS). Its 「添加至桌面」 pre-fills the
// shortcut name from the page's live document title: the manifest name, application-name and
// apple-mobile-web-app-title that Chrome and Safari read (core/seo/metadata.ts) are ignored, so a
// /zh page offered 「AI改图：换光线换场景换画风…」 instead of the brand (Owner 2026-11-08, Mate 80
// Pro Max). ArkWeb reports every <title> change to the browser (Web.onTitleReceive), so the
// title is swapped to the brand in the browser itself; the served HTML, which crawlers read, keeps
// the SEO title.
//
// Only the built-in browser: Huawei documents the `HuaweiBrowser` UA token as what tells it apart
// from app WebViews (WeChat's in-app browser on HarmonyOS uses document.title for share cards).
// Crawlers never carry the token; the bot guard is belt and braces.
const HUAWEI_BROWSER = /\bHuaweiBrowser\//
const CRAWLER = /bot|spider|crawl|slurp|headless/i

export function usesTitleForShortcut(userAgent: string): boolean {
  return HUAWEI_BROWSER.test(userAgent) && !CRAWLER.test(userAgent)
}

export type TitleTarget = { title: string }

// Sets the title to the brand and puts it back whenever the app changes it (a client navigation
// renders the next page's <title>). `watch` calls back on every head change and returns its stop.
export function holdTitle(target: TitleTarget, name: string, watch: (onChange: () => void) => () => void): () => void {
  const apply = () => {
    // Writing only on a difference keeps the observer from feeding itself.
    if (target.title !== name) target.title = name
  }
  apply()
  return watch(apply)
}
