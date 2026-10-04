-- caos スキーマ（抽出カード）を、運用の流れと権限でなぞって確かめる。トランザクションの中で行い、最後に取り消す（何も残さない）。
-- ローカルの Supabase（supabase start）か、Supabase の代役（stub_supabase.sql）を入れた素の Postgres で。
-- POS の表とテスト用の商品は pos_tables.sql が用意する。まとめて流すのは scripts/test-supabase.sh。
-- 本番（POS と共有）では流さないこと。
\set QUIET on
\set ON_ERROR_STOP on
begin;

create function pg_temp.expect_error(q text, code text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlstate <> code then
      raise exception 'expected % but got % (%) for: %', code, sqlstate, sqlerrm, q;
    end if;
    return;
  end;
  raise exception 'expected % but it succeeded: %', code, q;
end $$;
create function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok: %', label;
end $$;
-- ログインした人になる（provider を変えると Google 以外のログイン。email を null にすると未ログイン＝anon）
create function pg_temp.login(email text, provider text default 'google') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', gen_random_uuid(), 'email', email, 'role', 'authenticated', 'is_anonymous', false,
                       'app_metadata', jsonb_build_object('provider', provider, 'providers', jsonb_build_array(provider)))::text, true);
  perform set_config('role', case when email is null then 'anon' else 'authenticated' end, true);
end $$;
-- 注文の明細のトリガーはトランザクションの終わりで動くので、ここで動かす
create function pg_temp.commit_point() returns void language plpgsql as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end $$;
-- 注文番号（と商品の略称）でカードを探す。nth 番目（0 始まり）。スタッフになっていても使えるよう、テストを流す人の権限で読む
create function pg_temp.drip(order_no int, abbr text default null, nth int default 0) returns uuid language sql security definer as $$
  select id from caos.drips d
  where exists (select 1 from jsonb_array_elements(d.lines) l where (l ->> 'order_no')::int = order_no)
    and (abbr is null or d.lines -> 0 ->> 'abbr' = abbr)
  order by d.created_at, d.id offset nth limit 1
$$;
create function pg_temp.broadcasts() returns bigint language sql as $$
  select count(*) from realtime.messages where topic = 'caos:drips'
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into caos.staff (email) values ('staff@x.jp');

-- ---- 注文 → カード ----
-- 注文 #1：優勝 3 杯・アイスミルク・トートセット（優勝＋トート）・俺ブレ（指名 ２）
insert into public.orders (id, order_id, created_at, billing_amount, received) values ('10000000-0000-0000-0000-000000000001', 1, now(), 0, 0);
insert into public.order_menus (order_id, menu_id, assignee, menu_name, unit_price) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', null, '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', null, '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '', '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', null, 'アイスミルク', 100),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c4', null, 'トートセット', 1000),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', ' ２ ', '俺ブレ', 300);
-- 注文 #2・#3：優勝 1 杯ずつ
insert into public.orders (id, order_id, created_at, billing_amount, received) values
  ('10000000-0000-0000-0000-000000000002', 2, now(), 0, 0), ('10000000-0000-0000-0000-000000000003', 3, now(), 0, 0);
insert into public.order_menus (order_id, menu_id, menu_name, unit_price) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', '優勝ブレンド', 500);
select pg_temp.ok((select count(*) from caos.drips) = 0, '明細のトリガーはトランザクションの終わりまで待つ');
select pg_temp.commit_point();

select pg_temp.ok(
  (select array_agg(cups order by created_at) from caos.drips where order_ids = '{10000000-0000-0000-0000-000000000001}') = '{2,2,1}'::smallint[],
  '注文 #1 は 優勝 2+2 杯と 俺ブレ 1 杯のカードになる（ミルク・トートは除く）');
