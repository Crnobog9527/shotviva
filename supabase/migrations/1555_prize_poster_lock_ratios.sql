-- Turn the ratio lock (1554) on for the seven prize posters (Owner 2026-11-15): their covers are
-- a fixed 2:3 layout. Only rows that still list exactly ["2:3"]; a fresh database without them
-- updates nothing. Later changes go through the editor checkbox and the prod←test sync.
update public.templates set fields = fields || '{"lockAspectRatios":true}'::jsonb
  where id in ('prize-poster-boarding-pass','prize-poster-collage','prize-poster-giant-numbers',
    'prize-poster-neon-collage','prize-poster-pop-art','prize-poster-receipt','prize-poster-riso-collage')
    and fields->'aspectRatios' = '["2:3"]'::jsonb;
