-- Customer walk-around photos (8 fixed angles) with damage marks the shop confirms.
-- Kept out of `data` so a customer upload never races the shop's own saves.
alter table public.repair_jobs add column if not exists walkaround jsonb not null default '[]';

-- One call per change, row-locked:
--   p_photo        add or replace the photo for p_photo->>'angle' (at most 8 photos)
--   p_remove       remove the photo with this id
--   p_marks_for    set the damage marks (p_marks) on the photo with this id, and its AI scan time (p_ai_at) when given
create or replace function public.repair_walkaround(p_job text, p_photo jsonb, p_remove text, p_marks_for text, p_marks jsonb, p_ai_at text)
returns boolean language plpgsql set search_path=public as $$
declare existing jsonb; current_stage text; found_it boolean := false;
begin
  select walkaround,stage into existing,current_stage from public.repair_jobs where id=p_job for update;
  if not found then return false; end if;
  if p_photo is not null then
    if current_stage = 'picked_up' then return false; end if;
    select coalesce(jsonb_agg(p order by n),'[]'::jsonb) into existing
      from jsonb_array_elements(existing) with ordinality as photos(p,n) where p->>'angle' <> p_photo->>'angle';
    if jsonb_array_length(existing) >= 8 then return false; end if;
    existing := existing || jsonb_build_array(p_photo);
  elsif p_remove is not null then
    select coalesce(jsonb_agg(p order by n),'[]'::jsonb) into existing
      from jsonb_array_elements(existing) with ordinality as photos(p,n) where p->>'id' <> p_remove;
  elsif p_marks_for is not null then
    select coalesce(jsonb_agg(case when p->>'id' = p_marks_for
        then p || jsonb_build_object('marks', coalesce(p_marks,'[]'::jsonb)) || case when p_ai_at is null then '{}'::jsonb else jsonb_build_object('aiAt', p_ai_at) end
        else p end order by n),'[]'::jsonb),
      bool_or(p->>'id' = p_marks_for) into existing, found_it
      from jsonb_array_elements(existing) with ordinality as photos(p,n);
    if not coalesce(found_it,false) then return false; end if;
  else
    return false;
  end if;
  update public.repair_jobs set walkaround=existing where id=p_job;
  return true;
end; $$;
revoke all on function public.repair_walkaround(text,jsonb,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.repair_walkaround(text,jsonb,text,text,jsonb,text) to service_role;
