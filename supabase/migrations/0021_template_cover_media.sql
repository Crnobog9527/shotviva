-- T16: a template card can show a still image, an animation or a short video (ARCHITECTURE
-- §8.3, DESIGN §4.2). The before/after stills stay as they are (static cards and the preview
-- drawer's drag comparison); motion cards add one media file and its first frame.
--   cover_video_url   the motion file: an animated WebP ('animated') or an H.264 MP4 ('video')
--   cover_poster_url  that file's first frame, shown before the motion loads and under
--                     reduced motion
-- All three URLs point at the public assets bucket (covers/{template_id}/…), written only by
-- the admin page.

alter table public.templates
  add column cover_media_type text not null default 'image'
    check (cover_media_type in ('image', 'animated', 'video')),
  add column cover_video_url text,
  add column cover_poster_url text,
  -- A motion card is never half set up: the admin upload writes type, file and frame together.
  add constraint templates_cover_motion_complete check (
    cover_media_type = 'image' or (cover_video_url is not null and cover_poster_url is not null)
  );
