-- ===========================================================
-- AceTrack Web — migration 3
-- Run this in Supabase SQL Editor (after migration_2.sql)
-- ===========================================================

alter table attendance add column if not exists amount numeric;
alter table attendance add column if not exists payment_status text default 'Paid';
