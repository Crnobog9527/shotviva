import { Link } from '../../i18n/ui'
import type { Locale } from '../../i18n/locales'
import { parseMarkdown, type TocEntry } from '../markdown'
import type { Post } from '../rules'
import { isoDay, longDate } from './dates'
import { BlocksView } from './markdown-view'
import './blog.css'

export type ArticleText = {
  home: string
  blog: string
  by: string
  published: string
  updated: string
  contents: string
}

function Contents({ toc, title, side }: { toc: readonly TocEntry[]; title: string; side: boolean }) {
  const items = toc.map((entry) => (
    <li key={entry.id} className={entry.level === 3 ? 'sub' : undefined}>
      <a href={`#${entry.id}`}>{entry.text}</a>
    </li>
  ))
  if (side) {
    return (
      <nav aria-label={title} className="mk-blog-toc mk-blog-toc-side">
        <p className="mk-blog-toc-title">{title}</p>
        <ol>{items}</ol>
      </nav>
    )
  }
  return (
    <details className="mk-blog-toc mk-blog-toc-fold">
      <summary>
        {title}
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <ol>{items}</ol>
    </details>
  )
}

function Meta({ post, locale, text }: { post: Post; locale: Locale; text: ArticleText }) {
  const edited = isoDay(post.updatedAt) !== isoDay(post.publishedAt)
  return (
    <p className="mk-blog-meta">
      <span>
        {text.by} <b>{post.authorName}</b>
      </span>
      <span>
        {text.published} <time dateTime={post.publishedAt}>{longDate(post.publishedAt, locale)}</time>
      </span>
      {edited ? (
        <span>
          {text.updated} <time dateTime={post.updatedAt}>{longDate(post.updatedAt, locale)}</time>
        </span>
      ) : null}
    </p>
  )
}

// The reading page: the post's title is the page's one H1 (the body's own # headings are h2),
// then who and when, the cover, a contents list from the h2 / h3 headings, and the text.
export function ArticleView({ post, text }: { post: Post; text: ArticleText }) {
  const { blocks, toc } = parseMarkdown(post.bodyMd)
  const showToc = toc.length >= 2
  return (
    <article className={`mk-blog mk-w${showToc ? ' mk-blog-has-toc' : ''}`}>
      <nav aria-label={text.blog} className="mk-blog-crumbs">
        <ol>
          <li><Link href="/">{text.home}</Link></li>
          <li><Link href="/blog">{text.blog}</Link></li>
          <li aria-current="page">{post.title}</li>
        </ol>
      </nav>
      <header className="mk-blog-head">
        <h1>{post.title}</h1>
        <p className="mk-blog-lede">{post.description}</p>
        <Meta post={post} locale={post.locale} text={text} />
      </header>
      {post.coverUrl ? (
        <figure className="mk-blog-cover">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own /assets address, shown at a fixed ratio */}
          <img src={post.coverUrl} alt={post.coverAlt ?? ''} fetchPriority="high" decoding="async" />
        </figure>
      ) : null}
      {showToc ? <Contents toc={toc} title={text.contents} side /> : null}
      {showToc ? <Contents toc={toc} title={text.contents} side={false} /> : null}
      <div className="mk-blog-text">
        <BlocksView blocks={blocks} />
      </div>
    </article>
  )
}
