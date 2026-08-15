-- ===========================================================
-- AceTrack Web — migration 5
-- Run this in Supabase SQL Editor (after migration_4.sql)
-- ===========================================================

-- Parents look up their child's attendance by phone number, with no
-- login required. Rather than opening the students/attendance tables
-- to public reads (which would let anyone browse every family's data),
-- this uses a "security definer" function: it runs with elevated
-- permissions internally, but only ever returns rows matching the
-- exact phone number given. You can't use it to list everyone.

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
  where s.phone = trim(p_phone)
    and s.status = 'Active'
  order by a.check_in_time desc nulls last;
end;
$$;

-- allow both logged-out visitors (anon) and staff to call this
grant execute on function public.get_student_attendance(text) to anon, authenticated;
