# Strivon Athletics — Project Handoff

This file is the single source of truth for a fresh Claude Code session. It was written by directly inspecting the codebase and git history — not from memory of a prior conversation. If anything here looks stale, trust the code over this file and update this file.

---

## 1. Project Overview

**Strivon Athletics** is a recruiting-guidance business. Current niche: **high-academic Division III soccer recruiting**.

**Core value proposition:** high school soccer recruits get firsthand guidance from **current college student-athletes** who recently went through the high-academic D3 recruiting process themselves — not career consultants, not AI, not generic recruiting services.

The business also has non-soccer advisors today (see §4) — the site copy has been pointed at soccer specifically, but the underlying advisor system is sport-agnostic.

**Voice/copy standard (new this session, see §12):** the whole site went through a copy pass aimed at "we've been through this recently and can make it clearer" rather than agency/marketing language. Avoid generic phrases like "unlock your potential," "navigate your journey," "tailored solutions" — the existing copy deliberately avoids these; match that tone in anything new.

---

## 2. Current Tech Stack

- **Plain HTML/CSS/JS.** No framework (no React/Vue/etc.), no Tailwind, no TypeScript, no build step, no bundler. This has been an explicit, repeated constraint — do not introduce one without the user asking.
- **No `package.json`, no `node_modules`.** `.gitignore` excludes them preemptively but they don't exist.
- **Styling:** one hand-written `style.css` (~2,600 lines) using CSS custom properties as a design-token system (see `:root` for the palette/spacing scale, and §9 for the text-color hierarchy added this session). No CSS framework.
- **Fonts:** Google Fonts (`Fraunces` for headings, `Inter` for body), loaded via `<link>` in every page's `<head>`.
- **Supabase JS SDK v2** — loaded via CDN script tag (`cdn.jsdelivr.net/npm/@supabase/supabase-js@2`), **only** on the two pages that need it: `book-a-call.html` and `advisor-availability.html`. Every other page has `sb` as `null` and all Supabase-dependent functions degrade gracefully when `sb` is null.
- **One shared `script.js`** (~1,260 lines) loaded on every page. It's organized as a series of `if (elementExists) { ... }` blocks, one per page-specific feature — guarded so the same file is safe to load everywhere.
- **Run locally:** `python3 -m http.server 8000` from the project root. No install step.
- **Git:** a real repo, connected to GitHub at `https://github.com/strivonathletics/strivonathletics`. See §16 for current state — there are substantial uncommitted changes right now, more than last handoff.

---

## 3. Current Site Structure

No new files/routes were added this session — all work was edits to existing files.

