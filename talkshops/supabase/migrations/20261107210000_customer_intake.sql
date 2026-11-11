alter table public.repair_jobs add column if not exists intake jsonb;
alter table public.repair_jobs add column if not exists intake_photos jsonb not null default '[]';

-- Serialize uploads, stage checks and removals for the same repair.
create or replace function public.repair_intake_photo(p_job text, p_photo jsonb, p_remove text)
returns boolean language plpgsql set search_path=public as $$
declare existing jsonb; current_stage text;
begin
  select intake_photos,stage into existing,current_stage from public.repair_jobs where id=p_job for update;
  if not found then return false; end if;
  if p_remove is not null then
    select coalesce(jsonb_agg(p order by n),'[]'::jsonb) into existing
      from jsonb_array_elements(existing) with ordinality as photos(p,n) where p->>'id' <> p_remove;
  else
    if current_stage not in ('invited','checked_in') or p_photo is null then return false; end if;
    if exists(select 1 from jsonb_array_elements(existing) p where p->>'src'=p_photo->>'src') then return true; end if;
    if jsonb_array_length(existing)>=6 then return false; end if;
    existing := existing || jsonb_build_array(p_photo || jsonb_build_object('stage', current_stage));
  end if;
  update public.repair_jobs set intake_photos=existing where id=p_job;
  return true;
end; $$;
revoke all on function public.repair_intake_photo(text,jsonb,text) from public, anon, authenticated;
grant execute on function public.repair_intake_photo(text,jsonb,text) to service_role;
