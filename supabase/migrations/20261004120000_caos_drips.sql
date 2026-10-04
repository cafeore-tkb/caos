-- CaOS（ドリップ管制）の抽出カード。
-- cafeore-pos と同じ Supabase プロジェクトに置くので、すべて caos スキーマの中に作る。
-- public（POS の表）には、注文と抽出カードをつなぐトリガーを付けるだけで、表も権限も変えない。
-- Data API（Exposed schemas）には caos を足す（ShiftMaker の shift と並べる。public は出さない）。
--
-- ブラウザ（anon / authenticated）からはテーブルを直接読み書きさせず、このファイルの関数（RPC）だけを呼ばせる。
-- テーブルは RLS を有効にしてポリシーを作らない（関数を通さない読み書きはすべて拒否）。
-- カードの変更は Realtime の Broadcast（private チャンネル caos:drips）で、スタッフにだけ届ける。
-- 作法は ShiftMaker（cafeore-tkb/sohosai-shift の supabase/migrations）にそろえている。
--
-- POS とのつながり：
--   - 注文の明細（public.order_menus）が入る・変わる → 抽出カードを作る（caos.sync_order）
--   - 注文に ready_at が付く（POS で準備完了・提供済み）→ その注文のカードを抽出終了にし、次のカードを始める（caos.finish_order）
--   - CaOS で「次へ」を押して注文のカードが全部終わる → 注文に ready_at を付ける（caos.complete_orders）

create schema if not exists caos;
grant usage on schema caos to anon, authenticated, service_role;

-- このスキーマに作る関数は、明示して渡したものだけを実行できるようにする（Postgres の既定では PUBLIC が実行できる）
alter default privileges in schema caos revoke execute on functions from public;

-- ---------------------------------------------------------------- テーブル

-- 書き込んでよいスタッフ（Google ログインのメールアドレス、小文字）。ダッシュボードか SQL で足す
create table caos.staff (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- 抽出カード。1 回のドリップ（最大 2 杯）が 1 行。
-- 保存するのは事実だけ（どの注文の何杯か、担当、状態、開始・終了時刻）。待機カードの予定時刻は画面で計算する。
create table caos.drips (
  id uuid primary key default gen_random_uuid(),
  -- unassigned：未割当 / queued：担当の待機列 / brewing：抽出中 / done：抽出終了
  status text not null default 'unassigned' check (status in ('unassigned', 'queued', 'brewing', 'done')),
  -- 担当のドリッパー（1〜6）
  dripper smallint check (dripper between 1 and 6),
  -- 待機列の並び順。ふだんは注文番号で、入れ直しのときだけ差し込む位置に合わせる
  queue_pos numeric not null,
  -- 中身の注文。統合したカードは 2 注文になる
  order_ids uuid[] not null check (cardinality(order_ids) > 0),
  -- 中身の明細。[{order_id, order_no, item_id, name, abbr, type, nominee, cups}]
  -- 注文番号や商品名はカードを作った時点のものを写しておく（画面が public を読まずに済むように）
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  cups smallint not null check (cups between 1 and 2),
  -- 入れ直しのカードなら、元のカード
  rebrew_of uuid references caos.drips (id) on delete set null,
  -- 入れ直しのために途中でやめた抽出
  interrupted boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'unassigned' and dripper is null)
    or (status in ('queued', 'brewing') and dripper is not null)
    or status = 'done'
  )
);

-- 1 人のドリッパーが同時に抽出できるのは 1 枚だけ
create unique index drips_one_brewing_per_dripper on caos.drips (dripper) where status = 'brewing';
create index drips_order_ids on caos.drips using gin (order_ids);
create index drips_created_at on caos.drips (created_at);

-- Broadcast の版。送るたびに 1 ずつ増える。画面は飛んだのに気づいたら読み直す
create sequence caos.board_version;

alter table caos.staff enable row level security;
alter table caos.drips enable row level security;
revoke all on all tables in schema caos from anon, authenticated;
revoke all on all sequences in schema caos from anon, authenticated;

-- ---------------------------------------------------------------- だれか

-- ログインしている人のメールアドレス（小文字）。Google でログインした人だけ（メール・パスワードや匿名のログインは認めない）。
-- app_metadata は本人が書き換えられない（user_metadata は書き換えられるので見ない）。ShiftMaker の shift.me() と同じ
create function caos.me() returns text
language sql stable
set search_path = ''
as $$
  select case
    when coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then null
    when coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google' then lower(auth.jwt() ->> 'email')
  end