select pg_temp.ok((select lines -> 0 ->> 'nominee' from caos.drips where id = pg_temp.drip(1, '俺ブレ')) = '２', '指名は前後の空白を落として写す');
select pg_temp.ok(pg_temp.broadcasts() >= 2, 'カードができたことを caos:drips に知らせる');

-- ---- 未ログイン（anon）・スタッフでない人 ----
select pg_temp.login(null);
select pg_temp.expect_error('select * from caos.drips', '42501');
select pg_temp.expect_error('select * from public.orders limit 0', '42501');
select pg_temp.expect_error($q$ select caos.list_drips(now() - interval '1 day') $q$, '42501');
reset role;
select pg_temp.login('guest@x.jp');
select pg_temp.expect_error('select * from caos.drips', '42501');
select pg_temp.expect_error($q$ select caos.list_drips(now() - interval '1 day') $q$, '42501');
select pg_temp.expect_error('select caos.next(1)', '42501');
reset role;
-- Google 以外（メール・パスワード）でログインした人は、スタッフのアドレスでも認めない
select pg_temp.login('staff@x.jp', 'email');
select pg_temp.expect_error($q$ select caos.list_drips(now() - interval '1 day') $q$, '42501');
reset role;
select pg_temp.ok(true, 'スタッフ以外・未ログイン・Google 以外のログインは、表も関数も使えない');

-- ---- スタッフ ----
select pg_temp.login('Staff@X.jp');
select pg_temp.expect_error('select * from caos.drips', '42501');
select pg_temp.expect_error('update caos.drips set cups = 1', '42501');
select pg_temp.ok(jsonb_array_length(caos.list_drips(now() - interval '1 day') -> 'drips') = 5, 'スタッフは関数でその日のカードを読める（表は直接読めない）');

-- 統合：#2 と #3 の 1 杯を 2 杯の同時抽出に
select caos.merge(pg_temp.drip(2), pg_temp.drip(3)) as merged \gset
reset role;
select pg_temp.ok((select count(*) = 1 and min(cups) = 2 from caos.drips where '10000000-0000-0000-0000-000000000003' = any (order_ids)), '統合すると 1 枚 2 杯になる');
select pg_temp.ok(jsonb_array_length(:'merged'::jsonb -> 'deleted') = 1, '統合の結果に消えたカードが入る');
select pg_temp.login('staff@x.jp');
select pg_temp.expect_error(format('select caos.merge(%L, %L)', pg_temp.drip(1, '優ブレ'), pg_temp.drip(1, '俺ブレ')), 'P0001');

-- 割当：#1 の優勝 2 枚をドリッパー 1 へ。1 枚目はすぐ抽出中、2 枚目は待機
select caos.assign(pg_temp.drip(1, '優ブレ', 0), 1);
select caos.assign(pg_temp.drip(1, '優ブレ', 1), 1);
reset role;
select pg_temp.ok((select array_agg(status order by created_at) from caos.drips where dripper = 1) = '{brewing,queued}', '空いているドリッパーに割り当てるとすぐ抽出中になる');
select pg_temp.ok(
  (select payload -> 'drips' @> jsonb_build_array(jsonb_build_object('id', pg_temp.drip(1, '優ブレ'), 'status', 'brewing'))
   from realtime.messages where topic = 'caos:drips' order by id desc limit 1 offset 1),
  '割当の Broadcast に、変わった後のカードが入る');
select pg_temp.ok(
  (select bool_and(private) and bool_and(event = 'drips') and count(distinct payload -> 'v') = count(*) from realtime.messages where topic = 'caos:drips'),
  'Broadcast は private で、版（v）が 1 通ずつ違う');

