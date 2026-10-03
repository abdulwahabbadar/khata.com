-- Supabase > SQL Editor mein ek dafa chalayein
-- Poore-data (report) link ki muddat: 1 / 3 / 24 ghante. Customer ka apna link kabhi band nahi hota.

alter table shares add column if not exists expires_at timestamptz;

create or replace function sync_shares(p_items jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from shares where expires_at is not null and expires_at < now();   -- purana data saaf
  insert into shares(token,owner,data,expires_at)
  select x->>'token', auth.uid(), x-'token'-'exp',
         case when (x->>'exp') is not null then now() + ((x->>'exp')::numeric * interval '1 hour') end
  from jsonb_array_elements(p_items) x where length(x->>'token')>=32
  on conflict(token) do update set data=excluded.data, updated_at=now() where shares.owner=auth.uid();
end $$;

create or replace function get_shared(p_token text) returns jsonb
language sql security definer stable set search_path=public as $$
  select data || jsonb_build_object(
           'updated',(extract(epoch from updated_at)*1000)::bigint,
           'exp', case when expires_at is null then null else (extract(epoch from expires_at)*1000)::bigint end)
  from shares where token=p_token and (expires_at is null or expires_at>now())
$$;
grant execute on function get_shared(text) to anon, authenticated;
