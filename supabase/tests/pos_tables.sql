-- cafeore-pos の表（GORM のモデルどおり）と、テストで使う商品。本番やローカルの Supabase にまだ無いときだけ作る。
-- 本番には流さない。scripts/test-supabase.sh が使う。
create extension if not exists "uuid-ossp";
create table if not exists public.item_types (id uuid default uuid_generate_v4() primary key, name text not null, display_name text not null, deleted_at timestamptz);
create table if not exists public.items (id uuid default uuid_generate_v4() primary key, name text not null, abbr text not null, deleted_at timestamptz, item_type_id uuid not null);
create table if not exists public.menus (id uuid default uuid_generate_v4() primary key, name text not null, abbr text not null, price bigint not null, key text not null unique, deleted_at timestamptz);
create table if not exists public.menu_items (menu_id uuid, item_id uuid, quantity bigint not null check (quantity > 0), primary key (menu_id, item_id));
create table if not exists public.orders (id uuid default uuid_generate_v4() primary key, order_id bigint not null, created_at timestamptz not null, ready_at timestamptz, served_at timestamptz, billing_amount bigint not null, received bigint not null, discount_order_id bigint, discount_order_cups bigint);
create table if not exists public.order_menus (id uuid default uuid_generate_v4() primary key, order_id uuid not null, menu_id uuid not null, assignee text, menu_name text not null, unit_price bigint not null);
create table if not exists public.comments (id uuid default uuid_generate_v4() primary key, order_id uuid not null, author text not null, text text not null, created_at timestamptz not null);

insert into public.item_types (id, name, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'hot', 'ホット'),
  ('00000000-0000-0000-0000-0000000000a2', 'ice', 'アイス'),
  ('00000000-0000-0000-0000-0000000000a3', 'milk', 'ミルク'),
  ('00000000-0000-0000-0000-0000000000a4', 'others', 'その他')
on conflict do nothing;
insert into public.items (id, name, abbr, item_type_id) values
  ('00000000-0000-0000-0000-0000000000b1', '優勝ブレンド', '優ブレ', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', '珈琲・俺ブレンド', '俺ブレ', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b3', 'アイスミルク', 'ミルク', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000b4', 'トートバッグ', 'トート', '00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000b5', 'アイスコーヒー', '氷', '00000000-0000-0000-0000-0000000000a2')
on conflict do nothing;
insert into public.menus (id, name, abbr, price, key) values
  ('00000000-0000-0000-0000-0000000000c1', '優勝ブレンド', '優ブレ', 500, 'test-c1'),
  ('00000000-0000-0000-0000-0000000000c2', '珈琲・俺ブレンド', '俺ブレ', 300, 'test-c2'),
  ('00000000-0000-0000-0000-0000000000c3', 'アイスミルク', 'ミルク', 100, 'test-c3'),
  ('00000000-0000-0000-0000-0000000000c4', 'トートセット', 'セット', 1000, 'test-c4'),
  ('00000000-0000-0000-0000-0000000000c5', 'アイスコーヒー', '氷', 400, 'test-c5')
on conflict do nothing;
insert into public.menu_items (menu_id, item_id, quantity) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 1),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 1),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b3', 1),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b1', 1),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b4', 1),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000b5', 1)
on conflict do nothing;
