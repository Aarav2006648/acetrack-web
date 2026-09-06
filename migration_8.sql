-- ===========================================================
-- AceTrack Web — migration 8
-- Run this in Supabase SQL Editor (after migration_7.sql)
-- ===========================================================

-- A small helper: reduces any phone number down to its last 9 digits,
-- so "0501234567", "501234567", and "971501234567" all normalize to the
-- same value. Used to match a parent's typed number against whatever
-- format staff happened to save it in.
create or replace function public.normalize_phone_digits(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null then ''
    else right(regexp_replace(p, '\D', '', 'g'), 9)
  end
$$;

-- Re-create the attendance lookup to (a) match phone numbers loosely via
-- the helper above instead of an exact string match, and (b) drop the
-- "Active members only" restriction — a parent should still be able to
-- see their child's history even after a membership lapses or finishes.
create or replace function public.get_student_attendance(p_phone text)
returns table (
  student_id uuid,
  full_name text,
  package_name text,
  total_classes int,
  remaining_classes int,
  classes_used int,
  is_unlimited boolean,
  attendance_date date,
  activity text,
  check_in_time timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    s.id,
    s.full_name,
    p.package_name,
    p.total_classes,
    s.remaining_classes,
    s.classes_used,
    coalesce(p.is_unlimited, false),
    a.attendance_date,
    a.activity,
    a.check_in_time
  from students s
  left join packages p on p.id = s.package_id
  left join attendance a on a.student_id = s.id
  where normalize_phone_digits(s.phone) = normalize_phone_digits(p_phone)
  order by a.check_in_time desc nulls last;
end;
$$;

grant execute on function public.get_student_attendance(text) to anon, authenticated;

-- New: lets a parent see every past package/renewal on their child's
-- account (what they were on, when, how many classes), the same way
-- they can already see attendance. Same security-definer pattern —
-- only ever returns rows matching the exact phone given.
create or replace function public.get_student_package_history(p_phone text)
returns table (
  student_id uuid,
  full_name text,
  package_name text,
  total_classes int,
  classes_used int,
  remaining_classes int,
  start_date date,
  end_date date,
  renewed_on timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    s.id,
    s.full_name,
    p.package_name,
    p.total_classes,
    ph.classes_used,
    ph.remaining_classes,
    ph.start_date,
    ph.end_date,
    ph.renewed_on
  from students s
  join package_history ph on ph.student_id = s.id
  left join packages p on p.id = ph.package_id
  where normalize_phone_digits(s.phone) = normalize_phone_digits(p_phone)
  order by ph.renewed_on desc;
end;
$$;

grant execute on function public.get_student_package_history(text) to anon, authenticated;