$$;

create function caos.is_staff() returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (select 1 from caos.staff where email = caos.me())
$$;

-- スタッフでなければ止める。画面はエラーの hint（login / denied）で出し分ける
create function caos.require_staff() returns text
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  e text := caos.me();
begin
  if e is null then
    raise exception 'ログインが必要です' using errcode = '42501', hint = 'login';
  end if;
  if not caos.is_staff() then
    raise exception '% は CaOS のスタッフとして登録されていません', e using errcode = '42501', hint = 'denied';
  end if;
  return e;
end
$$;

create function caos.invalid(msg text) returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', msg using errcode = 'P0001', hint = 'invalid';
end
$$;

-- ---------------------------------------------------------------- 知らせる

-- 変わったカードをスタッフみんなに知らせる（Realtime の Broadcast、private チャンネル caos:drips）。
-- payload：v＝版、drips＝変わった後のカード、deleted＝消したカード。大きすぎるときは reload だけ（受け取った側が読み直す）
create function caos.emit(p_ids uuid[], p_deleted uuid[] default '{}') returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  -- 何も変わっていなければ版を進めない（進めると、受け取った側が取りこぼしと思って読み直す）
  if coalesce(cardinality(p_ids), 0) = 0 and coalesce(cardinality(p_deleted), 0) = 0 then
    return;
  end if;
  payload := jsonb_build_object(
    'v', nextval('caos.board_version'),
    'drips', coalesce((select jsonb_agg(to_jsonb(d)) from caos.drips d where d.id = any (p_ids)), '[]'),
    'deleted', to_jsonb(coalesce(p_deleted, '{}'))
  );
  if octet_length(payload::text) > 100000 then
    payload := jsonb_build_object('v', payload -> 'v', 'reload', true);
  end if;
  perform realtime.send(payload, 'drips', 'caos:drips', true);
end
$$;

-- RPC の返り値。知らせたうえで、呼んだ画面には変わったカード・消したカード・準備完了にした注文を返す
-- （画面は Broadcast を待たずにすぐ反映し、「1つ戻す」に使う）
create function caos.reply(p_ids uuid[], p_deleted uuid[] default '{}', p_readied uuid[] default '{}') returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  p_ids := array(select distinct x from unnest(p_ids) x where x is not null);
  perform caos.emit(p_ids, p_deleted);
  return jsonb_build_object(
    'changed', coalesce((select jsonb_agg(to_jsonb(d)) from caos.drips d where d.id = any (p_ids)), '[]'),
    'deleted', to_jsonb(coalesce(p_deleted, '{}')),
    'readied', to_jsonb(coalesce(p_readied, '{}'))
  );
end
$$;

-- ---------------------------------------------------------------- 内部（RPC とトリガーから使う）

-- ドリッパーが空いていれば、待機列の先頭（queue_pos が一番小さいもの）の抽出を始め、そのカードを返す
create function caos.promote(p_dripper int) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_dripper is null
    or exists (select 1 from caos.drips where dripper = p_dripper and status = 'brewing') then
    return null;
  end if;
  update caos.drips
  set status = 'brewing', started_at = now(), updated_at = now()
  where id = (
    select id from caos.drips
    where dripper = p_dripper and status = 'queued'
    order by queue_pos, created_at
    limit 1
  )
  returning id into v_id;
  return v_id;
end
$$;

-- カードが全部抽出終了になった注文に ready_at を付け、付けた注文を返す。
-- 入れ直しのカードも終わるまで待つ。既に準備完了の注文はそのまま
create function caos.complete_orders(p_order_ids uuid[]) returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_readied uuid[];
begin
  with targets as (
    select o.id
    from public.orders o
    where o.id = any (p_order_ids)
      and o.ready_at is null
      and exists (select 1 from caos.drips d where o.id = any (d.order_ids))
      and not exists (select 1 from caos.drips d where o.id = any (d.order_ids) and d.status <> 'done')
  ),
  readied as (
    update public.orders o set ready_at = now()
    from targets t
    where o.id = t.id
    returning o.id
  )
  select coalesce(array_agg(id), '{}') into v_readied from readied;
  return v_readied;
end
$$;

