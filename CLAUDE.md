# Strivon Athletics — Project Handoff

This file is the single source of truth for a fresh Claude Code session. It was written by directly inspecting the codebase, git history, and the live Supabase project — not from memory of a prior conversation. If anything here looks stale, trust the code over this file and update this file.

---

## 1. Project Overview

**Strivon Athletics** is a recruiting-guidance business. Current niche: **high-academic Division III soccer recruiting**.

**Core value proposition:** high school soccer recruits get firsthand guidance from **current college student-athletes** who recently went through the high-academic D3 recruiting process themselves — not career consultants, not AI, not generic recruiting services.

The business also has non-soccer advisors today (see §4) — the site copy has been pointed at soccer specifically, but the underlying advisor system is sport-agnostic.

---

## 2. Current Tech Stack

- **Plain HTML/CSS/JS.** No framework (no React/Vue/etc.), no Tailwind, no TypeScript, no build step, no bundler. This has been an explicit, repeated constraint — do not introduce one without the user asking.
- **No `package.json`, no `node_modules`.** `.gitignore` excludes them preemptively but they don't exist.
- **Styling:** one hand-written `style.css` (~2,400 lines) using CSS custom properties as a design-token system (see `:root` for the palette/spacing scale). No CSS framework.
- **Fonts:** Google Fonts (`Fraunces` for headings, `Inter` for body), loaded via `<link>` in every page's `<head>`.
- **Supabase JS SDK v2** — loaded via CDN script tag (`cdn.jsdelivr.net/npm/@supabase/supabase-js@2`), **only** on the two pages that need it: `book-a-call.html` and `advisor-availability.html`. Every other page has `sb` as `null` (see `script.js` line 1–7) and all Supabase-dependent functions degrade gracefully when `sb` is null.
- **One shared `script.js`** (~1,200 lines) loaded on every page. It's organized as a series of `if (elementExists) { ... }` blocks, one per page-specific feature — guarded so the same file is safe to load everywhere.
- **Run locally:** `python3 -m http.server 8000` from the project root. No install step.
- **Git:** a real repo, connected to GitHub at `https://github.com/strivonathletics/strivonathletics`. See §15 for current state — there are substantial uncommitted changes right now.

---

## 3. Current Site Structure

