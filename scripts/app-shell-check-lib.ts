// The pure half of `pnpm check:app-shell`: given an app page's prerendered shell (the HTML
// served before any request data streams in), list what is wrong with its top bar. No file
// system here, so it is unit-tested (app-shell-check.test.ts).
//
// Why it exists: when the tab bar waited for the session, every app page's shell had no bar. The
// page painted from the top of the window and the bar streamed in a beat later, pushing it down
// 56px; any scroll at that moment left the page's top under the sticky bar (fix/topbar-overlap).

// 'bar': a static tab root, where the bar itself must be in the shell. 'slot': a page with a
// dynamic param, where the bar's stand-in must be there and the page must say it keeps the bar.
export type ShellExpectation = 'bar' | 'slot'

export const SHELLS: readonly { file: string; expect: ShellExpectation }[] = [
  { file: 'account.html', expect: 'bar' },
  { file: 'generate.html', expect: 'bar' },
  { file: 'photos.html', expect: 'bar' },
  { file: 'photos/[jobId].html', expect: 'slot' },
]

export const LOCALES = ['en', 'zh'] as const

const BAR = /<nav\b[^>]*\sdata-tabbar=""/
const SLOT = /<div\b[^>]*\sdata-tabbar-slot=""/
const UNDER_BAR = /\sdata-under-tabbar=""/

export function shellProblems(html: string, expect: ShellExpectation): string[] {
  const ground = html.indexOf('data-app-ground')
  const main = html.indexOf('<main', ground)
  if (ground < 0 || main < 0) return ['no app ground with a <main> (not an app page shell?)']
  const head = html.slice(ground, main)
  if (expect === 'bar') return BAR.test(head) ? [] : ['the tab bar is not in the shell: the page will paint without it and jump 56px when it streams in']
  const problems: string[] = []
  if (!SLOT.test(head)) problems.push("the tab bar's stand-in (data-tabbar-slot) is not in the shell")
  if (!UNDER_BAR.test(html.slice(main))) problems.push('the page shell does not mark that it keeps the bar (data-under-tabbar)')
  return problems
}