| File | Purpose |
|---|---|
| `index.html` | Homepage. Cinematic video hero + Problem, What We Help With, Who It's For, Parent Trust, Featured Advisors carousel, How It Works, Parent FAQ, Final CTA. (Parent Trust, Who It's For, and Parent FAQ are new this session — see §9/§12.) |
| `launch.html` | Minimal single-hero landing page (same hero as index.html, no sections below) — for e.g. an Instagram bio link. |
| `advisors.html` | Full advisor directory grid + "How We Select Advisors" section (new this session) + an advisor application form (posts to a Google Form). |
| `advisor.html` | Public advisor profile page. Reads `?advisor=<slug>`. "Book With {Name}" links to `book-a-call.html?advisor=<slug>`. |
| `book-a-call.html` | **The** booking page. Single unified progressive flow with a visible 4-step indicator (new this session): Quick Intake → Matches (or skip, if `?advisor=` present) → Scheduling → Hold → Payment placeholder. See §8. |
| `book.html` | **Dead page, kept only as a redirect** to `book-a-call.html` + query string, for backward compatibility with old links. Do not build on this file. |
| `advisor-availability.html` | Private page where an advisor sets their weekly availability. Reads `?token=<availability_token>`. |
| `contact.html`, `how-it-works.html`, `pricing.html`, `resources.html`, `terms.html`, `privacy.html` | Static content pages, not part of the booking flow. `how-it-works.html` gained a 5-step summary above the existing detailed timeline this session; `pricing.html` and `resources.html` were both tightened up (see §12). |
| `script.js` | All JS for every page (see §2). |
| `style.css` | All CSS for every page, including the text-color token system (§9). |
| `advisors-data.js` | Static advisor directory fallback + Google Sheet CSV URL. See §4. |
| `supabase-config.js` | `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants. Committed to git — see §5 for why that's intentional and safe. |
| `supabase/schema.sql` | The full Postgres schema, as a paste-into-SQL-Editor script. **Untouched this session** — still not automatically applied, see §5/§12. |
| `assets/video/hero-soccer.mp4`, `assets/images/hero-soccer-poster.jpg` | Homepage hero background video + its poster frame. Still untracked in git (see §16). **No other photo assets exist in the project** — see §10, Photography Status. |

---

## 4. Advisor System

Advisors are described by **two independent, manually-synced data sources** that need to agree on `slug` for the site to work correctly:

**A. Directory info** (name, school, sport, major, bio, "fit" line, photo, slug) — lives in:
1. A published Google Sheet (CSV URL hardcoded in `advisors-data.js` as `ADVISORS_SHEET_CSV_URL`), fetched live on every page load, **or**
2. The static `ADVISORS` array in `advisors-data.js`, used only if the Sheet fetch fails or returns nothing.

`loadAdvisors()` in `script.js` fetches the Sheet, parses the CSV, and falls back silently. `getAdvisorBySlug(slug)` and the matching/rendering code all go through `loadAdvisors()`. A sheet row with a blank `Slug` column gets one auto-derived from the name via `slugify()` — you never have to hand-build a page for a new advisor, **as long as you also give them a Supabase row with the matching slug** (see B).

**B. Availability + booking data** — lives in Supabase, keyed by `advisors.slug`. This is completely separate from (A). `getOpenSlots()`, `createBookingHold()`, etc. all take a `slug` string and look it up in the Supabase `advisors` table independently of whatever `loadAdvisors()` returned.

**Practical implication:** adding a new advisor today means adding them to the Google Sheet (or the static fallback) **and** inserting a matching row into Supabase's `advisors` table with the *same slug*. Nothing enforces these stay in sync. If the slugs don't match, the profile page will render (from source A) but scheduling will silently show "no advisor found" (source B lookup fails).

**Current advisors (as of last verification — not re-checked this session):**
- `ryan-liu` — Ryan Liu, Harvey Mudd College, Soccer, Engineering
- `jason-wu` — Jason Wu, Claremont McKenna College, Track and Field, Economics

**Advisor data schema is still exactly what §4/§12 have always described** — no new fields (e.g. class year) were added, because nothing in the actual data source (`advisors-data.js` / the Google Sheet) has them yet. Don't build UI for fields that don't exist in the data.

**New this session — derived advisor tags:** `advisorTags(advisor)` and `getAdvisorTopicTags(advisor, limit)` in `script.js` (near `scoreAdvisorMatch`) generate one extra "real" tag per advisor (e.g. "Coach Outreach") by testing the advisor's own `bio`/`fit` text against the same `HELP_TOPIC_KEYWORDS` used for matching — never a fabricated label. Used everywhere advisor tags render: the advisor grid, the homepage coverflow, match cards, and the public profile page. If you add a new advisor field, update `advisorTags()` too so all four render paths stay in sync (they already share this one helper, so there's only one place to change).

**Selection paths:**
- Browse `advisors.html` → advisor profile → "Book With {Name}" (carries `?advisor=slug` into the booking flow, skips matching).
- Or: land on `book-a-call.html` with no advisor chosen → Quick Intake → see 3 recommended matches → pick one.

**Matching logic** (`scoreAdvisorMatch()` in `script.js`): simple deterministic point scoring, **no AI**. +3 same sport, +2 major overlap, +2 advisor's school mentioned in "schools you're interested in," +1 keyword match between the requested help-topic and the advisor's bio/fit text. Top 3 scores shown, with a plain-English reason built from whichever factors matched (fallback text was reworded this session — see §12).

**Advisor privacy token:** each advisor has an `availability_token` (e.g. `rl-8f2k9q1z`) that gates their private `advisor-availability.html?token=...` link, looked up via the Supabase `get_advisor_by_token` RPC. `advisors-data.js` still has an old comment (lines 20–25) saying the token isn't secure — that's stale/incorrect for the Supabase path. Don't trust that comment. (Untouched this session.)

---

## 5. Supabase

**Not touched this session at all** — no schema, RPC, or table changes were made. Everything below is unchanged from the last handoff and has **not been re-verified**; treat the "live?" column as being exactly as stale/fresh as it was before.

**Project:** `bympsaslhwtbzeuwnrev.supabase.co`. Connection constants live in `supabase-config.js` as `SUPABASE_URL` and `SUPABASE_ANON_KEY` — **these exact variable names are what `script.js` expects to find in scope.** The key committed there is the *publishable/anon* key, safe to expose client-side by design. **Never** put a `service_role`/secret key in any file that ships to the browser.

### Tables
- **`advisors`** — `id, name, slug (unique), school, sport, major, bio, photo_url, expertise_tags (text[]), availability_token (unique), active, created_at`. RLS enabled, no direct anon grants — public reads go through `advisors_public`; everything else goes through SECURITY DEFINER functions.
- **`advisor_availability`** — `id, advisor_id (FK), day_of_week (0=Sun..6=Sat), start_time, end_time, created_at`. RLS enabled, no direct anon grants at all.
- **`bookings`** — `id, advisor_id (FK), athlete_name, athlete_email, start_time, end_time, status, payment_status, stripe_session_id, hold_expires_at, created_at`. RLS enabled, no direct anon grants. **Note (new this session):** the intake form now also collects "who's attending" and a parent/guardian email (§7), but there is no column for either in this table — they currently only ever reach the mailto placeholder body, never Supabase. If you wire up real persistence for these, you'll need a migration.

### View
- **`advisors_public`** — `id, name, slug, school, sport, major, bio, photo_url, expertise_tags, active` (excludes `availability_token`). Not currently queried by the frontend (still uses the Google Sheet — see §4).

### RPC functions (SECURITY DEFINER, `search_path = public`)
| Function | Purpose | Live in Supabase? (unverified this session) |
|---|---|---|
| `get_advisor_by_token(p_token)` | Token → `{id, name, slug}` | ✅ Last confirmed live |
| `get_open_slots(p_slug, p_from, p_to, p_slot_minutes=30)` | Real 30-min open slots for a date range | ✅ Last confirmed live |
| `create_booking_hold(...)` | Atomic 10-minute hold | ✅ *A* version is live; **unconfirmed whether the self-healing expired-hold fix is deployed** — verify in SQL Editor. |
| `save_advisor_availability(p_token, p_blocks)` | Token-gated wholesale replace of a schedule | ✅ Last confirmed live |
| `get_advisor_availability(p_token)` | Read back saved schedule (pre-fill editor) | ❌ **Last known NOT live** (`PGRST202 function not found`). Run the block in `schema.sql`. |
| `cancel_booking_hold(p_booking_id)` | Releases a still-pending hold on advisor-switch | ❌ **Last known NOT live.** Run the block in `schema.sql`. |

**Action still needed** (unchanged from before): open Supabase's SQL Editor and run the `get_advisor_availability` and `cancel_booking_hold` blocks from `supabase/schema.sql` (they're `create or replace`, safe to re-run). Confirm `create_booking_hold`'s live definition matches the self-healing version at the bottom of the file.

### Security model
No user auth system. "Authorization" is entirely: (1) possession of an advisor's `availability_token`, (2) the partial unique index `bookings_no_overlap` on `(advisor_id, start_time) where status in ('pending','confirmed')` — this is what makes double-booking prevention race-proof, not any application-level check.

### How the frontend connects
If the Supabase CDN script and `SUPABASE_URL` are both present in the page, `script.js` creates a client as `const sb`. Every Supabase-dependent function checks `if (!sb) return <safe default>` first.

---

## 6. Availability System

Unchanged this session. Full detail preserved from the last handoff:

1. An advisor opens their private link: `advisor-availability.html?token=<their availability_token>`.
2. `getAdvisorByToken()` calls `get_advisor_by_token` to resolve their name.
3. The page is meant to pre-fill previously-saved blocks via `get_advisor_availability` — **currently broken, see §5, always starts blank.**
4. The advisor adds time blocks per day of week (day 0=Sunday..6=Saturday, matching JS `Date.getDay()` and Postgres `extract(dow from date)` — verified identical convention).
5. On save, the whole set of blocks is sent to `save_advisor_availability`, which **deletes and re-inserts** all rows atomically (wholesale replace, not a diff).
6. `get_open_slots(slug, from_date, to_date)` loops each calendar day, maps to day-of-week, finds saved blocks, generates slots — so "Tuesday 5–8pm" recurs automatically.
7. **30-minute slot generation:** fixed steps from `start_time`, stopping once a slot would run past `end_time`.
8. Each slot is excluded if there's a `confirmed` booking or an unexpired `pending` hold at that exact timestamp.
9. `book-a-call.html` queries a 14-day forward window, groups by date, renders only dates with open slots.
10. **No real timezone handling** — reads ISO string's HH:MM directly, avoiding `Date`-object conversion, fine as long as advisor/athlete share a timezone assumption.
11. Past times filtered out client-side, not in SQL.

---

## 7. Booking / Hold System

1. Athlete picks a date pill → time button → fills Name + Email → submits.
2. Calls `createBookingHold(slug, slotStartIso, name, email)` → `create_booking_hold` RPC.
3. Inserts a `bookings` row, `status='pending'`, `hold_expires_at = now() + 10 minutes`.
4. **Double-booking prevention** via the partial unique index — verified live, including a real concurrent-attempt test.
5. Held/booked times are hidden from `get_open_slots`.
6. **Expired-hold re-booking:** the self-healing fix's live-deployment status is still unconfirmed (§5) — verify before relying on it.
7. **Switching advisors mid-flow** is supposed to call `cancelBookingHold(previousHoldId)` — **not live yet**, old hold just self-expires after 10 minutes instead of releasing immediately.
8. After a successful hold, the UI reveals "Continue to Payment" on the same page — placeholder, not real payment (§11).

**New this session — a visible 4-step progress indicator** ("About the Athlete → Advisor → Time → Payment") now sits above the booking flow in `book-a-call.html`, driven by `setStep(n)` in `script.js` (search for `data-step-indicator`). It's called at every transition: initial load (step 1), intake submit (step 2, or step 3 if `?advisor=` skipped matching), advisor selection (step 3), and "Continue to Payment" click (step 4).

**New this session — two new Quick Intake fields:** "Who will attend the call?" (Athlete / Athlete + Parent-Guardian / Parent-Guardian) and an optional "Parent/Guardian Email." Both are collected into `state.intake` and appended to the final mailto summary body — **neither is persisted to Supabase** (the `bookings` table has no columns for them; see §5's note on the `bookings` table).

---

## 8. Current Customer Flow

### General entry (nav "Book a Call" → `book-a-call.html`, no `?advisor=`)
```
Quick Intake (incl. attendee/parent-email fields)  →  Recommended Advisors (top 3, scored)
  →  Select Advisor  →  Choose Date  →  Choose Time  →  10-Minute Hold  →  Continue to Payment (placeholder)
