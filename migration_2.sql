-- ===========================================================
-- AceTrack Web — migration 2
-- Run this in Supabase SQL Editor (after the original schema.sql)
-- ===========================================================

alter table attendance alter column student_id drop not null;
alter table attendance add column if not exists guest_name text;
alter table attendance add column if not exists guest_phone text;

alter table attendance drop constraint if exists attendance_member_or_guest;
alter table attendance add constraint attendance_member_or_guest
  check (student_id is not null or guest_name is not null);

create table if not exists rate_card (
  id uuid primary key default gen_random_uuid(),
  activity text not null,
  unit_minutes int not null,
  price numeric not null,
  status text default 'Active'
);

insert into rate_card (activity, unit_minutes, price) values
  ('Billiards', 30, 25),
  ('Billiards', 60, 45)
on conflict do nothing;

alter table rate_card enable row level security;
create policy "Authenticated staff full access" on rate_card for all using (auth.role() = 'authenticated');

alter table rentals add column if not exists guest_name text;
alter table rentals add column if not exists guest_phone text;
