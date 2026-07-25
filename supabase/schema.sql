-- ===========================================================
-- AceTrack Web — Supabase / Postgres schema
-- Adapted from the original AceTrack desktop app schema.
-- Run this in Supabase Dashboard → SQL Editor → New query.
-- ===========================================================

-- Coaches (staff who run sessions)
create table if not exists coaches (
  id uuid primary key default gen_random_uuid(),
  coach_name text not null,
  phone text,
  email text,
  specialization text, -- e.g. 'Badminton', 'Billiards'
  status text default 'Active',
  created_at timestamptz default now()
);

-- Packages (membership plans)
create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  package_name text not null,
  total_classes int default 0,
  price numeric default 0,
  is_unlimited boolean default false,
  status text default 'Active',
  created_at timestamptz default now()
);

-- Students / Members
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  student_code text unique not null,       -- short human-readable ID, encoded in the QR
  full_name text not null,
  phone text not null,
  email text,
  coach_id uuid references coaches(id) on delete set null,
  package_id uuid references packages(id) on delete set null,
  join_date date default current_date,
  classes_used int default 0,
  remaining_classes int default 0,
  payment_status text default 'Paid',
  status text default 'Active',
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_students_code on students(student_code);
create index if not exists idx_students_name on students(full_name);
create index if not exists idx_students_phone on students(phone);

-- Package history (renewals)
create table if not exists package_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  package_id uuid not null references packages(id) on delete cascade,
  start_date date,
  end_date date,
  classes_used int default 0,
  remaining_classes int default 0,
  renewed_on timestamptz default now()
);

-- Payments
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  package_id uuid references packages(id) on delete set null,
  amount numeric default 0,
  payment_method text default 'Cash',
  payment_status text default 'Completed',
  payment_date timestamptz default now(),
  notes text
);

-- Attendance (every QR scan / check-in)
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  activity text not null,          -- 'Badminton' or 'Billiards'
  check_in_time timestamptz default now(),
  attendance_date date default current_date,
  checked_in_by text                -- staff username, optional
);

create index if not exists idx_attendance_student on attendance(student_id);
create index if not exists idx_attendance_date on attendance(attendance_date);

-- Rentals (court / table bookings)
create table if not exists rentals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete set null,
  activity text not null,
  court_number text,
  start_time timestamptz,
  end_time timestamptz,
  duration numeric default 0,
  price numeric default 0,
  payment_status text default 'Pending',
  booking_date date default current_date,
  created_at timestamptz default now()
);

-- Activity log (audit trail)
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  username text,
  action text not null,
  description text,
  timestamp timestamptz default now()
);

-- ===========================================================
-- Row Level Security
-- v1 keeps it simple: any signed-in staff user (via Supabase Auth)
-- can read/write everything. Tighten later with roles if needed.
-- ===========================================================

alter table coaches enable row level security;
alter table packages enable row level security;
alter table students enable row level security;
alter table package_history enable row level security;
alter table payments enable row level security;
alter table attendance enable row level security;
alter table rentals enable row level security;
alter table activity_log enable row level security;

create policy "Authenticated staff full access" on coaches for all using (auth.role() = 'authenticated');
create policy "Authenticated staff full access" on packages for all using (auth.role() = 'authenticated');
create policy "Authenticated staff full access" on students for all using (auth.role() = 'authenticated');
create policy "Authenticated staff full access" on package_history for all using (auth.role() = 'authenticated');
create policy "Authenticated staff full access" on payments for all using (auth.role() = 'authenticated');
create policy "Authenticated staff full access" on attendance for all using (auth.role() = 'authenticated');
create policy "Authenticated staff full access" on rentals for all using (auth.role() = 'authenticated');
create policy "Authenticated staff full access" on activity_log for all using (auth.role() = 'authenticated');

-- ===========================================================
-- Default data
-- ===========================================================

insert into packages (package_name, total_classes, price, is_unlimited) values
  ('Starter Package', 8, 300, false),
  ('Standard Package', 12, 420, false),
  ('Premium Package', 16, 550, false),
  ('Unlimited Package', 0, 700, true)
on conflict do nothing;