| File | Purpose |
|---|---|
| `index.html` | Homepage. Full-bleed cinematic video hero + 6 sections (Problem, What We Help With, Why Us, Featured Advisors carousel, How It Works, Final CTA). |
| `launch.html` | Minimal single-hero landing page (same hero as index.html, no sections below) — for e.g. an Instagram bio link. |
| `advisors.html` | Full advisor directory grid + an advisor application form (posts to a Google Form). |
| `advisor.html` | Public advisor profile page. Reads `?advisor=<slug>`. "Book With {Name}" links to `book-a-call.html?advisor=<slug>`. |
| `book-a-call.html` | **The** booking page. Single unified progressive flow: Quick Intake → Matches (or skip, if `?advisor=` present) → Scheduling → Hold → Payment placeholder. See §8. |
| `book.html` | **Dead page, kept only as a redirect** to `book-a-call.html` + query string, for backward compatibility with old links. Do not build on this file. |
| `advisor-availability.html` | Private page where an advisor sets their weekly availability. Reads `?token=<availability_token>`. |
| `contact.html`, `how-it-works.html`, `pricing.html`, `resources.html`, `terms.html`, `privacy.html` | Static content pages, not part of the booking flow. |
| `script.js` | All JS for every page (see §2). |
| `style.css` | All CSS for every page. |
| `advisors-data.js` | Static advisor directory fallback + Google Sheet CSV URL. See §4. |
| `supabase-config.js` | `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants. Committed to git — see §5 for why that's intentional and safe. |
| `supabase/schema.sql` | The full Postgres schema, as a paste-into-SQL-Editor script. **Not automatically applied** — see §5/§12 for what's actually live vs. only written here. |
| `assets/video/hero-soccer.mp4`, `assets/images/hero-soccer-poster.jpg` | Homepage hero background video + its poster frame. Untracked in git as of this writing (see §15). |

---

## 4. Advisor System

Advisors are described by **two independent, manually-synced data sources** that need to agree on `slug` for the site to work correctly:

**A. Directory info** (name, school, sport, major, bio, "fit" line, photo, slug) — lives in:
1. A published Google Sheet (CSV URL hardcoded in `advisors-data.js` as `ADVISORS_SHEET_CSV_URL`), fetched live on every page load, **or**
2. The static `ADVISORS` array in `advisors-data.js`, used only if the Sheet fetch fails or returns nothing.

`loadAdvisors()` in `script.js` fetches the Sheet, parses the CSV, and falls back silently. `getAdvisorBySlug(slug)` and the matching/rendering code all go through `loadAdvisors()`. A sheet row with a blank `Slug` column gets one auto-derived from the name via `slugify()` — you never have to hand-build a page for a new advisor, **as long as you also give them a Supabase row with the matching slug** (see B).

**B. Availability + booking data** — lives in Supabase, keyed by `advisors.slug`. This is completely separate from (A). `getOpenSlots()`, `createBookingHold()`, etc. all take a `slug` string and look it up in the Supabase `advisors` table independently of whatever `loadAdvisors()` returned.

**Practical implication:** adding a new advisor today means adding them to the Google Sheet (or the static fallback) **and** inserting a matching row into Supabase's `advisors` table with the *same slug*. Nothing enforces these stay in sync. If the slugs don't match, the profile page will render (from source A) but scheduling will silently show "no advisor found" (source B lookup fails).

**Current advisors (verified live in both places as of this writing):**
- `ryan-liu` — Ryan Liu, Harvey Mudd College, Soccer, Engineering
- `jason-wu` — Jason Wu, Claremont McKenna College, Track and Field, Economics

**Separation:** every advisor-scoped Supabase call (`get_open_slots`, `create_booking_hold`, `save_advisor_availability`, etc.) takes that advisor's `slug` or `availability_token` as a parameter and scopes its query/write to that one advisor's `id` server-side. There's no shared mutable state between advisors — confirmed working via live testing (Ryan and Jason show independently correct schedules).

**Selection paths:**
- Browse `advisors.html` → advisor profile → "Book With {Name}" (carries `?advisor=slug` into the booking flow, skips matching).
- Or: land on `book-a-call.html` with no advisor chosen → Quick Intake → see 3 recommended matches → pick one.

**Matching logic** (`scoreAdvisorMatch()` in `script.js`): simple deterministic point scoring, **no AI**. +3 same sport, +2 major overlap, +2 advisor's school mentioned in "schools you're interested in," +1 keyword match between the requested help-topic and the advisor's bio/fit text. Top 3 scores shown, with a plain-English reason built from whichever factors matched.

**Advisor privacy token:** each advisor has an `availability_token` (e.g. `rl-8f2k9q1z`) that gates their private `advisor-availability.html?token=...` link. This token is looked up via the Supabase `get_advisor_by_token` RPC, which is the fix for an earlier version where the token leaked through the public CSV feed. **Caveat:** `advisors-data.js` still has an old comment (lines 20–25) saying the token isn't secure — that's now stale/incorrect for the Supabase path, but hasn't been cleaned up. Don't trust that comment.

---

## 5. Supabase

**Project:** `bympsaslhwtbzeuwnrev.supabase.co`. Connection constants live in `supabase-config.js` as `SUPABASE_URL` and `SUPABASE_ANON_KEY` — **these exact variable names are what `script.js` expects to find in scope.** The key committed there is the *publishable/anon* key, which is safe to expose client-side by design (access is gated by RLS + the functions below, not by secrecy of this key). **Never** put a `service_role`/secret key in any file that ships to the browser.

### Tables
- **`advisors`** — `id, name, slug (unique), school, sport, major, bio, photo_url, expertise_tags (text[]), availability_token (unique), active, created_at`. RLS enabled, **no direct anon grants** — public reads go through the `advisors_public` view (below); everything else goes through SECURITY DEFINER functions.
- **`advisor_availability`** — `id, advisor_id (FK), day_of_week (0=Sun..6=Sat), start_time, end_time, created_at`. RLS enabled, no direct anon grants at all.
- **`bookings`** — `id, advisor_id (FK), athlete_name, athlete_email, start_time, end_time, status (pending/confirmed/cancelled/expired), payment_status (unpaid/paid/refunded), stripe_session_id, hold_expires_at, created_at`. RLS enabled, no direct anon grants at all. `stripe_session_id` column exists but nothing writes to it yet (Stripe isn't implemented — see §11).

### View
- **`advisors_public`** — `id, name, slug, school, sport, major, bio, photo_url, expertise_tags, active` (deliberately **excludes** `availability_token`). `select` granted to `anon`/`authenticated`. This view isn't currently queried by the frontend directly (the frontend still uses the Google Sheet for directory info — see §4) but exists as the intended safe read surface.

### RPC functions (SECURITY DEFINER, `search_path = public`)
| Function | Purpose | **Live in Supabase right now?** |
|---|---|---|
| `get_advisor_by_token(p_token)` | Token → `{id, name, slug}`, never the full list | ✅ Confirmed live |
| `get_open_slots(p_slug, p_from, p_to, p_slot_minutes=30)` | Real 30-min open slots for a date range, excluding confirmed/held times | ✅ Confirmed live |
| `create_booking_hold(p_slug, p_slot_start, p_athlete_name, p_athlete_email, p_slot_minutes=30)` | Atomic 10-minute hold | ✅ *A* version is live (confirmed via RPC call), but **I could not confirm from outside the database whether the self-healing expired-hold fix (the second `create_or replace` in schema.sql, ~line 300) is the version actually deployed.** Verify in the SQL Editor before assuming it's applied. |
| `save_advisor_availability(p_token, p_blocks)` | Token-gated wholesale replace of an advisor's schedule | ✅ Confirmed live |
| `get_advisor_availability(p_token)` | Read back an advisor's saved schedule (for pre-filling the editor) | ❌ **NOT live** — `schema.sql` has it, but a live RPC call against Supabase returned `PGRST202 function not found`. `advisor-availability.html` currently shows a blank form every time it's reopened, even if a schedule is already saved. **Run this function's `create or replace` block from `schema.sql` to fix.** |
| `cancel_booking_hold(p_booking_id)` | Releases a still-pending hold (used when switching advisors mid-flow) | ❌ **NOT live** — same situation. The "switching advisors releases the old hold" behavior (§8, Part 4 of the unified flow) **silently does nothing** right now; the old hold just sits until its 10-minute `hold_expires_at` passes naturally. **Run this function's block from `schema.sql` to fix.** |

**Action needed:** open Supabase's SQL Editor and run the `get_advisor_availability` and `cancel_booking_hold` blocks from `supabase/schema.sql` (they're `create or replace`, safe to re-run). Confirm `create_booking_hold`'s live definition matches the self-healing version at the bottom of the file.

### Security model
No user auth system exists. "Authorization" is entirely: (1) possession of an advisor's `availability_token` for the availability editor, (2) the fact that all athlete-facing writes go through `create_booking_hold`, which is protected by a **partial unique index** (`bookings_no_overlap` on `(advisor_id, start_time) where status in ('pending','confirmed')`) — this is what actually makes double-booking prevention race-proof, not any application-level check.

### How the frontend connects
`script.js` line 5–7: if the Supabase CDN script and `SUPABASE_URL` are both present in the page (i.e., the page's `<head>`/script tags loaded them), it creates a client as `const sb`. Every Supabase-dependent function (`getOpenSlots`, `createBookingHold`, `cancelBookingHold`, `getAdvisorByToken`) checks `if (!sb) return <safe default>` first, so pages without the Supabase scripts loaded degrade gracefully instead of throwing.

---

## 6. Availability System

1. An advisor opens their private link: `advisor-availability.html?token=<their availability_token>`.
2. `getAdvisorByToken()` calls the `get_advisor_by_token` RPC to resolve their name (token never travels through any public/bulk feed).
3. The page is meant to pre-fill previously-saved blocks via `get_advisor_availability` — **currently broken, see §5, always starts blank.**
4. The advisor adds one or more time blocks per day of week (plain `<input type="time">` pairs, day 0=Sunday..6=Saturday, matching JS `Date.getDay()` exactly — **verified empirically that Postgres `extract(dow from date)` uses the identical convention, no off-by-one risk**).
5. On save, the whole set of blocks for that advisor is sent as one JSON array to `save_advisor_availability`, which **deletes and re-inserts** all of that advisor's `advisor_availability` rows atomically (wholesale replace, not a diff).
6. **Weekly availability → calendar dates:** `get_open_slots(slug, from_date, to_date)` loops each calendar day in the range, maps it to a day-of-week, finds that advisor's saved blocks for that day-of-week, and generates slots — so "Tuesday 5–8pm" recurs on every Tuesday in the requested range automatically. No manual day-by-day scheduling needed.
7. **30-minute slot generation:** within each matched block, slots are generated at fixed 30-minute steps starting from the block's `start_time`, stopping once a slot would run past `end_time`. (E.g. 5:00–8:00pm → 5:00, 5:30, 6:00, 6:30, 7:00, 7:30 — not 8:00, since 8:00–8:30 would exceed the window.)
8. Each generated slot is checked against `bookings` and excluded if there's a `confirmed` booking or a still-`pending` (unexpired) hold at that exact timestamp.
9. **Next available dates display:** the booking page (`book-a-call.html`) queries a 14-day forward window from "now," groups the returned slots by calendar date, and renders only the dates that actually have open slots as a horizontal date-pill selector — no hardcoded weekday assumptions, verified working for non-consecutive weekly patterns (e.g. Tue/Thu/Sun repeating across two weeks).
10. **No real timezone handling exists.** Saved times are stored and returned as raw wall-clock values; the frontend deliberately avoids `Date`-object timezone conversion when displaying them (reads the ISO string's HH:MM directly) to stay consistent with what was actually saved. This works fine as long as advisor and athlete are effectively in the same timezone assumption; it will need real handling if that stops being true.
11. Past times (earlier today than "now") are filtered out client-side before rendering, not in the SQL function.

---

## 7. Booking / Hold System

1. Athlete picks a date pill → picks a time button → fills Name + Email → submits.
2. This calls `createBookingHold(slug, slotStartIso, name, email)` → `create_booking_hold` RPC.
3. The RPC inserts a `bookings` row with `status='pending'`, `hold_expires_at = now() + 10 minutes` (default in the table definition).
4. **Double-booking prevention:** the partial unique index `bookings_no_overlap` on `(advisor_id, start_time) where status in ('pending','confirmed')` makes concurrent identical requests impossible to both succeed — Postgres itself rejects the second INSERT with `unique_violation`, which the function catches and re-raises as a friendly "That slot was just taken" message. **Verified live**, including a real concurrent-attempt test during development.
5. **Held/booked times are hidden** because `get_open_slots` excludes any timestamp with a matching `confirmed` booking, or a `pending` one whose `hold_expires_at` hasn't passed yet.
6. **Expired holds becoming available again:** `get_open_slots` already treats an expired-but-still-`pending` row as "available" for *display* purposes (it just checks `hold_expires_at > now()`). But — **known bug, may or may not be fixed live (see §5)** — the original `create_booking_hold` only checked `status`, not expiration, when enforcing the unique constraint, so re-holding that exact slot could fail even though it displayed as open. The fix (self-healing: flip stale expired `pending` rows to `expired` before inserting) is written in `schema.sql` but its live-deployment status is unconfirmed — verify before relying on it.
7. **Switching advisors mid-flow** (Part 4 of the unified flow) is supposed to call `cancelBookingHold(previousHoldId)` to release the old hold immediately rather than waiting out the 10 minutes. **This RPC is not live yet (§5)** — right now switching advisors just abandons the old hold, which still correctly self-expires after 10 minutes, just not immediately.
8. After a successful hold, the UI reveals a "Continue to Payment" step **on the same page** (no navigation) — see §11, this is a placeholder, not real payment.

---

## 8. Current Customer Flow

**Everything below is verified against the actual code, not assumed.**

### General entry (nav "Book a Call" → `book-a-call.html`, no `?advisor=`)
```
Quick Intake  →  Recommended Advisors (top 3, scored)  →  Select Advisor
  →  Choose Date  →  Choose Time  →  10-Minute Hold  →  Continue to Payment (placeholder)
