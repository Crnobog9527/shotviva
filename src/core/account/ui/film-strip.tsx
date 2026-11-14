import { useTranslations } from 'next-intl'

import { REPLAY_BLOCK_CLASS } from '../../analytics/browser'
import { Link } from '../../i18n/ui'
import { Chevron } from './rows'

// This month's photos as a strip of film under the credits (comps-v3-b/account.html): up to
// seven frames between sprocket holes, a "+N" frame for the rest, each frame into its photo and
// the heading into Photos. Nothing made this month, no strip.

// thumbUrl: where a work's small copy is (ARCHITECTURE §8.3「作品小图」), never the full file.
type Props = { ids: readonly string[]; count: number; thumbUrl: (id: string) => string }

export const STRIP_FRAMES = 7

export function FilmStrip({ ids, count, thumbUrl }: Props) {
  const t = useTranslations('app.account.strip')
  if (count === 0) return null
  const more = count - ids.length
  const frame = 'block aspect-[4/5] w-[72px] shrink-0 overflow-hidden rounded-[3px] bg-muted md:w-[88px]'
  return (
    <>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-caption text-muted-foreground">{t('heading', { count })}</span>
        <Link href="/photos" className="press inline-flex min-h-11 items-center gap-1 text-caption font-medium text-foreground">
          {t('photos')}
          <Chevron className="size-4" />
        </Link>
      </div>
      <div className="film-strip relative overflow-hidden rounded-[14px] py-2.5">
        <ul aria-label={t('label')} className="no-scrollbar flex gap-1 overflow-x-auto px-2.5">
          {ids.map((id) => (
            <li key={id}>
              <Link href={`/photos/${id}`} className={frame} aria-label={t('open')}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the thumbnail route answers a redirect to a short-lived signed URL, as on Photos */}
                <img src={thumbUrl(id)} alt="" width={88} height={110} loading="lazy" decoding="async" className={`${REPLAY_BLOCK_CLASS} size-full object-cover`} />
              </Link>
            </li>
          ))}
          {more > 0 ? (
            <li>
              <Link href="/photos" className={`${frame} grid place-items-center bg-wash font-mono text-caption text-bone-dim`} aria-label={t('more', { count: more })}>
                +{more}
              </Link>
            </li>
          ) : null}
        </ul>
      </div>
    </>
  )
}