```
A step indicator (§7) tracks progress throughout. **Status: fully implemented and working**, including switching between recommended advisors (hold-release on switch is the one piece not yet live per §7.7).

### Direct-advisor entry (advisor profile → "Book With {Name}" → `book-a-call.html?advisor=slug`)
```
Book With {Advisor}  →  Quick Intake (same form, personalized copy)
  →  (matching skipped, step indicator jumps to step 3)  →  Date/Time/Hold  →  Continue to Payment (placeholder)
```
**Status: fully implemented and working.**

### What's fully implemented
- Quick intake (with the two new fields), matching, both entry paths, step indicator, real Supabase-backed date/time selection, real atomic holds, advisor separation, mobile responsiveness, `prefers-reduced-motion` handling on the hero, a real text-color/contrast system (§9), a full-site copy pass (§12).

### What's partially implemented
- Advisor-switch hold release (function not deployed, see §5/§7).
- Availability editor pre-fill on reopen (function not deployed, see §5/§6).
- Directory data has the Sheet/Supabase dual-source fragility described in §4.
- New intake fields (attendees, parent email) reach the mailto placeholder only, not Supabase (§5/§7).

### What's planned but not implemented at all
- Stripe / real payment (§11).
- Confirmation emails to athlete or advisor.
- Calendar integrations.
- Any admin view/dashboard.
- **Photography** — discussed at length this session but nothing implemented yet. See §10.
- The "longer intake" fields (schools already contacted, coach responses, highlight video, etc.) — still intentionally postponed.

---

## 9. Design System

**Palette** (see `:root` in `style.css`) — **the gold accent changed this session, everything else is the same:**
- `--page-bg: #EFE6D2` / `--panel-bg: #E3D3AC` / `--card-bg: #FBF7EC` (cream/tan/off-white)
- `--hero-1: #1c1712` / `--hero-2: #050403` (near-black, dark cards/hero gradients)
- `--cream: #efe8d8` (heading text on dark) / `--ink: #19160f` (heading text on light)
- `--muted-dark: #4E4636` (body text on light — unchanged, already had good contrast margin)
- `--gold: #c9a227` (eyebrow/accent **on dark** backgrounds only — kept, already had excellent contrast: 7.3–8.5:1)
- `--gold-deep: #75540E` **(changed this session, was `#8A6A16`)** — eyebrow/accent **on light** backgrounds. The old value only hit 4.07:1 on cream and 3.41:1 on the tan panel bg, an AA fail. **A single gold cannot satisfy both dark and light backgrounds at once** — verified numerically; don't try to unify them into one value.

