import { Link } from '../../i18n/ui'
import type { Locale } from '../../i18n/locales'
import { postPath, type PostSummary } from '../rules'
import { longDate } from './dates'
import './blog.css'

export type BlogListText = { title: string; intro: string; empty: string; by: string }

// The /blog list: one card per published post, newest first. The post's title is the card's
// link; the whole card is clickable through it.
export function BlogListView({ posts, locale, text }: { posts: readonly PostSummary[]; locale: Locale; text: BlogListText }) {
  return (
    <div className="mk-blog mk-w">
      <header className="mk-blog-index-head">
        <h1>{text.title}</h1>
        <p>{text.intro}</p>
      </header>
      {posts.length === 0 ? (
        <p className="mk-blog-empty">{text.empty}</p>
      ) : (
        <ul className="mk-blog-cards">
          {posts.map((post, i) => (
            <li key={post.id} className="mk-blog-card">
              {post.coverUrl ? (
                <div className="mk-blog-card-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element -- our own /assets address, shown at a fixed ratio */}
                  <img src={post.coverUrl} alt={post.coverAlt ?? ''} loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
                </div>
              ) : null}
              <div className="mk-blog-card-body">
                <h2><Link href={postPath(post.slug)}>{post.title}</Link></h2>
                <p>{post.description}</p>
                <p className="mk-blog-meta">
                  <span>{text.by} <b>{post.authorName}</b></span>
                  <time dateTime={post.publishedAt}>{longDate(post.publishedAt, locale)}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
