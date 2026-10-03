-- Supabase > SQL Editor mein ek dafa chalayein (purani setup ke baad)
create or replace function revoke_share(p_token text) returns void
language sql security definer set search_path=public as $$
  delete from shares where token=p_token and owner=auth.uid();
$$;
