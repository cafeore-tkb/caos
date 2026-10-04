-- ローカルの素の Postgres に、Supabase の代わりになる最小限のもの（ロール・auth.jwt()・Realtime の
-- publication）と、cafeore-pos の表（GORM のモデルどおり）を用意する。scripts/test-supabase.sh から使う。

-- Supabase の代役（ロール・auth.jwt()・Realtime の publication）
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
create publication supabase_realtime;
-- Supabase と同じく、public の表に anon / authenticated の権限が付いている状態にする
alter default privileges in schema public grant all on tables to anon, authenticated;

-- POS の表（cafeore-pos の GORM モデルどおり）
create extension if not exists "uuid-ossp";
create table item_types (id uuid default uuid_generate_v4() primary key, name text not null, display_name text not null, deleted_at timestamptz);
create table items (id uuid default uuid_generate_v4() primary key, name text not null, abbr text not null, deleted_at timestamptz, item_type_id uuid not null);
create table menus (id uuid default uuid_generate_v4() primary key, name text not null, abbr text not null, price bigint not null, key text not null unique, deleted_at timestamptz);
create table menu_items (menu_id uuid, item_id uuid, quantity bigint not null check (quantity > 0), primary key (menu_id, item_id));
create table orders (id uuid default uuid_generate_v4() primary key, order_id bigint not null, created_at timestamptz not null, ready_at timestamptz, served_at timestamptz, billing_amount bigint not null, received bigint not null, discount_order_id bigint, discount_order_cups bigint);
create table order_menus (id uuid default uuid_generate_v4() primary key, order_id uuid not null, menu_id uuid not null, assignee text, menu_name text not null, unit_price bigint not null);

insert into item_types (id, name, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'hot', 'ホット'),
  ('00000000-0000-0000-0000-0000000000a2', 'ice', 'アイス'),
  ('00000000-0000-0000-0000-0000000000a3', 'milk', 'ミルク'),
  ('00000000-0000-0000-0000-0000000000a4', 'others', 'その他');
insert into items (id, name, abbr, item_type_id) values
  ('00000000-0000-0000-0000-0000000000b1', '優勝ブレンド', '優ブレ', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', '珈琲・俺ブレンド', '俺ブレ', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b3', 'アイスミルク', 'ミルク', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000b4', 'トートバッグ', 'トート', '00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000b5', 'アイスコーヒー', '氷', '00000000-0000-0000-0000-0000000000a2');
insert into menus (id, name, abbr, price, key) values
  ('00000000-0000-0000-0000-0000000000c1', '優勝ブレンド', '優ブレ', 500, '-'),
  ('00000000-0000-0000-0000-0000000000c2', '珈琲・俺ブレンド', '俺ブレ', 300, '^'),
  ('00000000-0000-0000-0000-0000000000c3', 'アイスミルク', 'ミルク', 100, '.'),
  ('00000000-0000-0000-0000-0000000000c4', 'トートセット', 'セット', 1000, '@'),
  ('00000000-0000-0000-0000-0000000000c5', 'アイスコーヒー', '氷', 400, '\');
insert into menu_items values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 1),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 1),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b3', 1),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b1', 1),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b4', 1),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000b5', 1);