-- 注文の編集（Go の API と同じく明細を全部消して入れ直す）でも、中身が同じならカードを作り直さず、知らせもしない
create temp table before_ids as select id from caos.drips;
select pg_temp.broadcasts() as sent_before_edit \gset
delete from public.order_menus where order_id = '10000000-0000-0000-0000-000000000001';
insert into public.order_menus (order_id, menu_id, assignee, menu_name, unit_price) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', null, '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', null, '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', null, '優勝ブレンド', 500),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', null, 'アイスミルク', 100),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c4', null, 'トートセット', 1000),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', ' ２ ', '俺ブレ', 300);
select pg_temp.commit_point();
select pg_temp.ok((select count(*) from caos.drips where id not in (select id from before_ids)) = 0, '中身が同じ編集ではカードの id が変わらない');
select pg_temp.ok(pg_temp.broadcasts() = :sent_before_edit, '何も変わらなければ知らせない（版も進めない）');

-- 俺ブレを 1 杯増やす編集：割当済みはそのまま、未割当の俺ブレだけ 2 杯に作り直す
insert into public.order_menus (order_id, menu_id, assignee, menu_name, unit_price) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', '２', '俺ブレ', 300);
select pg_temp.commit_point();
select pg_temp.ok((select array_agg(cups order by created_at) from caos.drips where order_ids = '{10000000-0000-0000-0000-000000000001}' and status = 'unassigned') = '{2}'::smallint[], '杯数を増やすと未割当の分だけ作り直す');
select pg_temp.ok((select count(*) from caos.drips where dripper = 1) = 2, '割当済みのカードは作り直さない');

-- 次へ：ドリッパー 1 の 1 枚目が終わり、2 枚目が始まる。注文 #1 はまだ俺ブレが残る
select pg_temp.login('staff@x.jp');
select caos.next(1) as next1 \gset
reset role;
select pg_temp.ok((select array_agg(status order by created_at) from caos.drips where dripper = 1) = '{done,brewing}', '次へで次のカードが始まる');
select pg_temp.ok(jsonb_array_length(:'next1'::jsonb -> 'readied') = 0, 'カードが残っている注文は準備完了にしない');

-- 俺ブレを 2 へ、次へ を 1・2 の順に押すと、注文 #1 が準備完了になる
select pg_temp.login('staff@x.jp');
select caos.assign(pg_temp.drip(1, '俺ブレ'), 2);
select caos.next(1);
select caos.next(2) as next2 \gset
reset role;
select pg_temp.ok((:'next2'::jsonb -> 'readied' ->> 0) = '10000000-0000-0000-0000-000000000001', '最後のカードの次へで注文が準備完了になる');
select pg_temp.ok((select ready_at is not null from public.orders where order_id = 1), '注文 #1 に ready_at が付く');

-- 1つ戻す：最後の次へを取り消すと、抽出中に戻り ready_at も外れる（before は操作の前の行）
select pg_temp.login('staff@x.jp');
select caos.restore(
  (select jsonb_agg(jsonb_set(jsonb_set(x, '{status}', '"brewing"'), '{finished_at}', 'null')) from jsonb_array_elements(:'next2'::jsonb -> 'changed') x),
  :'next2'::jsonb -> 'changed', array['10000000-0000-0000-0000-000000000001']::uuid[]);
reset role;
select pg_temp.ok((select status from caos.drips where dripper = 2) = 'brewing', '1つ戻すで抽出中に戻る');
select pg_temp.ok((select ready_at is null from public.orders where order_id = 1), '1つ戻すで ready_at が外れる');
-- ほかの端末が後から動かしていたら断る
select pg_temp.login('staff@x.jp');
select pg_temp.expect_error(format('select caos.restore(%L, %L, %L)', '[]',
  jsonb_build_array(jsonb_build_object('id', pg_temp.drip(1, '俺ブレ'), 'updated_at', '2000-01-01T00:00:00Z')), '{}'), 'P0001');
reset role;

-- POS で準備完了：統合カード（#2+#3）をドリッパー 3 で抽出中にし、POS で #2 を準備完了にする
select pg_temp.login('staff@x.jp');
select caos.assign(pg_temp.drip(2), 3);
reset role;
update public.orders set ready_at = now() where order_id = 2;
select pg_temp.ok((select status from caos.drips where id = pg_temp.drip(2)) = 'done', 'POS で準備完了にすると抽出終了になる');
select pg_temp.ok((select ready_at is not null from public.orders where order_id = 3), '統合相手の注文も準備完了になる');

