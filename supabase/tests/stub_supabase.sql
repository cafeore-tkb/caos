-- 素の Postgres で supabase/tests を流すときだけ使う、Supabase の代役（ロール・auth.jwt()・Realtime の Broadcast）。
-- ローカルの Supabase（supabase start）や本番には流さない。scripts/test-supabase.sh が、realtime スキーマが無いときだけ流す。
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;

-- Supabase の realtime.messages / realtime.topic() / realtime.send() と同じ形（Broadcast の中身を確かめるのに使う）
create schema realtime;
create table realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated;
grant select on realtime.messages to anon, authenticated;
create function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;
grant execute on function realtime.topic() to anon, authenticated;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql security definer as $$
  insert into realtime.messages (topic, extension, payload, event, private) values (topic, 'broadcast', payload, event, private)
$$;
