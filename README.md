# AceTrack Web

A web-based attendance & membership tracker for Al Hayatt Badminton & Billiards Club — rebuilt from the original AceTrack desktop app as a browser app so any device (front-desk laptop, tablet, staff phone) can check members in via QR code.

**Stack:** React + Vite + Tailwind CSS v4 (frontend) · Supabase (auth + Postgres database, free tier)

## What's included

- Staff login (Supabase Auth)
- Member management — add members, auto-generate a unique QR code per member, download it
- QR check-in page — opens the device camera, scans a member's QR, logs attendance, deducts a class if they're on a limited package
- Dashboard — today's check-ins, active members, revenue this month, recent activity
- Reports — pick a date range, see visit counts per member, export to CSV

## 1. Set up Supabase (free)

1. Go to https://supabase.com → create a free account → **New project**
2. Once it's created, go to **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, and run it. This creates all the tables (students, packages, attendance, payments, etc.) and inserts the default packages.
3. Go to **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
4. Go to **Authentication → Users → Add user** and create a staff login (email + password) — this is what you'll use to sign in to the app.

## 2. Run it locally in VS Code

```bash
# open this folder in VS Code, then in the terminal:
npm install
cp .env.example .env
```

Open `.env` and paste in your Supabase URL and anon key:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ....
```

Then:

```bash
npm run dev
```

Open the printed localhost URL. Sign in with the staff account you created in step 1.4.

**Note on the QR camera:** browsers only allow camera access on `https://` or `localhost` — so it'll work fine locally, but once you're testing on a phone/tablet on your club wifi you'll need it deployed (step 3) rather than opened via your laptop's local network IP.

## 3. Deploy it (so the club can actually use it)

Easiest free option: Vercel or Netlify.

- Push this folder to a GitHub repo
- Import it in Vercel/Netlify
- Add the same two environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in the site's settings
- Deploy — you'll get a live `https://` URL you can open on any tablet at the front desk

## Project structure

```
src/
  pages/          Login, Dashboard, Students, CheckIn, Reports
  components/     Layout (sidebar/nav), ProtectedRoute
  context/        AuthContext (Supabase session)
  lib/            Supabase client
supabase/
  schema.sql      Run this once in the Supabase SQL editor
```

## Next steps / ideas to extend

- A public self-serve "my QR code" page members can open on their own phone (no staff login needed) so they don't have to carry a printed code
- Payments page to log renewals against the `payments` table (already in the schema)
- Auto-email/WhatsApp reminder when `remaining_classes` hits 0
- Role field on staff accounts if you want to separate admin vs front-desk permissions
