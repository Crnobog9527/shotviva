import { describe, expect, it } from 'vitest'

import { shellProblems, SHELLS } from './app-shell-check-lib'

// Trimmed from real `next build` output (.next/server/app/en/…html).
const GROUND = '<div data-app-ground="" class="flex min-h-dvh flex-1 flex-col has-[&gt;nav[data-tabbar]]:pb-[calc(var(--sab)+64px)]">'
const BAR = '<!--$--><nav aria-label="Main" data-tabbar="" style="view-transition-name:app-tabs" class="bar-material fixed md:sticky"><div></div></nav><!--/$-->'
const PENDING = '<!--$?--><template id="B:1"></template><!--/$-->'
const SLOT = '<!--$?--><template id="B:0"></template><div aria-hidden="true" data-tabbar-slot=""></div><!--/$-->'
const ACCOUNT_PAGE = '<main class="flex flex-1 flex-col"><div class="w-full flex-1 pb-6"><header><h1>Account</h1></header></div></main></div>'
const PHOTO_PAGE = '<main class="flex flex-1 flex-col"><div><header style="view-transition-name:app-flow-nav" data-under-tabbar="" class="nav-material sticky top-0 md:top-14"></header></div></main></div>'

describe('app page shell check', () => {
  it('passes a tab root whose shell carries the bar before <main>', () => {
    expect(shellProblems(GROUND + PENDING + BAR + ACCOUNT_PAGE, 'bar')).toEqual([])
  })

  it('fails the shell the bar used to leave out (it waited for the session behind fallback={null})', () => {
    // The class string mentions data-tabbar; only a real <nav data-tabbar=""> counts.
    expect(shellProblems(GROUND + PENDING + PENDING + ACCOUNT_PAGE, 'bar')).toHaveLength(1)
  })

  it('does not count a bar that only shows up after <main>', () => {
    expect(shellProblems(GROUND + PENDING + ACCOUNT_PAGE + BAR, 'bar')).toHaveLength(1)
  })

  it("passes the photo page with the bar's stand-in and the page's marker", () => {
    expect(shellProblems(GROUND + PENDING + SLOT + PHOTO_PAGE, 'slot')).toEqual([])
  })

  it('fails the photo page without the stand-in or without the marker', () => {
    expect(shellProblems(GROUND + PENDING + PENDING + PHOTO_PAGE, 'slot')).toHaveLength(1)
    expect(shellProblems(GROUND + PENDING + SLOT + ACCOUNT_PAGE, 'slot')).toHaveLength(1)
  })

  it('says so when the HTML is not an app page at all', () => {
    expect(shellProblems('<html><body><main></main></body></html>', 'bar')).toHaveLength(1)
  })

  it('covers the three tab roots and the photo page', () => {
    expect(SHELLS.map((shell) => shell.file)).toEqual(['account.html', 'generate.html', 'photos.html', 'photos/[jobId].html'])
  })
})
