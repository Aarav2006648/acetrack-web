# AceTrack Web

A web-based membership, attendance, and revenue tracker for Al Hayatt Badminton & Billiards Club.

**Stack:** React + Vite + Tailwind CSS v4 (frontend) · Supabase (auth + Postgres database, free tier)

## Features

- **Staff login** (Supabase Auth)
- **Members** — enroll members with custom pricing (handles discounts/offers), auto-generates a unique QR code per member, click any row to edit details, **renew memberships** (logs a new payment, resets classes, keeps renewal history), visual "Renewal due" flag on members running low on classes
- **Check-In** — scan a member's QR (blocks duplicate same-day check-ins) or log a walk-in guest with payment tracking, for Badminton
- **Table Rentals** — timed billiards bookings for walk-in guests, with an editable rate so staff can adjust for half-sessions/offers
- **Reports** — date-range reports across three areas: membership payments, badminton attendance (with phone numbers), and billiards rentals, each with a combined total revenue summary and CSV export
- **Dashboard** — active members, today's check-ins, renewals due, and this month's total revenue (across enrollments, walk-ins, and rentals)
- **Reminder panel** — a small dismissible corner popup for staff showing members on their last or second-to-last class, with a one-click "copy renewal message" button
- **Parent Portal** — a public page (`/parent`, no login) where parents look up their child's attendance and remaining classes by phone number

## 1. Set up Supabase (free)

1. Go to https://supabase.com → create a free account → **New project**
2. Go to **SQL Editor → New query** and run each of these in order (each is safe to re-run if unsure):
   - `supabase/schema.sql`
   - `supabase/migration_2.sql`
   - `supabase/migration_3.sql`
   - `supabase/migration_4.sql` *(creates a `subscription` table — currently unused by the app; harmless to leave, see note below)*
   - `supabase/migration_5.sql` *(adds the parent portal lookup function)*
3. Go to **Project Settings → API** and copy the **Project URL** and **anon public** key.
4. Go to **Authentication → Users → Add user** and create your real staff login(s) — one per staff member is recommended so you can tell who did what.

> **Note on migration_4:** this originally added a subscription/access-expiry gate, but that was removed from the app in favor of manually enabling/disabling staff logins in Supabase Authentication when access needs to be revoked. The `subscription` table it creates isn't read by the app anymore — you can safely ignore or delete it.

## 2. Run it locally

```bash
npm install
cp .env.example .env
```

Fill in `.env` with your Supabase URL + anon key, then:

```bash
npm run dev
```

## 3. Deploy

Push to GitHub, import into Vercel, add the same two environment variables in the project settings, deploy. Camera access (for QR scanning) only works over `https://` or `localhost`, so real device testing needs the deployed URL, not a local network IP.

## Project structure

```
src/
  pages/          Login, Dashboard, Students, CheckIn, Rentals, Reports, ParentPortal
  components/     Layout (sidebar/nav), ProtectedRoute, ReminderPanel
  context/        AuthContext (Supabase session)
  lib/            Supabase client
supabase/
  schema.sql, migration_2–5.sql   Run once each, in order, in the Supabase SQL editor
```

## Managing access

Revoke a staff member's access anytime from Supabase → **Authentication → Users** → delete or disable their account. No code changes needed.

## Ideas for later

- Multi-club support (a `club_id` layer) if you take on a second client
- Automated payment gateway (Stripe/Ziina) instead of manual renewal logging, once volume justifies it
