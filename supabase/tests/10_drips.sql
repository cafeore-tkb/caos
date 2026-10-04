-- caos スキーマの関数・トリガー・権限を、実際の運用の流れでなぞって確かめる。
-- 期待どおりでなければ NG: で止まる。scripts/test-supabase.sh から使う。

\set ON_ERROR_STOP 1
insert into caos.staff values ('staff@example.com');

-- 期待どおりでなければ止めるための関数（テスト用）
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'NG: %', label; end if;
  raise notice 'OK: %', label;
end $$;

-- スタッフとして RPC を呼ぶ
create function pg_temp.as_staff() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"email":"Staff@Example.com","app_metadata":{"providers":["google"]}}', true);
  perform set_config('role', 'authenticated', true);
end $$;

-- 注文 #1：優勝 3 杯・アイスミルク・トートセット（優勝＋トート）・俺ブレ（指名 ２）
begin;
insert into orders (id, order_id, created_at, billing_amount, received) values ('10000000-0000-0000-0000-000000000001', 1, now(), 0, 0);
insert into order_menus (order_id, menu_id, assignee, menu_name, unit_price) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', null, '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', null, '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '', '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', null, 'アイスミルク', 100),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c4', null, 'トートセット', 1000),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', ' ２ ', '俺ブレ', 300);
commit;
select pg_temp.check(
  (select array_agg(cups order by created_at) from caos.drips where order_ids = '{10000000-0000-0000-0000-000000000001}') = '{2,2,1}'::smallint[],
  '注文#1 は 優勝 2+2 杯と 俺ブレ 1 杯のカードになる（ミルク・トートは除く）');
select pg_temp.check(
  (select lines -> 0 ->> 'nominee' from caos.drips where lines -> 0 ->> 'abbr' = '俺ブレ') = '２',
  '指名は前後の空白を落として写す');

-- 注文 #2・#3：優勝 1 杯ずつ
begin;
insert into orders (id, order_id, created_at, billing_amount, received) values
  ('10000000-0000-0000-0000-000000000002', 2, now(), 0, 0), ('10000000-0000-0000-0000-000000000003', 3, now(), 0, 0);
insert into order_menus (order_id, menu_id, menu_name, unit_price) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', '優勝ブレンド', 500);
commit;

-- スタッフ以外は RPC を呼べない
do $$ begin
  perform set_config('request.jwt.claims', '{"email":"guest@example.com","app_metadata":{"providers":["google"]}}', true);
  perform set_config('role', 'authenticated', true);
  begin
    perform caos.next(1::smallint);
    raise exception 'NG: スタッフ以外が呼べてしまう';
  exception when insufficient_privilege then raise notice 'OK: スタッフ以外は RPC を呼べない';
  end;
end $$;

-- Google 以外（メール・パスワード）でログインした人は、スタッフのアドレスでも認めない
do $$ begin
  perform set_config('request.jwt.claims', '{"email":"staff@example.com","app_metadata":{"providers":["email"]}}', true);
  perform set_config('role', 'authenticated', true);
  begin
    perform caos.next(1::smallint);
    raise exception 'NG: メールのログインで呼べてしまう';
  exception when insufficient_privilege then raise notice 'OK: Google 以外のログインは RPC を呼べない';
  end;
end $$;

-- 統合：#2 と #3 の 1 杯を 2 杯の同時抽出に
begin;
select pg_temp.as_staff();
select caos.merge(
  (select id from caos.drips where order_ids = '{10000000-0000-0000-0000-000000000002}'),
  (select id from caos.drips where order_ids = '{10000000-0000-0000-0000-000000000003}')) as merged \gset
commit;
select pg_temp.check((select count(*) = 1 and min(cups) = 2 from caos.drips where '10000000-0000-0000-0000-000000000003' = any (order_ids)), '統合すると 1 枚 2 杯になる');
select pg_temp.check(jsonb_array_length(:'merged'::jsonb -> 'deleted') = 1, '統合の結果に消えたカードが入る');

