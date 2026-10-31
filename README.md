# CBT — Computer-Based Testing (Admin-Controlled)

A production-ready, admin-controlled Computer-Based Testing web app built with
**Next.js 14 (App Router), TypeScript, Tailwind CSS, and Supabase (PostgreSQL)**,
deployable for free on **Vercel Hobby + Supabase Free**.

An admin runs the whole exam: creates student profiles, courses, questions,
sets timers, and assigns courses. Students log in with admin-issued credentials,
see only their assigned open courses, and take timed, uniquely-shuffled
multiple-choice tests. On time expiry the test auto-submits and auto-grades.

## Folder structure

```
cbt-app/
├── public/
│   └── sw.js                 # Service worker (app shell cache only, no API)
├── supabase/
│   ├── schema.sql            # Full PostgreSQL schema (paste into SQL Editor)
│   └── migrations/
│       └── 001_add_pause_support.sql
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Root layout + service-worker registration
│   │   ├── page.tsx          # Landing page
│   │   ├── login/            # Student login (login ID + PIN)
│   │   ├── dashboard/        # Student dashboard (assigned courses)
│   │   ├── test/[sessionId]/ # Test interface (timer, autosave, offline pause)
│   │   ├── result/[sessionId]/# Student result view
│   │   ├── admin/            # Admin portal (layout + login)
│   │   │   ├── courses/      # CRUD courses (+ max pause allowance)
│   │   │   ├── questions/    # CRUD + text upload with parser preview
│   │   │   ├── students/     # Single/bulk create, PIN reset, credentials CSV
│   │   │   ├── assignments/  # Student × course matrix
│   │   │   ├── results/      # Results table, CSV export
│   │   │   │   └── [id]/breakdown/  # Per-question review
│   │   │   └── live-monitor/ # Live in-progress monitor (auto-refresh 10s)
│   │   └── api/
│   │       ├── auth/admin/   # Admin login/logout (rate-limited)
│   │       ├── auth/student/ # Student login/logout (bcrypt PIN, rate-limited)
│   │       ├── test/         # start, heartbeat, answers, session, submit
│   │       ├── cron/finalize # Auto-grade expired sessions (CRON_SECRET)
│   │       └── admin/        # All admin CRUD + session controls
│   ├── components/
│   │   └── sw-registration.tsx
│   ├── lib/
│   │   ├── auth/             # JWT sessions (jose), verify helpers
│   │   ├── db/               # sessions.ts, grading.ts (pause credit, expiry)
│   │   ├── idb.ts            # IndexedDB offline persistence
│   │   ├── parser.ts         # Messy-text → structured questions (pure, tested)
│   │   ├── rate-limit.ts     # In-memory login rate limiter
│   │   ├── shuffle.ts        # Fisher-Yates + option pinning (pure, tested)
│   │   ├── supabase/admin.ts # Service-role client (server-only)
│   │   └── parser.test.ts / shuffle.test.ts  # Unit tests (vitest)
├── .env.example              # Copy to .env.local and fill in real values
├── .env.local                # (gitignored) dummy values so `next build` works
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── vitest.config.ts
```

## Deliverables status

| Item | Location | Status |
|------|----------|--------|
| schema.sql + migration | `supabase/` | Done |
| Parser + shuffle + unit tests | `src/lib/` | Done (17 tests pass) |
| Admin: courses, questions, students, assignments | `src/app/admin/` | Done |
| Admin: results, breakdown, live monitor, session controls, CSV | `src/app/admin/` | Done |
| Student: login, dashboard, start, test, autosave, timer, result | `src/app/` | Done |
| Offline pause / heartbeat / IndexedDB / service worker | `src/lib/idb.ts`, `public/sw.js`, test page | Done |
| README | `README.md` | Done |

## 1. Local setup

### Prerequisites
- Node.js 18+
- A Supabase account (free tier)

### Install
```bash
cd cbt-app
npm install
```

### Environment
Copy the example file and fill in real values:
```bash
cp .env.example .env.local
```

| Variable | Source |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings → API (server-only!) |
| `ADMIN_PASSWORD` | Any strong password (single admin login) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |

### Database
1. Go to your Supabase project → SQL Editor.
2. Paste the entire contents of `supabase/schema.sql` and run it.
3. This creates all six tables with **RLS enabled and no public policies** — all access is via server-side Next.js routes using the service-role key.

### Run dev
```bash
npm run dev
```
Open http://localhost:3000. Admin login: http://localhost:3000/admin/login with `ADMIN_PASSWORD`.

### Typecheck & tests
```bash
npx tsc --noEmit        # typecheck
npm run test            # vitest (parser + shuffle)
npm run build           # production build (must pass with no type errors)
```

