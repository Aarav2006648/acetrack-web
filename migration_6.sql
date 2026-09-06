-- ===========================================================
-- AceTrack Web — migration 6
-- Run this in Supabase SQL Editor (after migration_5.sql)
-- ===========================================================

-- Lets a badminton walk-in booking record which court they used and
-- what time they were booked for, the same way rentals already track
-- court_number for billiards tables.
alter table attendance add column if not exists court_number text;