-- 割当：#1 の優勝 2 枚をドリッパー 1 へ。1 枚目はすぐ抽出中、2 枚目は待機
begin;
select pg_temp.as_staff();
select caos.assign(id, 1::smallint) from caos.drips where lines -> 0 ->> 'abbr' = '優ブレ' and order_ids = '{10000000-0000-0000-0000-000000000001}' order by created_at;
commit;
select pg_temp.check((select array_agg(status order by created_at) from caos.drips where dripper = 1) = '{brewing,queued}', '空いているドリッパーに割り当てるとすぐ抽出中になる');

-- 注文の編集（Go の API と同じく明細を全部消して入れ直す）でも、カードは作り直さない
create temp table before_ids as select id from caos.drips;
begin;
delete from order_menus where order_id = '10000000-0000-0000-0000-000000000001';
insert into order_menus (order_id, menu_id, assignee, menu_name, unit_price) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', null, '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', null, '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', null, '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', null, 'アイスミルク', 100),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c4', null, 'トートセット', 1000),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', ' ２ ', '俺ブレ', 300);
commit;
select pg_temp.check((select count(*) from caos.drips where id not in (select id from before_ids)) = 0, '中身が同じ編集ではカードの id が変わらない');

-- 俺ブレを 1 杯増やす編集：割当済みはそのまま、未割当の俺ブレだけ 2 杯に作り直す
insert into order_menus (order_id, menu_id, assignee, menu_name, unit_price) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', '２', '俺ブレ', 300);
select pg_temp.check((select array_agg(cups order by created_at) from caos.drips where order_ids = '{10000000-0000-0000-0000-000000000001}' and status = 'unassigned') = '{2}'::smallint[], '杯数を増やすと未割当の分だけ作り直す');
select pg_temp.check((select count(*) from caos.drips where dripper = 1) = 2, '割当済みのカードは作り直さない');

-- 次へ：ドリッパー 1 の 1 枚目が終わり、2 枚目が始まる。注文 #1 はまだ俺ブレが残る
begin;
select pg_temp.as_staff();
select caos.next(1::smallint) as next1 \gset
commit;
select pg_temp.check((select array_agg(status order by created_at) from caos.drips where dripper = 1) = '{done,brewing}', '次へで次のカードが始まる');
select pg_temp.check(jsonb_array_length(:'next1'::jsonb -> 'readied') = 0, 'カードが残っている注文は準備完了にしない');

-- 俺ブレを 2 へ、次へ を 1・2 の順に押すと、注文 #1 が準備完了になる
begin;
select pg_temp.as_staff();
select caos.assign((select id from caos.drips where lines -> 0 ->> 'abbr' = '俺ブレ'), 2::smallint);
select caos.next(1::smallint);
select caos.next(2::smallint) as next2 \gset
commit;
select pg_temp.check((:'next2'::jsonb -> 'readied' ->> 0) = '10000000-0000-0000-0000-000000000001', '最後のカードの次へで注文が準備完了になる');
select pg_temp.check((select ready_at is not null from orders where order_id = 1), '注文 #1 に ready_at が付く');

-- 1つ戻す：最後の次へを取り消すと、抽出中に戻り ready_at も外れる
-- before は操作前の行。ここでは done → brewing に戻した行を渡す
begin;
select pg_temp.as_staff();
select caos.restore(
  (select jsonb_agg(jsonb_set(jsonb_set(x, '{status}', '"brewing"'), '{finished_at}', 'null')) from jsonb_array_elements(:'next2'::jsonb -> 'changed') x),
  :'next2'::jsonb -> 'changed', array['10000000-0000-0000-0000-000000000001']::uuid[]);
commit;
select pg_temp.check((select status from caos.drips where dripper = 2) = 'brewing', '1つ戻すで抽出中に戻る');
select pg_temp.check((select ready_at is null from orders where order_id = 1), '1つ戻すで ready_at が外れる');

-- 古い結果での 1つ戻すは断る
do $$ begin
  perform set_config('request.jwt.claims', '{"email":"staff@example.com","app_metadata":{"providers":["google"]}}', true);
  perform set_config('role', 'authenticated', true);
  begin
    perform caos.restore('[]', jsonb_build_array(jsonb_build_object('id', (select id from caos.drips where dripper = 2), 'updated_at', '2000-01-01T00:00:00Z')), '{}');
    raise exception 'NG: 古い結果で戻せてしまう';
  exception when raise_exception then raise notice 'OK: ほかの端末で変わったあとは 1つ戻すを断る';
  end;