-- 入れ直し：終わった統合カードを 1 杯、ドリッパー 4 で入れ直す。取り消すとカードが消える
select pg_temp.login('staff@x.jp');
select caos.rebrew(pg_temp.drip(2), 1, false, 4, null) as rebrew \gset
reset role;
select pg_temp.ok((select status = 'brewing' and cups = 1 and jsonb_array_length(lines) = 1 from caos.drips where rebrew_of is not null), '入れ直しは 1 杯で、空いているドリッパーですぐ始まる');
-- 操作の前からあった行（元のカード）。画面は手元に持っている
select coalesce(jsonb_agg(to_jsonb(d)), '[]') as rebrew_before from caos.drips d
where d.id in (select (x ->> 'id')::uuid from jsonb_array_elements(:'rebrew'::jsonb -> 'changed') x) and d.rebrew_of is null \gset
select pg_temp.login('staff@x.jp');
select caos.restore(:'rebrew_before'::jsonb, :'rebrew'::jsonb -> 'changed', '{}');
reset role;
select pg_temp.ok((select count(*) from caos.drips where rebrew_of is not null) = 0, '入れ直しを取り消すとカードが消える');

-- 注文の削除：未割当のカードが片付く
insert into public.orders (id, order_id, created_at, billing_amount, received) values ('10000000-0000-0000-0000-000000000004', 4, now(), 0, 0);
insert into public.order_menus (order_id, menu_id, menu_name, unit_price) values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000c5', 'アイスコーヒー', 400);
select pg_temp.commit_point();
select pg_temp.ok((select count(*) from caos.drips where order_ids = '{10000000-0000-0000-0000-000000000004}') = 1, 'アイスコーヒーはカードになる');
delete from public.order_menus where order_id = '10000000-0000-0000-0000-000000000004';
delete from public.orders where id = '10000000-0000-0000-0000-000000000004';
select pg_temp.commit_point();
select pg_temp.ok((select count(*) from caos.drips where order_ids = '{10000000-0000-0000-0000-000000000004}') = 0, '注文を消すとカードも消える');

-- ---- Realtime の受信の許可 ----
select set_config('realtime.topic', 'caos:drips', true);
select pg_temp.login('staff@x.jp');
select pg_temp.ok((select count(*) > 0 from realtime.messages where topic = 'caos:drips'), 'スタッフは caos:drips を受け取れる');
reset role;
select pg_temp.login('guest@x.jp');
select pg_temp.ok((select count(*) = 0 from realtime.messages where topic = 'caos:drips'), 'スタッフでない人は caos:drips を受け取れない');
reset role;
select set_config('realtime.topic', 'shift:room:x', true);
select pg_temp.login('staff@x.jp');
select pg_temp.ok((select count(*) = 0 from realtime.messages where topic = 'caos:drips'), 'ほかのチャンネルを購読しても caos:drips は届かない');
reset role;

-- ---- CaOS が壊れていても POS は止めない ----
savepoint broken;
alter table caos.drips rename to drips_broken;
insert into public.orders (id, order_id, created_at, billing_amount, received) values ('10000000-0000-0000-0000-000000000010', 10, now(), 0, 0);
insert into public.order_menus (order_id, menu_id, menu_name, unit_price) values ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000c1', '優勝ブレンド', 500);
update public.orders set ready_at = now() where order_id = 10;
select pg_temp.commit_point();
select pg_temp.ok((select ready_at is not null from public.orders where order_id = 10), 'CaOS の処理が失敗しても、POS の注文の登録と準備完了は通る');
rollback to savepoint broken;

rollback;
\echo 'caos_test: all passed'