```
**Status: fully implemented and working**, including switching between recommended advisors (date/time state correctly clears each time; hold-release on switch is the one piece not yet live per §7.7).

### Direct-advisor entry (advisor profile → "Book With {Name}" → `book-a-call.html?advisor=slug`)
```
Book With {Advisor}  →  Quick Intake (same short form, personalized copy)
  →  (matching skipped)  →  that advisor's Date/Time/Hold  →  Continue to Payment (placeholder)
```
**Status: fully implemented and working**, verified the matching step is genuinely skipped and the correct advisor's real calendar loads.

### What's fully implemented
- Quick intake, matching, both entry paths, real Supabase-backed date/time selection, real atomic holds, advisor separation, mobile responsiveness, `prefers-reduced-motion` handling on the hero.

### What's partially implemented
- Advisor-switch hold release (function not deployed, see §5/§7).
- Availability editor pre-fill on reopen (function not deployed, see §5/§6).
- Directory data has the Sheet/Supabase dual-source fragility described in §4.

### What's planned but not implemented at all
- Stripe / real payment (§11).
- Confirmation emails to athlete or advisor.
- Calendar integrations (Google Calendar invites, etc.).
- Any admin view/dashboard.
- The "longer intake" fields the user described postponing (schools already contacted, coach responses, highlight video, etc.) — the current Quick Intake is intentionally short; nothing collects the deeper follow-up info yet.

---

## 9. Design System

**Palette** (see `:root` in `style.css`):
- `--page-bg: #EFE6D2` (warm cream — sitewide default background)
- `--panel-bg: #E3D3AC` (slightly deeper tan, used for alternating section backgrounds)
- `--card-bg: #FBF7EC` (off-white card surfaces)
- `--hero-1: #1c1712` / `--hero-2: #050403` (near-black, used for dark cards/nav/hero gradients)
- `--cream: #efe8d8` (text-on-dark color)
- `--ink: #19160f` (primary text color)
- `--gold: #c9a227` / `--gold-deep: #8A6A16` (accent — used sparingly: active nav pill, numerals, small accents)

