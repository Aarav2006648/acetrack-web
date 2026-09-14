-- ===========================================================
-- AceTrack Web — migration 4
-- Run this in Supabase SQL Editor (after migration_3.sql)
-- ===========================================================

-- Single-row table you control manually from Supabase's Table Editor.
-- The app checks this on login; if valid_until has passed, staff see
-- a friendly "subscription expired" screen instead of the dashboard.
create table if not exists subscription (
  id uuid primary key default gen_random_uuid(),
  status text default 'trial',      -- 'trial' | 'active' | 'expired'
  plan text default 'Trial',        -- e.g. 'Trial', 'Monthly', 'Annual'
  valid_until date not null,
  notes text,
  updated_at timestamptz default now()
);

alter table subscription enable row level security;

-- staff can only READ this — you update it yourself from the Supabase
-- dashboard (which bypasses RLS as the project owner), so there's no
-- write policy for the app itself.
create policy "Authenticated staff can view subscription" on subscription
  for select using (auth.role() = 'authenticated');

-- starting one-week trial from today
insert into subscription (status, plan, valid_until, notes)
values ('trial', 'Trial', current_date + interval '7 days', 'Initial trial for Al Hayatt Club')
on conflict do nothing;