**New this session — §9a, Text Color / Contrast System:** the whole site now routes through a formal token hierarchy instead of ad-hoc `rgba()` alphas. Comment block at the top of `:root` documents it; summary:

| | ON DARK (hero video, mission/network/contact cards, `.section-banner`) | ON LIGHT (page-bg / panel-bg / card-bg) |
|---|---|---|
| Eyebrow | `--gold` | `--gold-deep` |
| Heading | `--cream` | `--ink` |
| Body/secondary | `--text-body-dark` (`#BEB7AA`, new) | `--muted-dark` |
| Placeholder/muted | (folds into `--text-body-dark`) | `--text-muted-light` (`#756C5D`, new) |
| Error state | — | `--text-error` (`#9b3b2c`, now a token, was a bare hex) |

`--text-body-dark` replaced **18 separate call sites** that previously used 6 different translucent-cream alpha values (0.4–0.9) for the same conceptual role — hero subtext, mission/network/contact card leads, availability-editor labels, deliverable-plan text, etc. It's a **solid** color (not translucent), which also makes hero text over the video reliably readable regardless of what's playing behind it, rather than blending with the footage. **Rule going forward: never hardcode a new `rgba(239,232,216,…)` or `rgba(0,0,0,…)` text color — use one of these tokens.**

**Bugs found and fixed this session (all in `style.css`):**
- **`.field-optional` was cream-on-cream (~1:1 contrast), effectively invisible** on the booking intake form's "(optional)" labels — it hardcoded a color meant for dark cards but was also used on the light intake form. Fixed to `color: inherit; opacity: 0.8` so it correctly dims whichever color it inherits.
- **`<select>` dropdowns had no styling at all** — `.contact-form input, .contact-form textarea` never included `select`, so both dropdowns (help-topic, attendees) fell back to the browser's native control. Fixed: full input-matching style plus a custom gold chevron (`appearance: none` + inline SVG).
- **`.home-content` (index.html) had no background**, so `body:has(.launch-hero)`'s near-black override (meant only for the thin gap around the hero) bled through behind any plain-text section below the hero. Invisible until the new Parent FAQ/"Who It's For" sections were added (no card behind their text). Fixed by giving `.home-content` its own `background` matching the sitewide cream + radial-gradient treatment.
- **`.launch-hero`'s height subtracted 24px** (`calc(100vh - 24px)`) despite having a bottom margin of `0` — leaving a visible ~12px cream sliver (the next section peeking through) at the very bottom of the hero. Fixed to `calc(100vh - 12px)` (and the `100svh` variant) so the card reaches the true bottom edge; the 12px top/side inset is untouched.
- Several **decorative gold icons/arrows** (checklist checkmarks, bento-flow arrows, step-row arrows) were using translucent `--gold` directly on light backgrounds — as low as **1.27:1**. Switched to solid `--gold-deep`.
- A stale CSS rule that force-centered the 7th card in `.resource-grid` (written for the old 7-card Resources layout) was removed after the page was trimmed to 3 cards — it would have mis-placed the 3rd card otherwise.