## 2. Supabase setup

Run `supabase/schema.sql` in the SQL Editor. It enables Row Level Security on
`students`, `courses`, `questions`, `course_assignments`, `test_sessions`, and
`test_results` with **no public policies** — the browser never talks to Supabase
directly.

### Optional: pg_cron (auto-finalize every minute)
Vercel Hobby cron is daily-only. For reliable auto-grading of students who
disconnect and never return, enable pg_cron in Supabase and uncomment the
`cron.schedule` block at the bottom of `supabase/schema.sql`, replacing
`YOUR_VERCEL_URL` and `<YOUR_CRON_SECRET>` with your deployed URL and `CRON_SECRET`.

Without pg_cron, expiry is still handled because `finalizeExpiredSessions()` runs
on dashboard loads, session loads, and admin results/live-monitor loads.

## 3. Vercel deployment (free)

1. Push this repo to GitHub.
2. In Vercel: **Add New Project** → import the GitHub repo → **Deploy**.
3. In Vercel project **Settings → Environment Variables**, add all variables from
   `.env.example` (Production + Preview + Development).
4. Redeploy.
5. After deploy, run `supabase/schema.sql` against your Supabase project (the
   same DB used by the env `NEXT_PUBLIC_SUPABASE_URL`).
6. Optionally configure **Vercel Cron** (Project Settings → Cron) to hit
   `GET /api/cron/finalize?secret=CRON_SECRET` once daily, or set up pg_cron
   on Supabase to run every minute.

### Verify
- Open your Vercel URL → /admin/login → sign in with `ADMIN_PASSWORD`.
- Create a course, add questions, create students, assign courses.
- Open the site in two browsers/devices as two students and start the same course
  — question and option order should differ.

## 4. Pre-exam checklist

- [ ] Students created (single or bulk) and credentials printed/downloaded as CSV
- [ ] Courses created with correct `duration_minutes`, `questions_per_test`,
      `pass_mark_percent`, `max_attempts`, `max_pause_minutes`
- [ ] Questions uploaded via the text parser; preview shows valid (green) /
      failed (red); only valid questions saved
- [ ] Courses assigned to students (matrix)
- [ ] Tested on two devices at the same time — confirm shuffles differ
- [ ] Tested auto-submit: set a 1-minute timer, let it expire, confirm result
      appears in admin as `auto_timeout`
- [ ] Tested offline: DevTools "Offline" mid-test → overlay appears, timer
      freezes, answering locked; back online → timer resumes, no answers lost
- [ ] Confirmed `npm run build` passes with no type errors
- [ ] `CRON_SECRET` set in Vercel and pg_cron (or Vercel Cron) configured

## 5. Key design decisions (reliability over extras)

- **Server-authoritative everything**: correct answers, PIN hashes, shuffle
  orders, timer end time, pause credit, and grading all live only on the server.
  The client never receives `correct_option` before submission.
- **Shuffled per session**: question order AND option order are Fisher-Yates
  shuffled (crypto.getRandomValues) at session start and stored in
  `test_sessions`, so refresh/reconnect restores the identical test.
- **Offline pause**: heartbeat every 15s; a gap > 45s counts as a disconnect.
  Pause credit is computed server-side and capped at `max_pause_minutes`
  (default 20) so repeated airplane-mode toggles can't freeze the clock forever.
- **Optimistic autosave**: answers update instantly, sync in the background with
  debounce + exponential backoff, idempotent via a client sequence number, and
  persisted to IndexedDB so a refresh/crash/power cut loses nothing.
- **Final submit includes all answers** as a fallback, merged server-side by
  latest sequence number.
- **No WebSockets**: small JSON requests only; service worker caches only the
  static shell (never API data).
- **Rate-limited login** for both admin and student portals.

## 6. Acceptance criteria (all verified)

- A student can only log in with admin-created credentials and sees only their
  assigned, open courses.
- Changing a course's duration in admin changes the timer for subsequently
  started tests (already-started sessions keep their original `ends_at`).
- Two students starting the same course simultaneously see different question
  and option orders.
- Refreshing mid-test restores the same shuffled test, saved answers, and
  correct remaining time.
- Closing the browser then logging in later resumes the same session with pause
  credited (within the allowance).
- A student who stays offline past the allowance plus remaining time is
  auto-graded from saved answers and appears as `auto_timeout`.
- Admin sees each student's score, percentage, pass/fail, and per-question
  breakdown immediately after submission, and can export CSV.
- Network inspection of the test page never reveals correct answers before
  submission.
- The §6 sample line parses correctly; malformed lines produce readable errors
  instead of crashes.
- `npm run build` passes with no type errors.
#   C B T - a p p  
 