end $$;

-- POS で準備完了：統合カード（#2+#3）をドリッパー 3 で抽出中にし、POS で #2 を準備完了にする
begin;
select pg_temp.as_staff();
select caos.assign((select id from caos.drips where '10000000-0000-0000-0000-000000000002' = any (order_ids)), 3::smallint);
commit;
update orders set ready_at = now() where order_id = 2;
select pg_temp.check((select status from caos.drips where '10000000-0000-0000-0000-000000000002' = any (order_ids)) = 'done', 'POS で準備完了にすると抽出終了になる');
select pg_temp.check((select ready_at is not null from orders where order_id = 3), '統合相手の注文も準備完了になる');

-- 入れ直し：終わった統合カードを 1 杯、ドリッパー 4 で入れ直す
begin;
select pg_temp.as_staff();
select caos.rebrew((select id from caos.drips where '10000000-0000-0000-0000-000000000002' = any (order_ids) and rebrew_of is null), 1::smallint, false, 4::smallint, null) as rebrew \gset
commit;
select pg_temp.check((select status = 'brewing' and cups = 1 and jsonb_array_length(lines) = 1 from caos.drips where rebrew_of is not null), '入れ直しは 1 杯で空いているドリッパーですぐ始まる');

-- 入れ直しの取り消し：できたカードが消える
begin;
select pg_temp.as_staff();
select caos.restore(
  (select coalesce(jsonb_agg(to_jsonb(d)), '[]') from caos.drips d where d.id in (select (x ->> 'id')::uuid from jsonb_array_elements(:'rebrew'::jsonb -> 'changed') x) and d.rebrew_of is null),
  :'rebrew'::jsonb -> 'changed', '{}');
commit;
select pg_temp.check((select count(*) from caos.drips where rebrew_of is not null) = 0, '入れ直しを取り消すとカードが消える');

-- 注文の削除：未割当のカードが片付く
begin;
insert into orders (id, order_id, created_at, billing_amount, received) values ('10000000-0000-0000-0000-000000000004', 4, now(), 0, 0);
insert into order_menus (order_id, menu_id, menu_name, unit_price) values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000c5', 'アイスコーヒー', 400);
commit;
select pg_temp.check((select count(*) from caos.drips where order_ids = '{10000000-0000-0000-0000-000000000004}') = 1, 'アイスコーヒーはカードになる');
begin;
delete from order_menus where order_id = '10000000-0000-0000-0000-000000000004';
delete from orders where id = '10000000-0000-0000-0000-000000000004';
commit;
select pg_temp.check((select count(*) from caos.drips where order_ids = '{10000000-0000-0000-0000-000000000004}') = 0, '注文を消すとカードも消える');

-- 権限：匿名キーでは POS の表も CaOS の表も読めない。スタッフも表は直接書けない
do $$ begin
  perform set_config('role', 'anon', true);
  begin perform 1 from public.orders; raise exception 'NG: anon が orders を読める';
  exception when insufficient_privilege then raise notice 'OK: anon は public.orders を読めない'; end;
  begin perform 1 from caos.drips; raise exception 'NG: anon が drips を読める';
  exception when insufficient_privilege then raise notice 'OK: anon は caos.drips を読めない'; end;
end $$;
do $$ begin
  perform set_config('request.jwt.claims', '{"email":"staff@example.com","app_metadata":{"providers":["google"]}}', true);
  perform set_config('role', 'authenticated', true);
  if (select count(*) from caos.drips) = 0 then raise exception 'NG: スタッフが読めない'; end if;
  raise notice 'OK: スタッフは caos.drips を読める';
  begin update caos.drips set cups = 1; raise exception 'NG: スタッフが表を直接書ける';
  exception when insufficient_privilege then raise notice 'OK: 表は直接書き換えられない（RPC だけ）'; end;
  perform set_config('request.jwt.claims', '{"email":"guest@example.com","app_metadata":{"providers":["google"]}}', true);
  if (select count(*) from caos.drips) <> 0 then raise exception 'NG: スタッフ以外が読める'; end if;
  raise notice 'OK: スタッフ以外には 0 件に見える（RLS）';
end $$;
