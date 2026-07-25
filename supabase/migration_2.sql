-- ===========================================================
-- AceTrack Web — migration 2
-- Run this in Supabase SQL Editor (after the original schema.sql)
-- ===========================================================

-- 1) Allow attendance to be logged for walk-in guests (no student record)
alter table attendance alter column student_id drop not null;
alter table attendance add column if not exists guest_name text;
alter table attendance add column if not exists guest_phone text;

-- a check-in row must have either a member or a guest name
alter table attendance drop constraint if exists attendance_member_or_guest;
alter table attendance add constraint attendance_member_or_guest
  check (student_id is not null or guest_name is not null);

-- 2) Billiards rate card (price per activity, e.g. per hour / per half hour)
create table if not exists rate_card (
  id uuid primary key default gen_random_uuid(),
  activity text not null,        -- e.g. 'Billiards'
  unit_minutes int not null,     -- 30 or 60
  price numeric not null,
  status text default 'Active'
);

insert into rate_card (activity, unit_minutes, price) values
  ('Billiards', 30, 25),
  ('Billiards', 60, 45)
on conflict do nothing;

alter table rate_card enable row level security;
create policy "Authenticated staff full access" on rate_card for all using (auth.role() = 'authenticated');

-- 3) Rentals table already exists from schema.sql — just make sure guest info can be captured there too
alter table rentals add column if not exists guest_name text;
alter table rentals add column if not exists guest_phone text;