**Typography:** `Fraunces` (serif) for all headings, `Inter` (sans) for body text.

**Overall direction:** premium, minimal, editorial. Generous whitespace, rounded cards (`--radius-lg: 32px` / `--radius-md: 18px`), subtle hover states (small lift + shadow), no loud gradients or busy patterns. Explicitly **not** meant to look like a flashy sports brand, a generic SaaS product, or a hype/streetwear site.

**Homepage hero** (`.launch-hero`, shared by `index.html` and `launch.html`):
- A large **rounded editorial "card"** inset ~12px from the true viewport edge (not edge-to-edge) — the cream page background used to show through that gap, but was changed to a deep near-black (`var(--hero-2)`) specifically behind this hero via `body:has(.launch-hero) { background: var(--hero-2); }`, scoped so it doesn't affect any other page's cream background.
- **Real, licensed soccer video background** (`assets/video/hero-soccer.mp4`, autoplay/muted/loop/playsinline), sourced from Pexels (free commercial license) — a wide shot of an organized indoor team training session (numbered jerseys, multiple players, real facility), chosen deliberately over a close-up individual clip to read as "serious collegiate program" rather than casual/flashy.
- A dark **cinematic gradient overlay** (`.launch-hero::before`) darkens top/bottom for text legibility while keeping the video visible through the middle.
- **Poster fallback:** `assets/images/hero-soccer-poster.jpg`, a real extracted frame from the video (not a separate stock photo) — used as the `<video poster>` and as the full background-image replacement when `prefers-reduced-motion: reduce` is set (video is hidden entirely in that case).
- **Staggered fade+rise entrance animation** on the wordmark/headline/subtext/CTAs (`.hero-reveal` + `.hero-reveal-1..4` classes, plain CSS `@keyframes`, no JS animation library), wrapped in `@media (prefers-reduced-motion: no-preference)` so it's skipped entirely for users who prefer reduced motion.
- Huge oversized `Strivon*` wordmark bottom-left, headline/subtext/CTAs lower-right — this layout is intentional and should be preserved, not "fixed" into a centered standard hero.