-- 注文の明細から、あるべき抽出カード（最大 2 杯ずつ）を作り直す。
--
-- 作り直すのは「未割当で、その注文だけのカード」だけ。割当済み・抽出中・終了・統合・入れ直しのカードには触らず、
-- その分の杯数を差し引いて足りない分だけ作る。明細のトリガーから 1 行ごとに呼ばれるので、
-- 中身が変わらないときは何もしない（カードの id が変わると、画面で選んでいたカードが外れてしまう）。
create function caos.sync_order(p_order_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_wanted jsonb := '[]';
  v_current jsonb;
  v_group record;
  v_remaining int;
  v_cups int;
  v_deleted uuid[];
  v_changed uuid[];
begin
  select * into v_order from public.orders where id = p_order_id;

  if not found then
    -- 注文が消えた。終わっていないカードからその注文を外す
    with gone as (
      delete from caos.drips
      where order_ids = array[p_order_id] and status <> 'done'
      returning id
    )
    select coalesce(array_agg(id), '{}') into v_deleted from gone;
    with trimmed as (
      update caos.drips d
      set lines = coalesce((
            select jsonb_agg(l) from jsonb_array_elements(d.lines) l
            where (l ->> 'order_id')::uuid <> p_order_id
          ), '[]'),
          order_ids = array_remove(d.order_ids, p_order_id),
          cups = (
            select coalesce(sum((l ->> 'cups')::int), 0) from jsonb_array_elements(d.lines) l
            where (l ->> 'order_id')::uuid <> p_order_id
          ),
          updated_at = now()
      where p_order_id = any (d.order_ids) and d.status <> 'done'
      returning d.id
    )
    select coalesce(array_agg(id), '{}') into v_changed from trimmed;
    perform caos.emit(v_changed, v_deleted);
    return;
  end if;

  -- 準備完了・提供済みの注文には、もうカードを作らない
  if v_order.ready_at is not null or v_order.served_at is not null then
    return;
  end if;

  for v_group in
    with wanted as (
      -- アイスミルク（milk）とグッズ（others）は抽出しない
      select it.id as item_id, it.name, it.abbr, ty.name as type,
             nullif(btrim(om.assignee), '') as nominee,
             sum(mi.quantity)::int as cups
      from public.order_menus om
      join public.menu_items mi on mi.menu_id = om.menu_id
      join public.items it on it.id = mi.item_id
      join public.item_types ty on ty.id = it.item_type_id
      where om.order_id = p_order_id and ty.name not in ('others', 'milk')
      group by it.id, it.name, it.abbr, ty.name, nullif(btrim(om.assignee), '')
    )
    select w.*,
           coalesce((
             select sum((l ->> 'cups')::int)
             from caos.drips d, jsonb_array_elements(d.lines) l
             where p_order_id = any (d.order_ids)
               and d.rebrew_of is null
               and not (d.status = 'unassigned' and d.order_ids = array[p_order_id])
               and (l ->> 'order_id')::uuid = p_order_id
               and (l ->> 'item_id')::uuid = w.item_id
               and (l ->> 'nominee') is not distinct from w.nominee
           ), 0) as locked
    from wanted w
    order by w.type, w.name, w.nominee nulls first
  loop
    v_remaining := v_group.cups - v_group.locked;
    while v_remaining > 0 loop
      v_cups := least(2, v_remaining);
      v_wanted := v_wanted || jsonb_build_array(jsonb_build_object(
        'order_id', p_order_id,
        'order_no', v_order.order_id,
        'item_id', v_group.item_id,
        'name', v_group.name,
        'abbr', v_group.abbr,
        'type', v_group.type,
        'nominee', v_group.nominee,
        'cups', v_cups
      ));
      v_remaining := v_remaining - v_cups;
    end loop;
  end loop;

  select coalesce(jsonb_agg(d.lines -> 0), '[]') into v_current
  from caos.drips d
  where d.order_ids = array[p_order_id] and d.status = 'unassigned' and d.rebrew_of is null;

  if (select coalesce(jsonb_agg(x order by x ->> 'item_id', x ->> 'nominee', (x ->> 'cups')::int), '[]')
      from jsonb_array_elements(v_current) x)
     = (select coalesce(jsonb_agg(x order by x ->> 'item_id', x ->> 'nominee', (x ->> 'cups')::int), '[]')
        from jsonb_array_elements(v_wanted) x) then
    return;
  end if;

  with gone as (
    delete from caos.drips
    where order_ids = array[p_order_id] and status = 'unassigned' and rebrew_of is null
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_deleted from gone;

  with made as (
    insert into caos.drips (status, queue_pos, order_ids, lines, cups, created_at)
    select 'unassigned', v_order.order_id, array[p_order_id], jsonb_build_array(x), (x ->> 'cups')::int,
           -- 同じ注文の中の順番を保つため、作った順に少しずつずらす
           now() + (ordinality * interval '1 microsecond')
    from jsonb_array_elements(v_wanted) with ordinality as t (x, ordinality)
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_changed from made;

  perform caos.emit(v_changed, v_deleted);
end
$$;

-- 注文に ready_at が付いた（POS で準備完了・提供済みにした）とき、その注文のカードを抽出終了にする。
-- 抽出中だったドリッパーは次のカードを始める。統合していた相手の注文も、それでカードが全部終わったなら準備完了にする
create function caos.finish_order(p_order_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_finished uuid[];
  v_drippers int[];
  v_others uuid[];
  v_dripper int;
  v_promoted uuid[] := '{}';
begin
  with finished as (
    update caos.drips
    set status = 'done', finished_at = now(), updated_at = now()
    where p_order_id = any (order_ids) and status <> 'done' and rebrew_of is null
    returning id, dripper, order_ids
  )
  select coalesce(array_agg(distinct f.id), '{}'),
         coalesce(array_agg(distinct f.dripper) filter (where f.dripper is not null), '{}'),
         coalesce(array_agg(distinct o) filter (where o <> p_order_id), '{}')
  into v_finished, v_drippers, v_others
  from finished f left join lateral unnest(f.order_ids) as o on true;

  foreach v_dripper in array v_drippers loop
    v_promoted := v_promoted || caos.promote(v_dripper);
  end loop;
  perform caos.emit(array_remove(v_finished || v_promoted, null));
  if cardinality(v_others) > 0 then
    perform caos.complete_orders(v_others);
  end if;
end
$$;

-- ---------------------------------------------------------------- RPC（CaOS の画面から呼ぶ）

-- その日のカードを読む（つないだとき・読み直すとき）。v は今の版（これより後の Broadcast を待つ）
create function caos.list_drips(p_since timestamptz) returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform caos.require_staff();
  return jsonb_build_object(
    'v', (select case when is_called then last_value else 0 end from caos.board_version),
    'drips', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from caos.drips d where d.created_at >= p_since), '[]')
  );
end
$$;

-- 未割当・待機中のカードをドリッパーへ割り当てる（別のドリッパーへの移動も同じ）。
-- ドリッパーが空いていれば、そのまま抽出を始める
create function caos.assign(p_drip_id uuid, p_dripper int) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_drip caos.drips%rowtype;
begin
  perform caos.require_staff();
  select * into v_drip from caos.drips where id = p_drip_id for update;
  if not found or v_drip.status not in ('unassigned', 'queued') then
    perform caos.invalid('このカードは割り当てられません');
  end if;
  update caos.drips
  set status = 'queued', dripper = p_dripper, updated_at = now()
  where id = p_drip_id;
  return caos.reply(array[p_drip_id, caos.promote(p_dripper)]);
end
$$;

-- 待機中のカードを未割当に戻す
create function caos.unassign(p_drip_id uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform caos.require_staff();
  update caos.drips
  set status = 'unassigned', dripper = null, updated_at = now()
  where id = p_drip_id and status = 'queued';
  if not found then
    perform caos.invalid('このカードは未割当に戻せません');
  end if;
  return caos.reply(array[p_drip_id]);
end
$$;

-- 「次へ」。ドリッパーの抽出中のカードを終わらせ、待機列の次を始める。
-- 注文のカードが全部終わったら、その注文を準備完了にする
create function caos.next(p_dripper int) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_done caos.drips%rowtype;
begin
  perform caos.require_staff();
  update caos.drips
  set status = 'done', finished_at = now(), updated_at = now()
  where dripper = p_dripper and status = 'brewing'
  returning * into v_done;
  if not found then
    perform caos.invalid(format('ドリッパー %s は抽出中ではありません', p_dripper));
  end if;
  return caos.reply(array[v_done.id, caos.promote(p_dripper)], '{}', caos.complete_orders(v_done.order_ids));
end
$$;

-- 同じ商品・同じ指名の 1 杯の未割当カード同士を、2 杯の同時抽出にまとめる
create function caos.merge(p_first_id uuid, p_second_id uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first caos.drips%rowtype;
  v_second caos.drips%rowtype;
begin
  perform caos.require_staff();
  select * into v_first from caos.drips where id = p_first_id for update;
  select * into v_second from caos.drips where id = p_second_id for update;
  if v_first.id is null or v_second.id is null or v_first.id = v_second.id
    or v_first.status <> 'unassigned' or v_second.status <> 'unassigned'
    or v_first.cups <> 1 or v_second.cups <> 1
    or v_first.rebrew_of is not null or v_second.rebrew_of is not null
    or (v_first.lines -> 0 ->> 'item_id') is distinct from (v_second.lines -> 0 ->> 'item_id')
    or (v_first.lines -> 0 ->> 'nominee') is distinct from (v_second.lines -> 0 ->> 'nominee') then
    perform caos.invalid('このカード同士は統合できません');
  end if;
  update caos.drips
  set lines = v_first.lines || v_second.lines,
      order_ids = array(select distinct unnest(v_first.order_ids || v_second.order_ids)),
      cups = 2,
      queue_pos = least(v_first.queue_pos, v_second.queue_pos),
      updated_at = now()
  where id = p_first_id;
  delete from caos.drips where id = p_second_id;
  return caos.reply(array[p_first_id], array[p_second_id]);
end
$$;

-- 入れ直し。元のカード（抽出中・終了）と同じ中身で、杯数を選んだ新しいカードを作る。
--   p_interrupt：抽出中の元のカードを途中でやめる
--   p_dripper：  担当。null なら未割当に置く
--   p_queue_pos：待機列での位置（画面が前後のカードの間の値を渡す）。null なら元の注文番号の位置
create function caos.rebrew(
  p_source_id uuid, p_cups int, p_interrupt boolean, p_dripper int, p_queue_pos numeric
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source caos.drips%rowtype;
  v_new uuid;
  v_lines jsonb;
begin
  perform caos.require_staff();
  if p_cups not between 1 and 2 then
    perform caos.invalid('杯数は 1〜2 杯です');
  end if;
  select * into v_source from caos.drips where id = p_source_id for update;
  if not found or v_source.status not in ('brewing', 'done') then
    perform caos.invalid('このカードは入れ直せません');
  end if;

  if p_interrupt and v_source.status = 'brewing' then
    update caos.drips
    set status = 'done', interrupted = true, finished_at = now(), updated_at = now()
    where id = p_source_id;
  end if;

  -- 杯数が元より少なければ、先頭の明細から必要な杯数だけ取る
  select jsonb_agg(jsonb_set(l, '{cups}', to_jsonb(least((l ->> 'cups')::int, p_cups - coalesce(taken, 0)))) order by ord)
  into v_lines
  from (
    select l, ord, sum((l ->> 'cups')::int) over (order by ord rows between unbounded preceding and 1 preceding) as taken
    from jsonb_array_elements(v_source.lines) with ordinality as t (l, ord)
  ) s
  where coalesce(taken, 0) < p_cups;

  insert into caos.drips (status, dripper, queue_pos, order_ids, lines, cups, rebrew_of)
  values (
    case when p_dripper is null then 'unassigned' else 'queued' end,
    p_dripper,
    coalesce(p_queue_pos, v_source.queue_pos),
    array(select distinct (l ->> 'order_id')::uuid from jsonb_array_elements(v_lines) l),
    v_lines,
    p_cups,
    p_source_id
  )
  returning id into v_new;

  return caos.reply(array[p_source_id, v_new, caos.promote(v_source.dripper), caos.promote(p_dripper)]);
end
$$;

-- 「1つ戻す」。直前の RPC の結果と、その前の行を渡すと元に戻す。
--   p_before： 操作の前の行（RPC の changed と deleted のうち、操作の前からあったもの）
--   p_after：  RPC が返した changed。この時点から誰も触っていないときだけ戻す
--   p_readied：RPC が準備完了にした注文。まだ提供していなければ ready_at を外す
create function caos.restore(p_before jsonb, p_after jsonb, p_readied uuid[]) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_after_ids uuid[];
  v_before_ids uuid[];
  v_created uuid[];
begin
  perform caos.require_staff();
  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_after_ids from jsonb_array_elements(p_after) x;
  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_before_ids from jsonb_array_elements(p_before) x;

  perform 1 from caos.drips where id = any (v_after_ids || v_before_ids) for update;
  if exists (
    select 1 from jsonb_array_elements(p_after) x
    left join caos.drips d on d.id = (x ->> 'id')::uuid
    where d.id is null or d.updated_at <> (x ->> 'updated_at')::timestamptz
  ) then
    perform caos.invalid('ほかの端末で変更されたため、元に戻せません');
  end if;

  -- 操作でできたカードは消す（入れ直し）
  v_created := array(select unnest(v_after_ids) except select unnest(v_before_ids));
  delete from caos.drips where id = any (v_created);

  -- 1 人 1 枚の抽出中の制約に引っかからないよう、戻す行はいったん待機にしてから書き戻す
  update caos.drips set status = 'queued' where id = any (v_before_ids) and status = 'brewing';

  insert into caos.drips
  select * from jsonb_populate_recordset(null::caos.drips, p_before)
  on conflict (id) do update set
    status = excluded.status, dripper = excluded.dripper, queue_pos = excluded.queue_pos,
    order_ids = excluded.order_ids, lines = excluded.lines, cups = excluded.cups,
    rebrew_of = excluded.rebrew_of, interrupted = excluded.interrupted,
    started_at = excluded.started_at, finished_at = excluded.finished_at,
    created_at = excluded.created_at;
  update caos.drips set updated_at = now() where id = any (v_before_ids);

  update public.orders set ready_at = null
  where id = any (p_readied) and served_at is null;

  return caos.reply(v_before_ids, v_created);
end
$$;

-- ---------------------------------------------------------------- トリガー（POS の表から）
--
-- POS の注文の書き込みの中で動くので、ここで失敗すると POS の注文の登録・編集・準備完了まで失敗してしまう。
-- CaOS の処理が失敗しても POS は必ず通るよう、警告を残して握りつぶす（カードは次にその注文が変わったときに作り直される）。

-- 明細が変わったら、トランザクションの終わりでカードを作り直す。
-- 注文の作成も編集も、Go の API は 1 トランザクションで明細を全部入れ直すので、終わりまで待てば最後の状態だけを見られる
create function caos.on_order_menus_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform caos.sync_order(coalesce(new.order_id, old.order_id));
  return null;
exception when others then
  raise warning 'caos.sync_order failed: % (%)', sqlerrm, sqlstate;
  return null;
end
$$;

create constraint trigger caos_sync_drips
after insert or update or delete on public.order_menus
deferrable initially deferred
for each row execute function caos.on_order_menus_change();

-- 注文が消えたら、その注文のカードを片付ける（明細は Go の API が先に消している）
create function caos.on_order_delete() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform caos.sync_order(old.id);
  return null;
exception when others then
  raise warning 'caos.sync_order failed: % (%)', sqlerrm, sqlstate;
  return null;
end
$$;

create trigger caos_drop_drips
after delete on public.orders
for each row execute function caos.on_order_delete();

-- 注文に ready_at が付いたら、その注文のカードを抽出終了にする
create function caos.on_order_ready() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform caos.finish_order(new.id);
  return null;
exception when others then
  raise warning 'caos.finish_order failed: % (%)', sqlerrm, sqlstate;
  return null;
end
$$;

create trigger caos_finish_drips
after update of ready_at on public.orders
for each row
when (old.ready_at is null and new.ready_at is not null)
execute function caos.on_order_ready();

-- ---------------------------------------------------------------- Realtime の受信の許可

-- private チャンネル caos:drips を受け取れるのは、スタッフだけ
create policy "caos: staff receive drip broadcasts" on realtime.messages
for select to authenticated
using (realtime.messages.extension = 'broadcast' and realtime.topic() = 'caos:drips' and caos.is_staff());

-- ---------------------------------------------------------------- 実行できる関数

revoke all on all functions in schema caos from public, anon, authenticated;
grant execute on function
  caos.is_staff(),
  caos.list_drips(timestamptz),
  caos.assign(uuid, int),
  caos.unassign(uuid),
  caos.next(int),
  caos.merge(uuid, uuid),
  caos.rebrew(uuid, int, boolean, int, numeric),
  caos.restore(jsonb, jsonb, uuid[])
to authenticated;

-- ---------------------------------------------------------------- 流した時点の注文

-- 受け付け中の注文にも、カードを作っておく
do $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select id from public.orders
    where ready_at is null and served_at is null and created_at > now() - interval '12 hours'
  loop
    perform caos.sync_order(v_order_id);
  end loop;
end
$$;
