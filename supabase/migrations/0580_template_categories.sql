-- T75: template categories move from code into the database so the Owner manages them in admin
-- (ARCHITECTURE §5 「模板分类由后台管理」). `key` is the stable id that templates.category,
-- pages, analytics and caches use; it never changes once created. Names and intros are display
-- text in both languages. `card_style` replaces the old check on the name 'Art Styles':
-- 'compare' cards are the drag compare, 'pair' the side-by-side pair.
--
-- Public read (every page shows the names), written only through the admin SQL functions
-- (0582) with the service role.

create table public.template_categories (
  key text primary key
    constraint template_categories_key_check check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(key) <= 40),
  name_en text not null
    constraint template_categories_name_en_check check (char_length(name_en) >= 1 and char_length(name_en) <= 32 and name_en = btrim(name_en)),
  name_zh text not null
    constraint template_categories_name_zh_check check (char_length(name_zh) >= 1 and char_length(name_zh) <= 12 and name_zh = btrim(name_zh)),
  intro_en text
    constraint template_categories_intro_en_check check (intro_en is null or char_length(intro_en) between 1 and 200),
  intro_zh text
    constraint template_categories_intro_zh_check check (intro_zh is null or char_length(intro_zh) between 1 and 200),
  card_style text not null default 'pair'
    constraint template_categories_card_style_check check (card_style in ('pair', 'compare')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No two categories share a name in either language (English ignoring case).
create unique index template_categories_name_en_key on public.template_categories (lower(name_en));
create unique index template_categories_name_zh_key on public.template_categories (name_zh);

create trigger template_categories_set_updated_at
  before update on public.template_categories
  for each row execute function public.set_updated_at();

alter table public.template_categories enable row level security;

create policy template_categories_select_all on public.template_categories
  for select to anon, authenticated
  using (true);

revoke all on public.template_categories from anon, authenticated;
grant select on public.template_categories to anon, authenticated;
grant all on public.template_categories to service_role;

-- The six categories the code had (site/content template-categories, app.categories), in the
-- home page's order (Art Styles first, 建站规格 §4 H2-2). Keys are the slugs analytics already
-- sent for these names (core/jobs/generation-analytics categorySlug), so PostHog stays continuous.
insert into public.template_categories (key, name_en, name_zh, intro_en, intro_zh, card_style, sort_order) values
  ('art-styles', 'Art Styles', '画风',
   'Turn a phone photo into a drawing. The pose, the layout and the subject stay as shot.',
   '照片转动漫、转插画都行，姿势、构图和主体都不变。', 'compare', 10),
  ('food-drink', 'Food & Drink', '餐饮',
   'Turn a phone photo of a dish or a drink into a menu photo or a poster. The food and the plate stay as served.',
   '手机拍的菜品和饮品，直接做成菜单图或海报，菜和盘子保持原样。', 'pair', 20),
  ('products-resale', 'Products & Resale', '商品与二手',
   'Shoot a product on any table and get a store-ready photo. The label, color and shape stay the same.',
   '商品随便放在桌上拍，就能出能上架的图，标签、颜色和形状都不变。', 'pair', 30),
  ('beauty-skincare', 'Beauty & Skincare', '美妆护肤',
   'Put a bottle, jar or tube from your phone photo on a clean brand set. The packaging stays as it is.',
   '把手机照片里的瓶子、罐子或软管放到干净的品牌展台上，包装保持原样。', 'pair', 40),
  ('rooms-spaces', 'Rooms & Spaces', '房间与空间',
   'Make a room photo brighter or warmer. Walls, windows and furniture stay where they are.',
   '让房间照片更亮或更暖，墙、窗户和家具都在原来的位置。', 'pair', 50),
  ('pets', 'Pets', '宠物',
   'Turn a snapshot of your pet into a studio portrait. Your pet still looks like your pet.',
   '把宠物的随手拍变成影棚写真，你家的宠物还是你家的样子。', 'pair', 60);