**Homepage hero** (`.launch-hero`, shared by `index.html`/`launch.html`) — layout/video/poster/animation all unchanged from last handoff, **except**:
- The bottom-gap bug above is fixed.
- The overlay gradient (`.launch-hero::before`) was strengthened (0.6/0.32/0.78 → 0.68/0.42/0.85 opacity at its three stops) for extra legibility margin.
- A soft `text-shadow` was added, inherited by everything in `.hero-content` **except** `.btn-pill` (the solid cream button opts back out, since a shadow would just smudge dark-on-cream text) — a second, video-content-independent safety net for text legibility.
- New copy: a small gold eyebrow ("High-Academic D3 Soccer Recruiting") above the headline, and a trust line ("Current D3 athletes · Sport-specific guidance · Parents welcome") below the CTAs. See §12 for the full copy pass.

**New homepage sections (all added this session, index.html):**
- **"Who It's For"** — plain editorial text block (no card), between "What We Help With" and Parent Trust.
- **"Parent Trust"** (upgraded from the old "Why Us") — a 3-column trust grid (Current Experience / Relevant Matching / Clear Next Steps) inside the existing dark `.network-card`, plus "Parents are welcome to join calls."
- **"Parent FAQ"** — 7 expandable Q&A tiles, reusing the pre-existing (previously unused anywhere) `.tile[data-expandable]`/`.tile-detail` pattern and its already-wired JS handler.

