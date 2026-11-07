-- Talk Shops: the shop's own email address, used as Reply-To on customer emails so replies reach the shop.
alter table public.repair_shops add column if not exists email text not null default '';