**Things that should NOT be redesigned without being explicitly asked:**
- The cream/tan/near-black/gold palette itself.
- The rounded-card visual language sitewide.
- The floating pill nav.
- The bento-grid "What We Help With" section, the advisor coverflow carousel, the How It Works timeline — all were deliberately built to this spec across multiple prior sessions; treat as "working, don't rebuild" per §13.

---

## 10. Phase Status

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Advisor slug system, public profile pages, private availability link | ✅ Done |
| **Phase 2** | Supabase-backed real availability, 30-min slot generation, atomic booking holds, unified intake→matching→scheduling flow | ✅ Done, **with the two not-yet-live RPCs noted in §5/§12** |
| **Phase 3** | Stripe payments | ❌ Not started at all (§11) |
| **Phase 4** | Emails, calendar integrations, admin tools, general polish | ❌ Not started |

The single git commit is literally titled "Phase 2 Working Version," and the uncommitted working-tree changes (§15) are further Phase 2 refinements (the unified booking flow rebuild + the hero video work) — nothing here is Phase 3 work.

---

## 11. Stripe / Payment Status

**Not implemented at all.** There is no Stripe integration, no Stripe SDK/script anywhere in the codebase, no checkout session creation, no webhook handler.

What exists instead: after a successful booking hold, the UI reveals a "Complete Your Booking" section on the same page with copy that honestly says *"Secure online checkout is coming soon"* and a "Confirm Booking Request" button that just sends a `mailto:` link (pre-filled with the athlete's name, email, chosen advisor, time, hold ID, and intake answers) to `strivonathletics@gmail.com`. `payment_status` in the `bookings` table stays `'unpaid'` forever under the current code — nothing ever transitions it. The `stripe_session_id` column exists in the schema for future use but nothing writes to it.

Do not present this as "payment collected" anywhere in the UI — the existing copy is deliberately honest about this being a placeholder, and that should be preserved until Stripe is actually built.

---

## 12. Known Issues / TODO

- **`cancel_booking_hold` and `get_advisor_availability` RPCs are written in `schema.sql` but not deployed to the live Supabase database.** Run them from the SQL Editor. (§5)
- **Unconfirmed whether the self-healing `create_booking_hold` fix is the live version** — verify in Supabase before assuming stale-hold slots can be re-booked correctly. (§5, §7.6)
- **Triple-redundant advisor directory data** (Google Sheet, `advisors-data.js` static fallback, Supabase `advisors` table) with no automated sync — adding an advisor requires updating multiple places with matching slugs by hand. (§4)
- **`advisors-data.js` has a stale comment** (lines 20–25) claiming the availability token isn't secure — that was true before the Supabase RPC fix, isn't anymore, and hasn't been corrected.
- **No real timezone handling anywhere** — fine today, will need real work if advisors/athletes span timezones. (§6.10)
- **No email notifications** to athlete or advisor on booking. (§8, §13)
- **No admin view** to see/manage bookings — the only visibility Strivon has into a booking is the mailto email that lands in the inbox.
- **`assets/` (video + poster) is currently untracked in git** — needs `git add` before the next commit or it'll be lost/absent on a fresh clone. (§15)

---

## 13. Important Implementation Rules

- **Preserve working Supabase logic.** The RLS model, the SECURITY DEFINER function pattern, and the partial-unique-index double-booking guard are deliberate security decisions, not scaffolding — don't "simplify" them into direct table grants.
- **Preserve advisor separation.** Every advisor-scoped query/write must stay parameterized by `slug`/`token`/`advisor_id` — never assume a single "current advisor."
- **Do not rebuild working systems unnecessarily.** The booking flow, matching logic, and availability system all went through real iteration and bug-fixing (see §12) — inspect before rewriting.
- **Inspect existing code before editing** — this file is a snapshot, not a substitute for reading the actual files, especially `script.js` and `supabase/schema.sql`, before changing booking/availability logic.
- **Make small, scoped changes** rather than rewriting unrelated areas. This has been the explicit working style throughout the project — changes should be traceable to a specific request, not opportunistic refactors.
- **Never expose secret keys client-side.** Only the Supabase *publishable/anon* key belongs in any file that ships to the browser (`supabase-config.js`). If Stripe or email gets built, secret keys belong in a server-side function (e.g. a Supabase Edge Function), never in `script.js` or any `.html` file.
- **No framework migrations** without being explicitly asked — this project has stayed plain HTML/CSS/JS by deliberate, repeated instruction even when adapting ideas from React/Tailwind reference components.

---

## 14. Important Files

| File | What it does |
|---|---|
| `script.js` | All site JavaScript. Read this fully before touching booking/availability/matching logic — it's one file, ~1,200 lines, organized as sequential guarded blocks per page/feature. |
| `style.css` | All site CSS. `:root` at the top has the full design-token system. |
| `advisors-data.js` | Advisor directory fallback data + the published Google Sheet CSV URL. |
| `supabase-config.js` | Supabase connection constants (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). Safe to commit (publishable key only). |
| `supabase/schema.sql` | The complete intended Postgres schema/functions, as a manual paste-and-run script — **treat as a spec, verify against the live database before assuming it's all deployed** (§5, §12). |
| `book-a-call.html` | The real booking page/flow — see §8. |
| `book.html` | Dead redirect stub only — do not add features here. |
| `advisor.html` | Public advisor profile template, driven by `?advisor=slug`. |
| `advisor-availability.html` | Private advisor scheduling editor, driven by `?token=...`. |
| `advisors.html` | Full advisor directory + advisor application form. |
| `index.html` / `launch.html` | Homepage and minimal splash variant; share the `.launch-hero` component. |

---

## 15. Git State (as of this writing)

```
$ git status
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
	modified:   advisors.html
	modified:   book-a-call.html
	modified:   book.html
	modified:   index.html
	modified:   launch.html
	modified:   script.js
	modified:   style.css
	modified:   supabase/schema.sql

Untracked files:
	assets/

$ git log --oneline -10
ad6cffd Phase 2 Working Version
```

**There is exactly one commit.** Everything described in this document as "recently built" (the unified booking flow rebuild, the cinematic hero video work, the two not-yet-deployed RPC functions) exists **only in the uncommitted working tree** right now, plus the `assets/` folder (video + poster image) is untracked entirely. **Nothing here has been pushed to GitHub beyond the original Phase 2 commit.** A fresh `git clone` of `origin/main` right now would get the *older* version of `book-a-call.html`/`book.html` (separate pages, not the unified flow) and would be missing the hero video assets.

If you're starting a new session and want the current working state preserved, committing (and pushing) soon is worth raising with the user — this file doesn't do that automatically.

---

## 16. Next Recommended Task

Most recent work (uncommitted): (1) rebuilt the booking experience into one unified `book-a-call.html` flow (intake → matching → scheduling → hold → payment placeholder), replacing the old split `book.html`/`book-a-call.html` pages; (2) replaced the homepage hero with a real cinematic soccer video background, rounded editorial container, entrance animation, and reduced-motion handling.

**Logical next steps, roughly in order:**
1. **Close the Supabase gap** — run the two missing RPC functions (§5, §12) so advisor-switch hold-release and availability pre-fill actually work as designed.
2. **Commit and push** — the working tree is significantly ahead of `origin/main` (§15); nothing is safe until this happens.
3. **Resolve the advisor-data fragility** (§4, §12) — either commit to Supabase as the single source of truth for directory info too, or build a real sync step, before it causes a silent bug when a new advisor is added.
4. **Phase 3: Stripe** — the payment step is the most visible remaining placeholder; this is the next full phase of work per the project's own phase plan (§10).