**New page-header treatment — `.editorial-header`:** a plain heading (eyebrow + h2 + thin rule, no dark banner) now used on `advisors.html`, `pricing.html`, and `resources.html` specifically so not every page opens with the same big rounded black banner. `index.html`, `how-it-works.html`, and `book-a-call.html` keep `.section-banner` (more content weight, justifies it).

**Things that should NOT be redesigned without being explicitly asked:**
- The cream/tan/near-black palette, the gold accent split (dark vs. light variants), the rounded-card visual language, the floating pill nav.
- The bento-grid "What We Help With" section, the advisor coverflow carousel, the How It Works detailed timeline (the new 5-step overview sits *above* it, doesn't replace it).
- The hero's oversized-wordmark-bottom-left / copy-lower-right layout.

**Known dead CSS (found, not removed — zero live impact, flagging for future cleanup):** `.mission-mark`/`.mission-grid` and `.carousel-card`/`.carousel-detail` (plus a dangling `querySelectorAll('.carousel-card')` in `script.js`) aren't referenced by any current HTML — leftover from an earlier design iteration.

---

## 10. Photography Status

**Nothing has been implemented.** This was discussed at length and explicitly paused mid-session.

- The **only** real photo assets in the project are `assets/video/hero-soccer.mp4` and `assets/images/hero-soccer-poster.jpg` (already in use in the hero). There is no other photography anywhere on the site — advisor cards still render as gold initials-circles, not photos.
- Claude has no image-generation tool and no stock-photo library in this environment, and the user explicitly ruled out generic stock photography ("do not add random stock photos everywhere").
- **Recommended placements were discussed but not built:** one supporting photo in the "Parent Trust" section, real advisor headshots (replacing the initials circles) in the advisor grid/coverflow/profile, and one environment/lifestyle photo near the top of How It Works. Resources and testimonials were explicitly deprioritized (page too sparse for a photo; testimonials don't exist yet).
- **The user's direction when this resumes:** build **placeholder-ready sections** now — clean, clearly-labeled empty slots sized/styled correctly (not fake stock photos) — rather than waiting for real files, so real photos can drop in later with no rework. This has **not been started**; it's the most concrete unfinished thread from this session.

---

## 11. Phase Status

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Advisor slug system, public profile pages, private availability link | ✅ Done |
| **Phase 2** | Supabase-backed real availability, 30-min slot generation, atomic booking holds, unified intake→matching→scheduling flow | ✅ Done, **with the two not-yet-live RPCs noted in §5** |
| **Phase 2.5** *(informal, this session)* | Professionalism/parent-trust/readability pass, text-color token system, full-site copy rewrite, hero bug fixes | ✅ Done — see §9/§12 |
| **Phase 3** | Stripe payments | ❌ Not started at all (§13) |
| **Phase 4** | Emails, calendar integrations, admin tools, photography, general polish | ❌ Not started |

Still only one commit exists (`Phase 2 Working Version`) — everything since, including all of this session's work, is uncommitted (§16).

---

## 12. What Changed This Session (summary)

In rough order:
1. **Professionalism/parent-trust pass** — hero copy (eyebrow + trust line), new Parent Trust / Who It's For / Parent FAQ sections on the homepage, "How We Select Advisors" on `advisors.html`, a booking-flow step indicator, two new intake fields, pricing checklist expansion, Resources trimmed from 7 fake "coming soon" cards to 3 real ones, `.editorial-header` introduced for page-header variety.
2. **`<select>` dropdown styling bug fix** (native browser control → themed, with a custom chevron).
3. **Full WCAG contrast audit** — darkened `--gold-deep`, fixed placeholder/label opacities, strengthened the hero video overlay + added a text-shadow safety net.
4. **Text-color token system** — consolidated ~20 scattered translucent-cream/black text colors into `--text-body-dark` and `--text-muted-light` (new tokens), tokenized the error color, documented the dark/light hierarchy in `:root`. See §9.
5. **Two live bugs found via user screenshots and fixed:** the `.home-content` black-background bleed-through (Parent FAQ heading was unreadable), and the `.launch-hero` bottom-edge gap (cream sliver visible below the hero card).
6. **Full-site copy/voice rewrite** — see §1's voice standard; specific before/afters are no longer needed in this file since the "before" text no longer exists, but the standard itself (avoid vague/generic marketing language, prefer specific claims, never guarantee outcomes) should guide any new copy.
7. **Photography discussion** — paused before implementation; see §10.

---

## 13. Stripe / Payment Status

Unchanged this session. **Not implemented at all.** No Stripe SDK, no checkout session creation, no webhook handler.

After a successful booking hold, the UI reveals a "Complete Your Booking" section with copy that honestly says *"Secure online checkout is coming soon"* and a "Confirm Booking Request" button that sends a `mailto:` link (name, email, advisor, time, hold ID, intake answers **including the two new fields from §7**) to `strivonathletics@gmail.com`. `payment_status` stays `'unpaid'` forever under current code. Do not present this as "payment collected" anywhere — keep the placeholder copy honest until Stripe is actually built.

---

## 14. Known Issues / TODO

- **`cancel_booking_hold` and `get_advisor_availability` RPCs still not deployed** (§5) — unchanged, unverified this session.
- **Unconfirmed whether the self-healing `create_booking_hold` fix is live** (§5/§7.6) — unchanged.
- **Triple-redundant advisor directory data** (Sheet / static fallback / Supabase) with no automated sync (§4) — unchanged.
- **New intake fields (attendees, parent email) aren't persisted to Supabase** — only reach the mailto placeholder (§5/§7). New this session.
- **`advisors-data.js` has a stale "token isn't secure" comment** (lines 20–25) — unchanged, still incorrect, still not cleaned up.
- **No real timezone handling anywhere** — unchanged (§6.10).
- **No email notifications, no admin view** — unchanged.
- **`assets/` (video + poster) still untracked in git** — unchanged, still needs `git add` before the next commit.
- **Photography not implemented** — see §10. Most concrete unfinished thread from this session.
- **Dead CSS/JS found, not removed:** `.mission-mark`, `.carousel-card`/`.carousel-detail` and one dangling `querySelectorAll` referencing it — zero live impact, listed in §9 for future cleanup.
- **Working tree is now significantly larger and further ahead of `origin/main`** than at the last handoff — see §16, committing is more urgent than before.

---

## 15. Important Implementation Rules

- **Preserve working Supabase logic.** RLS, SECURITY DEFINER functions, and the partial-unique-index double-booking guard are deliberate — don't simplify them into direct table grants.
- **Preserve advisor separation.** Every advisor-scoped query/write stays parameterized by `slug`/`token`/`advisor_id`.
- **Do not rebuild working systems unnecessarily.** Inspect before rewriting — booking flow, matching, availability all went through real iteration.
- **Use the text-color token system (§9).** Never hardcode a new translucent text color — pick from the eyebrow/heading/body/muted tokens for whichever background family (dark vs. light) the text sits on.
- **Make small, scoped changes** traceable to a specific request, not opportunistic refactors.
- **Never expose secret keys client-side.** Only the Supabase publishable/anon key belongs in shipped files.
- **No framework migrations** without being explicitly asked.
- **Don't fabricate photography or advisor verification claims.** No "Verified current student-athlete" badge exists — there's no verification process to back it. See §10 for the photography constraint specifically (no image-generation tool, no stock library, user has ruled out generic stock photos).

---

## 16. Important Files

| File | What it does |
|---|---|
| `script.js` | All site JavaScript, ~1,260 lines. Read fully before touching booking/availability/matching/advisor-tag logic. |
| `style.css` | All site CSS, ~2,600 lines. `:root` has the full design-token system including the new text-color hierarchy (§9) — read that comment block before adding any text color. |
| `advisors-data.js` | Advisor directory fallback data + the published Google Sheet CSV URL. |
| `supabase-config.js` | Supabase connection constants. Safe to commit (publishable key only). |
| `supabase/schema.sql` | Complete intended Postgres schema/functions — treat as a spec, verify against the live database (§5). |
| `book-a-call.html` | The real booking page/flow, now with a step indicator — see §7/§8. |
| `book.html` | Dead redirect stub only. |
| `advisor.html` | Public advisor profile template, driven by `?advisor=slug`. |
| `advisor-availability.html` | Private advisor scheduling editor, driven by `?token=...`. |
| `advisors.html` | Full advisor directory + "How We Select Advisors" + application form. |
| `index.html` / `launch.html` | Homepage (now with Parent Trust/Who It's For/Parent FAQ) and minimal splash variant. |

---

## 17. Git State (as of this writing)

```
$ git status
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
	modified:   advisors.html
	modified:   book-a-call.html
	modified:   book.html
	modified:   contact.html
	modified:   how-it-works.html
	modified:   index.html
	modified:   launch.html
	modified:   pricing.html
	modified:   privacy.html
	modified:   resources.html
	modified:   script.js
	modified:   style.css
	modified:   supabase/schema.sql

Untracked files:
	assets/

$ git log --oneline -10
2706a33 Add Strivon project handoff context
ad6cffd Phase 2 Working Version
```

**Still exactly two commits, nothing pushed beyond them.** `supabase/schema.sql`'s diff is unchanged from before this session (it was never touched today) — that modification is entirely pre-existing Phase 2 work. Every other modified file above either carries this session's work on top of the prior unified-booking-flow/hero-video work, or (for `contact.html`, `privacy.html`) was untouched before this session and is now modified purely by this session's copy pass. `assets/` (video + poster) is still completely untracked. A fresh `git clone` of `origin/main` right now would be missing **all** of this: the unified booking flow, the hero video, the entire parent-trust/contrast/copy pass, and the hero/background bug fixes.

**Committing (and pushing) is more urgent than at the last handoff** — there is now a full additional session of real, working improvements sitting only in this working tree.

---

## 18. Next Recommended Task

**Most recent work (uncommitted, this session):** see §12 for the full list. In short — a professionalism/parent-trust pass, a `<select>` styling fix, a full WCAG contrast audit, a sitewide text-color token system, two real bugs found via user screenshots and fixed (black background bleed-through, hero bottom-gap line), and a full-site copy/voice rewrite. Photography was discussed and explicitly paused before any implementation.

**Logical next steps, roughly in order:**
1. **Commit and push.** The working tree is now further ahead of `origin/main` than ever — this is the single highest-value next action, independent of anything else.
2. **Photography placeholders** — the user's explicit direction when this resumes: build placeholder-ready sections (Parent Trust, advisor headshots, How It Works) rather than waiting for real files. See §10 for exactly what was discussed.
3. **Close the Supabase gap** — run the two missing RPC functions (§5) so advisor-switch hold-release and availability pre-fill actually work as designed. Also decide whether to persist the two new intake fields (attendees, parent email) to Supabase, or leave them mailto-only.
4. **Resolve the advisor-data fragility** (§4/§14) — commit to Supabase as the single source of truth for directory info, or build a real sync step.
5. **Phase 3: Stripe** — the payment step is the most visible remaining placeholder.
