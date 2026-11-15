-- Per-template offered resolutions travel with the prod←test template sync (2026-11-15).
-- read_template_sync_source now also returns the template's closed tiers
-- (template_sale_approvals.unpriced_resolutions) as template.unpriced_resolutions.
-- sync_preview_template already hands the template to admin_upsert_template, which applies that
-- key when present (closing a tier freely, reopening one only at or above production's floor) and
-- keeps production's own tiers when absent. A template without a sale row on the test site sends
-- no key, so production keeps what it has, exactly as before. Same signature and grants.

CREATE OR REPLACE FUNCTION "public"."read_template_sync_source"("p_id" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object('catalog', admin.template_sync_catalog(),
    'template', to_jsonb(t) - case when t.unpriced_resolutions is null then 'unpriced_resolutions' else '' end,
    'prompt', to_jsonb(p), 'provider', to_jsonb(a))
  from (select tt.id,tt.module,tt.name,tt.description,tt.category_key,tt.subcategory_key,
          s.slug as series_slug,tt.series_sort_order,tt.translations,tt.fields,tt.quality,tt.credits_cost,tt.visible_in,
          tt.cover_before_url,tt.cover_after_url,tt.cover_media_type,tt.cover_video_url,tt.cover_poster_url,tt.cover_locales,
          sale.unpriced_resolutions
          from public.templates tt left join public.template_series s on s.id=tt.series_id
          left join public.template_sale_approvals sale on sale.template_id=tt.id where tt.id=p_id) t
  left join lateral (select body,version,model_params,provider_id from public.template_prompts
    where template_id=t.id) p on true
  left join lateral (select adapter,model,base_url from public.ai_providers
    where id=p.provider_id and module='image') a on true
$$;
