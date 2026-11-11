-- Only quota hashes are stored here; the inquiry itself goes to the support inbox.
create table public.talkshops_sales_requests (
  id bigint generated always as identity primary key,
  email_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.talkshops_sales_requests enable row level security;
create index talkshops_sales_requests_created on public.talkshops_sales_requests(created_at);

create or replace function public.claim_talkshops_sales_request(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  email_key text := encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex');
begin
  perform pg_advisory_xact_lock(734092118);
  delete from public.talkshops_sales_requests where created_at < now() - interval '1 day';
  if (select count(*) from public.talkshops_sales_requests) >= 100
    or (select count(*) from public.talkshops_sales_requests where email_hash = email_key and created_at > now() - interval '1 hour') >= 3 then
    return false;
  end if;
  insert into public.talkshops_sales_requests(email_hash) values (email_key);
  return true;
end;
$$;
revoke all on function public.claim_talkshops_sales_request(text) from public, anon, authenticated;
grant execute on function public.claim_talkshops_sales_request(text) to service_role;
