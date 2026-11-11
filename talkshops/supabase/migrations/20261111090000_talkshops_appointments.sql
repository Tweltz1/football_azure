-- Appointment scheduling: the booking page counts appointments already on the books to show open times.
-- Shop hours and slot settings live in repair_shops.grow.schedule (jsonb, no column needed).
create index if not exists repair_jobs_appointment_idx on public.repair_jobs (shop_id, (data->>'appointment'))
  where data ? 'appointment';
