// The blurred, darkened copy of a cover behind a plate fitted inside its frame (marketing.css
// .mk-fill). It used to be a second <img> of the same picture, with the same srcset: a kilobyte
// of HTML per plate, and the same again in the RSC payload, about 65 KB of the home page for 36
// plates (2026-11-21). Now it is an empty span the browser paints with the picture next to it,
// once that has loaded (cover-fills.tsx): the same file from the cache, never a second request.
export function CoverFill() {
  return <span className="mk-fill" data-cover-fill aria-hidden />
}
