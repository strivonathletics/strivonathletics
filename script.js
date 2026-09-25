// Supabase client (Phase 2+). Only pages that need real availability/
// booking data load the Supabase CDN script + supabase-config.js
// before this file, so this stays null everywhere else — every call
// site below checks `if (sb)` first and falls back gracefully.
const sb = (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL)
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const tabs = document.getElementById('tabs');

if (navToggle && tabs) {
  navToggle.addEventListener('click', () => {
    tabs.classList.toggle('open');
  });

  tabs.querySelectorAll('.tab-link').forEach(link => {
    link.addEventListener('click', () => tabs.classList.remove('open'));
  });
}

// "What We Provide" carousel (native scroll-snap)
const track = document.getElementById('carouselTrack');

if (track) {
  const cards = Array.from(track.querySelectorAll('.carousel-card'));
  const count = cards.length;
  const dotsWrap = document.getElementById('carouselDots');

  const detailNum = document.getElementById('detailNum');
  const detailTitle = document.getElementById('detailTitle');
  const detailText = document.getElementById('detailText');

  const dots = cards.map((card, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot';
    dot.setAttribute('aria-label', `Go to item ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dotsWrap.appendChild(dot);
    return dot;
  });

  let activeIndex = 0;

  function updateDetail() {
    const card = cards[activeIndex];
    detailNum.textContent = String(activeIndex + 1).padStart(2, '0');
    detailTitle.textContent = card.dataset.title;
    detailText.textContent = card.dataset.detail;
  }

  function setActive(index) {
    activeIndex = index;
    cards.forEach((card, i) => card.classList.toggle('is-active', i === index));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
    updateDetail();
  }

  function goTo(index) {
    const clamped = ((index % count) + count) % count;
    cards[clamped].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    setActive(clamped);
  }

  cards.forEach((card, i) => {
    card.addEventListener('click', () => goTo(i));
  });

  document.querySelector('.carousel-prev').addEventListener('click', () => goTo(activeIndex - 1));
  document.querySelector('.carousel-next').addEventListener('click', () => goTo(activeIndex + 1));

  // Keep the active card in sync when the user scrolls/swipes manually
  let scrollTimeout;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const trackCenter = track.scrollLeft + track.clientWidth / 2;
      let closest = 0;
      let closestDist = Infinity;
      cards.forEach((card, i) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const dist = Math.abs(cardCenter - trackCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      if (closest !== activeIndex) setActive(closest);
    }, 100);
  });

  setActive(0);
}

// Parse a CSV string (handles quoted fields, commas/newlines inside quotes)
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Strip stray leading/trailing quote characters — guards against sheet
// cells that get pasted in from a formatted source (smart quotes, a
// blockquote's straight-quote wrapping, etc.) instead of plain text.
function stripQuotes(str) {
  return (str || '').replace(/^[\s"'‘’“”]+|[\s"'‘’“”]+$/g, '');
}

// URL-safe slug from an advisor's name — used when a sheet row doesn't
// set one explicitly, so a new advisor never needs a hand-built page.
function slugify(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Load advisors from the published Google Sheet if configured, otherwise
// fall back to the static list in advisors-data.js. Never throws — any
// failure (sheet not published yet, offline, running from file://) just
// falls back silently so the page always renders something.
async function loadAdvisors() {
  const fallback = typeof ADVISORS !== 'undefined' ? ADVISORS : [];
  const url = typeof ADVISORS_SHEET_CSV_URL !== 'undefined' ? ADVISORS_SHEET_CSV_URL : '';
  if (!url) return fallback;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return fallback;

    const rows = parseCSV(await res.text());
    const header = rows[0];
    const body = rows.slice(1);
    if (!header || !body.length) return fallback;

    const idx = {
      name: header.indexOf('Name'),
      school: header.indexOf('School'),
      sport: header.indexOf('Sport'),
      major: header.indexOf('Major'),
      bio: header.indexOf('Bio'),
      fit: header.indexOf('Fit'),
      photo: header.indexOf('Photo'),
      slug: header.indexOf('Slug'),
      token: header.indexOf('AvailabilityToken'),
      // Optional — a school and its athletic program aren't always the same
      // name (e.g. Harvey Mudd College competes athletically as part of
      // CMS). Leave the sheet column blank to just not show a second line.
      athleticProgram: header.indexOf('AthleticProgram'),
      schoolLogo: header.indexOf('SchoolLogo'),
    };

    const fromSheet = body
      .filter(r => r[idx.name] && r[idx.name].trim())
      .map(r => {
        const name = r[idx.name].trim();
        const explicitSlug = idx.slug > -1 ? (r[idx.slug] || '').trim() : '';
        return {
          initials: name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(),
          name,
          school: (r[idx.school] || '').trim(),
          sport: (r[idx.sport] || '').trim(),
          major: (r[idx.major] || '').trim(),
          photo: idx.photo > -1 ? (r[idx.photo] || '').trim() : '',
          bio: stripQuotes(r[idx.bio]),
          fit: stripQuotes(r[idx.fit]),
          slug: explicitSlug || slugify(name),
          availabilityToken: idx.token > -1 ? (r[idx.token] || '').trim() : '',
          athleticProgram: idx.athleticProgram > -1 ? (r[idx.athleticProgram] || '').trim() : '',
          schoolLogo: idx.schoolLogo > -1 ? (r[idx.schoolLogo] || '').trim() : '',
        };
      });

    return fromSheet.length ? fromSheet : fallback;
  } catch (err) {
    return fallback;
  }
}

// Look up one advisor by slug/token — every profile, booking, and
// availability page is this same lookup against the same shared data
// source, so a new advisor works everywhere the moment they're added to
// the sheet (or the fallback list), with no per-advisor code.
async function getAdvisorBySlug(slug) {
  if (!slug) return null;
  const all = await loadAdvisors();
  return all.find(a => a.slug === slug) || null;
}

// Phase 2: token lookup now goes through Supabase's get_advisor_by_token
// RPC instead of scanning the public advisor list — this is the fix for
// the Phase 1 caveat that the token traveled through the same public
// feed every visitor's browser fetched. Requires supabase-config.js +
// the Supabase CDN script to be loaded on the page (advisor-availability
// .html only); returns null otherwise rather than throwing.
async function getAdvisorByToken(token) {
  if (!token || !sb) return null;
  const { data, error } = await sb.rpc('get_advisor_by_token', { p_token: token });
  if (error || !data || !data.length) return null;
  return data[0];
}

// --- Phase 2: real slot data (Supabase) ---------------------------------

// Formats an ISO timestamp's own HH:MM directly, without going through
// a Date object's local-timezone conversion. The schema currently has
// no real timezone handling (advisor-saved times are stored and
// returned as raw wall-clock values) — reading the string directly
// keeps display consistent with what was actually saved, regardless of
// the viewer's browser timezone. Revisit if advisors/athletes span
// multiple timezones.
function formatSlotLabel(isoString) {
  const [h, m] = isoString.slice(11, 16).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function slotDateStr(isoString) {
  return isoString.slice(0, 10);
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Real, synced, race-proof — see supabase/schema.sql's get_open_slots
// and create_booking_hold. Both return null/throw-safe results so a
// page can fall back to a friendly message instead of a raw error.
async function getOpenSlots(slug, fromDate, toDate) {
  if (!sb) return [];
  const { data, error } = await sb.rpc('get_open_slots', {
    p_slug: slug,
    p_from: toDateStr(fromDate),
    p_to: toDateStr(toDate),
  });
  return error ? [] : (data || []).map(row => row.slot_start);
}

async function createBookingHold(slug, slotStartIso, athleteName, athleteEmail) {
  if (!sb) return { error: 'Booking isn\'t connected on this page.' };
  const { data, error } = await sb.rpc('create_booking_hold', {
    p_slug: slug,
    p_slot_start: slotStartIso,
    p_athlete_name: athleteName,
    p_athlete_email: athleteEmail,
  });
  return error ? { error: error.message } : { bookingId: data };
}

// Releases a still-pending hold — used when the athlete switches to a
// different advisor mid-flow (see the unified booking flow below) so
// the abandoned slot doesn't stay blocked for the full 10 minutes.
// Best-effort: if it fails, the hold still self-expires on its own.
async function cancelBookingHold(bookingId) {
  if (!sb || !bookingId) return;
  await sb.rpc('cancel_booking_hold', { p_booking_id: bookingId });
}

// --- Simple, deterministic advisor matching (no AI) ---------------------
// Scores every advisor against the athlete's quick-intake answers using
// only structured fields already in the advisor data (sport, major,
// school) plus a light keyword match between the requested help topic
// and the advisor's bio/fit text. Good enough for "here are 2-3 solid
// options," not meant to be precise.
const HELP_TOPIC_KEYWORDS = {
  'School Fit': ['fit', 'selective', 'academic', 'realistic', 'match'],
  'Coach Outreach': ['outreach', 'email', 'coach', 'contact'],
  'Camps/Showcases': ['camp', 'showcase'],
  'Pre-Reads': ['pre-read', 'preread', 'academic index'],
  'Recruiting Timeline': ['timeline', 'when', 'process', 'step'],
  'General Recruiting Strategy': ['strategy', 'plan', 'advice'],
};

function scoreAdvisorMatch(intake, advisor) {
  let score = 0;
  const reasons = [];

  if (intake.sport && advisor.sport && intake.sport.trim().toLowerCase() === advisor.sport.trim().toLowerCase()) {
    score += 3;
    reasons.push(`also played ${advisor.sport}`);
  }

  if (intake.major && advisor.major) {
    const im = intake.major.trim().toLowerCase();
    const am = advisor.major.trim().toLowerCase();
    if (im && am && (im.includes(am) || am.includes(im))) {
      score += 2;
      reasons.push(`studied ${advisor.major}`);
    }
  }

  if (intake.schools && advisor.school) {
    if (intake.schools.toLowerCase().includes(advisor.school.toLowerCase())) {
      score += 2;
      reasons.push(`went to ${advisor.school}`);
    }
  }

  if (intake.helpTopic) {
    const keywords = HELP_TOPIC_KEYWORDS[intake.helpTopic] || [];
    const bioText = `${advisor.bio || ''} ${advisor.fit || ''}`.toLowerCase();
    if (keywords.some(k => bioText.includes(k))) {
      score += 1;
      reasons.push(`have helped athletes with ${intake.helpTopic.toLowerCase()}`);
    }
  }

  const reasonText = reasons.length
    ? `Good fit because they ${reasons.slice(0, 2).join(' and ')}.`
    : `A solid option based on what you shared.`;

  return { score, reasonText };
}

function getTopAdvisorMatches(intake, advisors, count = 3) {
  return advisors
    .map(advisor => ({ advisor, ...scoreAdvisorMatch(intake, advisor) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

// Surfaces a real, derived "help with" tag (e.g. "Coach Outreach") by
// testing the advisor's own bio/fit text against the same keyword sets
// used for matching above — never a fabricated label, only ever what
// their bio actually mentions.
function getAdvisorTopicTags(advisor, limit = 1) {
  const bioText = `${advisor.bio || ''} ${advisor.fit || ''}`.toLowerCase();
  return Object.entries(HELP_TOPIC_KEYWORDS)
    .filter(([, keywords]) => keywords.some(k => bioText.includes(k)))
    .map(([topic]) => topic)
    .slice(0, limit);
}

function advisorTags(advisor) {
  return [advisor.sport, advisor.major, 'Selective D3', ...getAdvisorTopicTags(advisor)].filter(Boolean);
}

// A mentor's college and their athletic program aren't always the same
// name — e.g. Harvey Mudd College competes athletically as part of CMS
// (Claremont-Mudd-Scripps), so the program line should read "CMS Soccer,"
// not "Harvey Mudd College Soccer." Falls back to the plain sport name
// when no distinct program is set, so nothing breaks for advisors who
// don't need the distinction.
function advisorProgramLabel(advisor) {
  return advisor.athleticProgram || advisor.sport || '';
}

// Render advisor cards from the shared/live data so the Home page's
// Featured Advisors and the full Advisors page never drift apart. A grid
// with a data-limit (the homepage teaser) is a lower-commitment context,
// so its cards point to the full roster; the full Advisors page links
// straight to the request form since the visitor has already chosen.
document.querySelectorAll('[data-advisor-grid]').forEach(async grid => {
  const all = await loadAdvisors();
  const isTeaser = grid.hasAttribute('data-limit');

  // ?school=<name> (e.g. from the homepage "Schools & Programs Represented"
  // links) filters the full roster down to that one school — never applies
  // to the homepage teaser grid, which doesn't carry that query param.
  const schoolFilter = !isTeaser ? new URLSearchParams(window.location.search).get('school') : null;
  const filtered = schoolFilter
    ? all.filter(a => (a.school || '').toLowerCase() === schoolFilter.toLowerCase())
    : all;

  const limit = isTeaser ? parseInt(grid.dataset.limit, 10) : filtered.length;
  const list = filtered.slice(0, limit);

  const filterBanner = document.querySelector('[data-school-filter-banner]');
  if (filterBanner) {
    if (schoolFilter && list.length) {
      filterBanner.hidden = false;
      filterBanner.innerHTML = `Showing mentors at <strong>${schoolFilter}</strong> &middot; <a href="advisors.html">Clear filter</a>`;
    } else {
      filterBanner.hidden = true;
    }
  }

  if (!list.length) {
    grid.innerHTML = schoolFilter
      ? `<div class="placeholder-box">No mentors at ${schoolFilter} yet. <a href="advisors.html">View all mentors &rarr;</a></div>`
      : `<div class="placeholder-box">Mentor profiles are on the way &mdash; check back soon.</div>`;
    return;
  }

  grid.innerHTML = list.map(a => {
    const tags = advisorTags(a);
    const photo = a.photo
      ? `<img class="advisor-photo" src="${a.photo}" alt="${a.name}">`
      : `<div class="advisor-photo advisor-photo-initials">${a.initials}</div>`;
    const cta = `<a class="advisor-cta" href="advisor.html?advisor=${encodeURIComponent(a.slug)}">View Mentor &rarr;</a>`;

    return `
    <div class="advisor-card">
      <div class="advisor-card-top">
        ${photo}
        <div>
          <div class="advisor-name">${a.name}</div>
          <div class="advisor-college">${a.school}</div>
          ${advisorProgramLabel(a) ? `<div class="advisor-program">${advisorProgramLabel(a)}</div>` : ''}
        </div>
      </div>
      ${tags.length ? `<div class="advisor-tags">${tags.map(t => `<span class="advisor-tag">${t}</span>`).join('')}</div>` : ''}
      <p class="advisor-bio">${a.bio}</p>
      ${cta}
    </div>
  `;
  }).join('');
});

// "Schools & Programs Represented" (homepage) — grouped live from the same
// loadAdvisors() source as every other advisor render, so it only ever
// lists schools with an actual current Strivon mentor and grows
// automatically as more mentors are approved. Never a partnership/
// sponsorship claim (see the disclaimer copy next to this section in
// index.html). Each entry links to the Advisors page pre-filtered to that
// school (?school=<name>, read by the [data-advisor-grid] renderer above).
document.querySelectorAll('[data-program-row]').forEach(async wrap => {
  const all = await loadAdvisors();

  const bySchool = new Map();
  all.forEach(a => {
    if (!a.school) return;
    if (!bySchool.has(a.school)) bySchool.set(a.school, { count: 0, logo: '' });
    const entry = bySchool.get(a.school);
    entry.count += 1;
    if (!entry.logo && a.schoolLogo) entry.logo = a.schoolLogo;
  });

  if (!bySchool.size) {
    wrap.innerHTML = `<div class="placeholder-box">Mentor schools will appear here as mentors join.</div>`;
    return;
  }

  wrap.innerHTML = Array.from(bySchool.entries()).map(([school, { count, logo }]) => {
    // Logos are only ever shown if a school-permitted asset URL is set on
    // an advisor row — never invented or fetched automatically. Otherwise
    // a clean styled initials mark stands in, same as the advisor-photo
    // fallback pattern used elsewhere on the site.
    const mark = logo
      ? `<img class="program-logo" src="${logo}" alt="${school} logo">`
      : `<span class="program-mark">${school.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>`;

    return `
      <a class="program-item" href="advisors.html?school=${encodeURIComponent(school)}">
        ${mark}
        <span class="program-name">${school}</span>
        <span class="program-count">${count} mentor${count > 1 ? 's' : ''}</span>
      </a>
    `;
  }).join('');
});

// Featured Advisors — 3D coverflow carousel (homepage only). Reuses the
// same loadAdvisors() data source as the grid above so the homepage
// teaser and the full Advisors page never drift apart. The full
// Advisors page keeps the plain grid — this only runs where the
// coverflow markup exists.
const coverflowEl = document.querySelector('[data-advisor-coverflow]');

if (coverflowEl) {
  (async () => {
    const track = coverflowEl.querySelector('[data-coverflow-track]');
    const dotsWrap = coverflowEl.querySelector('[data-coverflow-dots]');
    const profile = coverflowEl.querySelector('[data-coverflow-profile]');
    const prevBtn = coverflowEl.querySelector('.coverflow-prev');
    const nextBtn = coverflowEl.querySelector('.coverflow-next');

    const advisors = (await loadAdvisors()).slice(0, 6);

    if (!advisors.length) {
      coverflowEl.innerHTML = `<div class="placeholder-box">Advisor profiles are on the way &mdash; check back soon.</div>`;
      return;
    }

    let activeIndex = 0;

    const cardEls = advisors.map((a, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'coverflow-card';
      card.setAttribute('aria-label', `Show ${a.name}'s profile`);
      const photo = a.photo
        ? `<img class="coverflow-photo-img" src="${a.photo}" alt="${a.name}">`
        : `<div class="coverflow-photo-initials">${a.initials}</div>`;
      card.innerHTML = `
        <div class="coverflow-photo">${photo}</div>
        <div class="coverflow-name">${a.name}</div>
      `;
      card.addEventListener('click', () => goTo(i));
      track.appendChild(card);
      return card;
    });

    const dots = advisors.map((a, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot';
      dot.setAttribute('aria-label', `Go to ${a.name}`);
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
      return dot;
    });

    // Spacing between cards scales down at the same widths the rest of
    // the site switches layout (860px / 680px breakpoints in style.css).
    function spacing() {
      const w = coverflowEl.clientWidth;
      if (w < 680) return 92;
      if (w < 860) return 150;
      return 200;
    }

    function layout() {
      const count = advisors.length;
      const step = spacing();

      cardEls.forEach((card, i) => {
        let offset = i - activeIndex;
        if (offset > count / 2) offset -= count;
        if (offset < -count / 2) offset += count;

        const abs = Math.abs(offset);
        const x = offset * step;
        const rotate = offset === 0 ? 0 : Math.sign(offset) * -20;
        const scale = abs === 0 ? 1 : abs === 1 ? 0.82 : 0.68;
        const opacity = abs === 0 ? 1 : abs === 1 ? 0.7 : abs === 2 ? 0.3 : 0;

        card.style.transform = `translate(-50%, -50%) translateX(${x}px) rotateY(${rotate}deg) scale(${scale})`;
        card.style.opacity = opacity;
        card.style.zIndex = 100 - abs;
        card.style.pointerEvents = abs > 2 ? 'none' : 'auto';
        card.classList.toggle('is-active', offset === 0);
      });

      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === activeIndex));
      updateProfile();
    }

    function updateProfile() {
      const a = advisors[activeIndex];
      const tags = advisorTags(a);
      const fitText = (a.fit || '').replace(/^Best for:\s*/i, '');

      profile.innerHTML = `
        <div class="advisor-name">${a.name}</div>
        <div class="advisor-college">${a.school}</div>
        ${advisorProgramLabel(a) ? `<div class="advisor-program">${advisorProgramLabel(a)}</div>` : ''}
        ${a.major ? `<div class="coverflow-major">${a.major}</div>` : ''}
        ${tags.length ? `<div class="advisor-tags">${tags.map(t => `<span class="advisor-tag">${t}</span>`).join('')}</div>` : ''}
        <p class="advisor-bio">${a.bio}</p>
        ${fitText ? `<p class="coverflow-fit"><span class="coverflow-fit-label">Good for:</span> ${fitText}</p>` : ''}
        <a class="advisor-cta" href="advisor.html?advisor=${encodeURIComponent(a.slug)}">View ${a.name.split(' ')[0]} &rarr;</a>
      `;
    }

    function goTo(index) {
      const count = advisors.length;
      activeIndex = ((index % count) + count) % count;
      layout();
    }

    prevBtn.addEventListener('click', () => goTo(activeIndex - 1));
    nextBtn.addEventListener('click', () => goTo(activeIndex + 1));

    if (advisors.length < 2) {
      prevBtn.hidden = true;
      nextBtn.hidden = true;
      dotsWrap.hidden = true;
    }

    coverflowEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(activeIndex - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(activeIndex + 1); }
    });

    // Drag / swipe — Pointer Events cover mouse and touch in one pass.
    let dragging = false;
    let startX = 0;

    track.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX;
      track.setPointerCapture(e.pointerId);
    });

    track.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      const delta = e.clientX - startX;
      if (Math.abs(delta) > 40) goTo(activeIndex + (delta < 0 ? 1 : -1));
    });

    track.addEventListener('pointercancel', () => { dragging = false; });

    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(layout, 100);
    });

    layout();
  })();
}

// Advisor public profile (advisor.html?advisor=slug) — one reusable
// template driven entirely by the slug in the URL. Never special-cases
// a specific advisor; any row in the shared data source with a
// matching slug renders correctly here automatically.
const advisorProfileEl = document.querySelector('[data-advisor-profile]');

if (advisorProfileEl) {
  (async () => {
    const slug = new URLSearchParams(window.location.search).get('advisor');
    const a = await getAdvisorBySlug(slug);

    if (!a) {
      advisorProfileEl.innerHTML = `
        <p class="lead">We couldn't find that mentor.</p>
        <a class="advisor-cta" href="advisors.html">&larr; Back to all mentors</a>
      `;
      return;
    }

    document.title = `${a.name} | Strivon Athletics`;

    const tags = advisorTags(a);
    const fitText = (a.fit || '').replace(/^Best for:\s*/i, '');
    const photo = a.photo
      ? `<img class="advisor-photo advisor-photo-lg" src="${a.photo}" alt="${a.name}">`
      : `<div class="advisor-photo advisor-photo-lg advisor-photo-initials">${a.initials}</div>`;

    const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/></svg>';
    const ICON_SPORT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>';
    const ICON_BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5c-1.5-1-4-1.5-6-1.2v13c2-.3 4.5.2 6 1.2 1.5-1 4-1.5 6-1.2v-13c-2-.3-4.5.2-6 1.2z"/><path d="M12 6.5v13"/></svg>';

    advisorProfileEl.innerHTML = `
      <div class="advisor-profile-header">
        ${photo}
        <div>
          <div class="advisor-name advisor-profile-name">${a.name}</div>
          <div class="advisor-info-row advisor-info-row-primary"><span class="advisor-info-icon">${ICON_PIN}</span>${a.school}</div>
          ${advisorProgramLabel(a) ? `<div class="advisor-info-row"><span class="advisor-info-icon">${ICON_SPORT}</span>${advisorProgramLabel(a)}</div>` : ''}
          ${a.major ? `<div class="advisor-info-row"><span class="advisor-info-icon">${ICON_BOOK}</span>${a.major}</div>` : ''}
        </div>
      </div>
      ${tags.length ? `<div class="advisor-tags advisor-profile-tags">${tags.map(t => `<span class="advisor-tag">${t}</span>`).join('')}</div>` : ''}
      <p class="advisor-bio advisor-profile-bio">${a.bio}</p>
      ${fitText ? `<p class="coverflow-fit"><span class="coverflow-fit-label">Good for:</span> ${fitText}</p>` : ''}
      <div class="advisor-profile-actions">
        <a href="book-a-call.html?advisor=${encodeURIComponent(a.slug)}" class="btn-pill btn-pill-dark">
          <span>Book a One-on-One With ${a.name.split(' ')[0]}</span>
          <span class="arrow-circle">&rarr;</span>
        </a>
        <a href="advisors.html" class="advisor-cta">&larr; Back to all mentors</a>
      </div>
    `;
  })();
}


// Advisor private availability editor (advisor-availability.html?token=...)
// Reads and writes through Supabase's token-gated RPCs (see
// supabase/schema.sql) — real, synced across devices, and the token
// itself is never exposed to any public listing: get_advisor_by_token
// only ever returns the one matching row, never the full advisor list.
const availabilityEl = document.querySelector('[data-availability-editor]');

if (availabilityEl) {
  (async () => {
    const token = new URLSearchParams(window.location.search).get('token');
    const a = await getAdvisorByToken(token);

    if (!a) {
      availabilityEl.innerHTML = sb
        ? `<p class="lead">This link isn't valid. Contact Strivon if you need a new one.</p>`
        : `<p class="lead">Live availability saving isn't connected on this page yet.</p>`;
      return;
    }

    document.title = `Set Availability | Strivon Athletics`;

    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const { data: savedRows } = await sb.rpc('get_advisor_availability', { p_token: token });
    const state = {};
    (savedRows || []).forEach(row => {
      const day = row.day_of_week;
      if (!state[day]) state[day] = [];
      state[day].push({ start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) });
    });

    availabilityEl.innerHTML = `
      <p class="eyebrow">Set Your Availability</p>
      <h2>${a.name}</h2>
      <p class="lead">Add the days and times you're generally free for a 30-minute call. Athletes will only ever see open slots within these windows.</p>

      <div class="mission-card">
        <form class="contact-form availability-form" data-availability-form>
          <div class="availability-days" data-availability-days></div>
          <p class="field-group-note">Synced &mdash; reopen this link on any device to see or change what's saved.</p>
          <button type="submit" class="btn-pill">
            <span>Save Availability</span>
            <span class="arrow-circle">&rarr;</span>
          </button>
          <p class="form-status" data-save-status hidden>Saved.</p>
          <p class="form-status" data-save-error hidden></p>
        </form>
      </div>
    `;

    const daysWrap = availabilityEl.querySelector('[data-availability-days]');

    function blockRow(block) {
      const row = document.createElement('div');
      row.className = 'block-row';
      row.innerHTML = `
        <input type="time" value="${block.start || ''}" data-field="start">
        <span class="block-sep">&ndash;</span>
        <input type="time" value="${block.end || ''}" data-field="end">
        <button type="button" class="remove-block-btn" aria-label="Remove this time block">&times;</button>
      `;
      row.querySelector('.remove-block-btn').addEventListener('click', () => row.remove());
      return row;
    }

    DAYS.forEach((day, dayIndex) => {
      const dayEl = document.createElement('div');
      dayEl.className = 'day-row';
      dayEl.dataset.day = dayIndex;

      const dayBlocks = state[dayIndex] || [];

      dayEl.innerHTML = `
        <div class="day-row-head">
          <span class="day-name">${day}</span>
          <button type="button" class="add-block-btn" data-add-block>+ Add a time block</button>
        </div>
        <div class="day-blocks" data-day-blocks></div>
      `;

      const blocksWrap = dayEl.querySelector('[data-day-blocks]');
      dayBlocks.forEach(block => blocksWrap.appendChild(blockRow(block)));

      dayEl.querySelector('[data-add-block]').addEventListener('click', () => {
        blocksWrap.appendChild(blockRow({}));
      });

      daysWrap.appendChild(dayEl);
    });

    const availabilityForm = availabilityEl.querySelector('[data-availability-form]');
    const saveStatus = availabilityEl.querySelector('[data-save-status]');
    const saveError = availabilityEl.querySelector('[data-save-error]');

    availabilityForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveStatus.hidden = true;
      saveError.hidden = true;

      const blocks = [];
      daysWrap.querySelectorAll('.day-row').forEach(dayEl => {
        const dayIndex = parseInt(dayEl.dataset.day, 10);
        dayEl.querySelectorAll('.block-row').forEach(row => {
          const start = row.querySelector('[data-field="start"]').value;
          const end = row.querySelector('[data-field="end"]').value;
          if (start && end) blocks.push({ day: dayIndex, start, end });
        });
      });

      const { error } = await sb.rpc('save_advisor_availability', { p_token: token, p_blocks: blocks });

      if (error) {
        saveError.textContent = error.message;
        saveError.hidden = false;
        return;
      }

      saveStatus.hidden = false;
      setTimeout(() => { saveStatus.hidden = true; }, 2500);
    });
  })();
}

// Expandable tiles (e.g. Resources page) — click to reveal more info
document.querySelectorAll('[data-expandable]').forEach(tile => {
  const detail = tile.querySelector('.tile-detail');
  if (!detail) return;

  tile.addEventListener('click', () => {
    const open = tile.classList.toggle('is-open');
    detail.style.maxHeight = open ? `${detail.scrollHeight}px` : '0px';
  });
});

// Contact form -> mailto fallback (no backend on a static site)
const form = document.getElementById('contactForm');

if (form) {
  // Arrived via an advisor's "Request" link? Pre-fill the message so the
  // preference is clear without the visitor having to type it themselves.
  const requestedAdvisor = new URLSearchParams(window.location.search).get('advisor');
  if (requestedAdvisor) {
    const messageField = form.querySelector('textarea[name="message"]');
    if (messageField) {
      const punctuation = /[.!?]$/.test(requestedAdvisor) ? '' : '.';
      messageField.value = `I'd like to work with ${requestedAdvisor}${punctuation}\n\n`;
      messageField.focus();
      messageField.setSelectionRange(messageField.value.length, messageField.value.length);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = data.get('name');
    const email = data.get('email');
    const message = data.get('message');

    const subject = encodeURIComponent(`Recruiting Inquiry from ${name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\n\n${message}`
    );

    window.location.href = `mailto:strivonathletics@gmail.com?subject=${subject}&body=${body}`;
  });
}

// Unified booking flow (book-a-call.html) — Quick Intake -> Recommended
// Advisors -> Book With {Advisor} -> Payment placeholder, all on one
// page with progressive reveal. Reuses the exact same Phase 2 Supabase
// helpers as before (getOpenSlots/createBookingHold/etc.) — only the
// surrounding flow is new. Arriving with ?advisor=slug (from an
// advisor's profile page) skips the matching step and goes straight to
// that advisor's schedule after the same short intake.
const bookingFlowEl = document.querySelector('[data-booking-flow]');

if (bookingFlowEl) {
  (async () => {
    const preselectedSlug = new URLSearchParams(window.location.search).get('advisor');

    const state = {
      intake: null,
      advisor: null,
      holdId: null,
      holdName: null,
      holdEmail: null,
      slotDisplay: null,
    };

    bookingFlowEl.innerHTML = `
      <div class="step-indicator" data-step-indicator>
        <div class="step-indicator-item" data-step="1"><span class="step-indicator-num">1</span><span class="step-indicator-label">About the Athlete</span></div>
        <span class="step-indicator-sep"></span>
        <div class="step-indicator-item" data-step="2"><span class="step-indicator-num">2</span><span class="step-indicator-label">Mentor</span></div>
        <span class="step-indicator-sep"></span>
        <div class="step-indicator-item" data-step="3"><span class="step-indicator-num">3</span><span class="step-indicator-label">Time</span></div>
        <span class="step-indicator-sep"></span>
        <div class="step-indicator-item" data-step="4"><span class="step-indicator-num">4</span><span class="step-indicator-label">Payment</span></div>
      </div>

      <div class="intake-step" data-intake-step>
        <p class="eyebrow">Quick Intake</p>
        <h3 data-intake-title>A few details before we match you.</h3>
        <p class="lead">Tell us a few details so we can recommend the most relevant advisors. Usually takes less than 2 minutes.</p>

        <form class="contact-form intake-form" data-intake-form>
          <label>
            Sport
            <input type="text" name="sport" required>
          </label>
          <label>
            Graduation Year
            <input type="text" name="gradYear" required>
          </label>
          <label>
            <span>GPA / Academic Level <span class="field-optional">(optional)</span></span>
            <input type="text" name="gpa" placeholder="e.g. 3.9 UW, or top 10%">
          </label>
          <label>
            <span>Intended Major <span class="field-optional">(optional)</span></span>
            <input type="text" name="major">
          </label>
          <label>
            <span>Schools You're Interested In <span class="field-optional">(optional)</span></span>
            <input type="text" name="schools" placeholder="e.g. Harvey Mudd, or STEM-focused D3 schools">
          </label>
          <label>
            What do you want help with?
            <select name="helpTopic" required>
              <option value="" disabled selected>Choose one</option>
              <option>School Fit</option>
              <option>Coach Outreach</option>
              <option>Camps/Showcases</option>
              <option>Pre-Reads</option>
              <option>Recruiting Timeline</option>
              <option>General Recruiting Strategy</option>
            </select>
          </label>
          <label>
            Who will attend the call?
            <select name="attendees" required>
              <option value="" disabled selected>Choose one</option>
              <option>Athlete</option>
              <option>Athlete + Parent/Guardian</option>
              <option>Parent/Guardian</option>
            </select>
          </label>
          <label>
            <span>Parent/Guardian Email <span class="field-optional">(optional)</span></span>
            <input type="email" name="parentEmail" placeholder="For scheduling updates, if different from the athlete's">
          </label>
          <button type="submit" class="btn-pill" data-intake-submit>
            <span data-intake-submit-label>Find My Mentor Matches</span>
            <span class="arrow-circle">&rarr;</span>
          </button>
        </form>
      </div>

      <div class="matches-step" data-matches-step hidden>
        <p class="eyebrow">Your Matches</p>
        <h3>Mentors who fit well</h3>
        <p class="lead">Based on what you shared &mdash; or browse the full roster if you'd rather choose yourself.</p>
        <div class="advisor-grid match-grid" data-match-grid></div>
        <div class="section-cta"><a href="advisors.html" class="btn-pill-outline-dark">View All Mentors &rarr;</a></div>
      </div>

      <div class="schedule-step" data-schedule-step hidden>
        <div data-booking-inner></div>
      </div>

      <div class="payment-step" data-payment-step hidden>
        <p class="eyebrow">Almost There</p>
        <h3>Complete Your Booking</h3>
        <p class="lead">Secure online checkout is coming soon. Confirm below and we'll follow up by email with a payment link to lock in your spot.</p>
        <button type="button" class="btn-pill" data-confirm-booking-btn>
          <span>Confirm Booking Request</span>
          <span class="arrow-circle">&rarr;</span>
        </button>
        <p class="form-status" data-payment-status hidden>Thanks &mdash; we've got your request and will follow up by email shortly to lock in payment and your spot.</p>
      </div>
    `;

    const stepIndicatorEl = bookingFlowEl.querySelector('[data-step-indicator]');
    const stepIndicatorItems = Array.from(stepIndicatorEl.querySelectorAll('[data-step]'));

    function setStep(activeStep) {
      stepIndicatorItems.forEach(item => {
        const n = parseInt(item.dataset.step, 10);
        item.classList.toggle('is-active', n === activeStep);
        item.classList.toggle('is-done', n < activeStep);
      });
    }

    const intakeStepEl = bookingFlowEl.querySelector('[data-intake-step]');
    const intakeTitleEl = bookingFlowEl.querySelector('[data-intake-title]');
    const intakeForm = bookingFlowEl.querySelector('[data-intake-form]');
    const intakeSubmitLabel = bookingFlowEl.querySelector('[data-intake-submit-label]');
    const matchesStepEl = bookingFlowEl.querySelector('[data-matches-step]');
    const matchGridEl = bookingFlowEl.querySelector('[data-match-grid]');
    const scheduleStepEl = bookingFlowEl.querySelector('[data-schedule-step]');
    const bookingInnerEl = bookingFlowEl.querySelector('[data-booking-inner]');
    const paymentStepEl = bookingFlowEl.querySelector('[data-payment-step]');
    const confirmBookingBtn = bookingFlowEl.querySelector('[data-confirm-booking-btn]');
    const paymentStatusEl = bookingFlowEl.querySelector('[data-payment-status]');

    setStep(1);

    let preselectedAdvisor = null;
    if (preselectedSlug) {
      preselectedAdvisor = await getAdvisorBySlug(preselectedSlug);
      if (preselectedAdvisor) {
        intakeTitleEl.textContent = `A few details before we book with ${preselectedAdvisor.name.split(' ')[0]}.`;
        intakeSubmitLabel.textContent = 'Continue';
      }
    }

    // --- Scheduling section (date -> time -> hold) --------------------
    // Same logic as the old book.html picker, just parametrized so it
    // can be (re)rendered for whichever advisor is currently active.
    // Re-invoking this fully replaces the container's contents, so
    // switching advisors can never leak a previous date/time selection.
    async function renderScheduling(advisor) {
      state.advisor = advisor;
      state.holdId = null;
      state.holdName = null;
      state.holdEmail = null;
      state.slotDisplay = null;
      paymentStepEl.hidden = true;
      paymentStatusEl.hidden = true;

      const fullDateFmt = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      const dowFmt = (d) => d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
      const mdFmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
      const dateFromKey = (key) => new Date(`${key}T00:00:00`);

      const rangeStart = new Date();
      const rangeEnd = new Date();
      rangeEnd.setDate(rangeEnd.getDate() + 13);

      const photo = advisor.photo
        ? `<img class="advisor-photo" src="${advisor.photo}" alt="${advisor.name}">`
        : `<div class="advisor-photo advisor-photo-initials">${advisor.initials}</div>`;

      bookingInnerEl.innerHTML = `
        <p class="eyebrow">Book With ${advisor.name.split(' ')[0]}</p>
        <div class="booking-advisor-head">
          ${photo}
          <div>
            <div class="advisor-name">${advisor.name}</div>
            <div class="advisor-college">${advisor.school}</div>
            ${advisorProgramLabel(advisor) ? `<div class="advisor-program">${advisorProgramLabel(advisor)}</div>` : ''}
          </div>
        </div>

        <div class="session-card">
          <div class="session-title">30-Minute One-on-One Recruiting Session</div>
          <div class="advisor-tags">
            ${['School Fit', 'Coach Outreach', 'Recruiting Timeline', 'Camps &amp; Pre-Reads', 'Your Specific Situation'].map(t => `<span class="advisor-tag">${t}</span>`).join('')}
          </div>
          <div class="session-footer">
            <span class="session-price-label">Private call with ${advisor.name.split(' ')[0]}</span>
            <div class="session-price">$30</div>
          </div>
        </div>

        <p class="card-hint booking-slots-note" data-slots-note>Loading available dates&hellip;</p>

        <div class="date-picker" data-date-picker></div>
        <div class="slot-times" data-slot-times></div>

        <div class="slot-selected" data-slot-selected hidden>
          <p class="eyebrow">Selected</p>
          <p class="slot-selected-when" data-slot-selected-when></p>
          <p class="slot-selected-session">30-minute strategy call &middot; $30</p>

          <form class="contact-form slot-confirm-form" data-slot-confirm-form>
            <label>
              Your Name
              <input type="text" name="name" required>
            </label>
            <label>
              Your Email
              <input type="email" name="email" required>
            </label>
            <button type="submit" class="btn-pill" data-confirm-btn>
              <span>Hold This Time</span>
              <span class="arrow-circle">&rarr;</span>
            </button>
            <p class="form-status" data-confirm-error hidden></p>
          </form>

          <div class="hold-confirmed" data-hold-confirmed hidden>
            <p class="hold-confirmed-text">Your time will be held for 10 minutes while you complete checkout.</p>
            <button type="button" class="btn-pill" data-continue-payment-btn>
              <span>Continue to Payment</span>
              <span class="arrow-circle">&rarr;</span>
            </button>
          </div>
        </div>
      `;

      const datePickerEl = bookingInnerEl.querySelector('[data-date-picker]');
      const slotTimesEl = bookingInnerEl.querySelector('[data-slot-times]');
      const slotsNoteEl = bookingInnerEl.querySelector('[data-slots-note]');
      const selectedBox = bookingInnerEl.querySelector('[data-slot-selected]');
      const selectedWhen = bookingInnerEl.querySelector('[data-slot-selected-when]');
      const confirmForm = bookingInnerEl.querySelector('[data-slot-confirm-form]');
      const confirmError = bookingInnerEl.querySelector('[data-confirm-error]');
      const holdConfirmedEl = bookingInnerEl.querySelector('[data-hold-confirmed]');
      const continuePaymentBtn = bookingInnerEl.querySelector('[data-continue-payment-btn]');

      let byDate = new Map();
      let selectedDateKey = null;
      let currentSlotIso = null;

      function resetSelection() {
        selectedBox.hidden = true;
        confirmError.hidden = true;
        confirmForm.hidden = false;
        holdConfirmedEl.hidden = true;
        currentSlotIso = null;
      }

      function renderTimesForSelectedDate() {
        resetSelection();
        const slots = byDate.get(selectedDateKey) || [];

        slotTimesEl.innerHTML = slots.map(iso =>
          `<button type="button" class="slot-btn" data-iso="${iso}">${formatSlotLabel(iso)}</button>`
        ).join('');

        slotTimesEl.querySelectorAll('.slot-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            slotTimesEl.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('is-selected'));
            btn.classList.add('is-selected');

            currentSlotIso = btn.dataset.iso;
            selectedWhen.textContent = `${fullDateFmt(dateFromKey(selectedDateKey))} · ${formatSlotLabel(currentSlotIso)}`;
            selectedBox.hidden = false;
            confirmError.hidden = true;
            confirmForm.hidden = false;
            holdConfirmedEl.hidden = true;
            selectedBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        });
      }

      function selectDate(dateKey) {
        selectedDateKey = dateKey;
        datePickerEl.querySelectorAll('.date-pill').forEach(p => p.classList.toggle('is-selected', p.dataset.date === dateKey));
        renderTimesForSelectedDate();
      }

      async function loadAvailability() {
        resetSelection();
        selectedDateKey = null;
        datePickerEl.innerHTML = '';
        slotTimesEl.innerHTML = '';

        if (!sb) {
          slotsNoteEl.textContent = 'Live scheduling isn’t connected on this page yet.';
          return;
        }

        const openIsoTimes = await getOpenSlots(advisor.slug, rangeStart, rangeEnd);

        const now = Date.now();
        const futureIsoTimes = openIsoTimes.filter(iso => new Date(iso).getTime() > now);

        byDate = new Map();
        futureIsoTimes.forEach(iso => {
          const key = slotDateStr(iso);
          if (!byDate.has(key)) byDate.set(key, []);
          byDate.get(key).push(iso);
        });

        const dateKeys = Array.from(byDate.keys()).sort();

        if (!dateKeys.length) {
          slotsNoteEl.textContent = `${advisor.name.split(' ')[0]} doesn't have any open times in the next two weeks.`;
          return;
        }

        slotsNoteEl.textContent = 'Choose a date.';

        datePickerEl.innerHTML = dateKeys.map(key => {
          const d = dateFromKey(key);
          return `
            <button type="button" class="date-pill" data-date="${key}">
              <span class="date-pill-dow">${dowFmt(d)}</span>
              <span class="date-pill-day">${mdFmt(d)}</span>
            </button>
          `;
        }).join('');

        datePickerEl.querySelectorAll('.date-pill').forEach(btn => {
          btn.addEventListener('click', () => selectDate(btn.dataset.date));
        });

        selectDate(dateKeys[0]);
      }

      confirmForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentSlotIso) return;

        const data = new FormData(confirmForm);
        const name = data.get('name');
        const email = data.get('email');

        const result = await createBookingHold(advisor.slug, currentSlotIso, name, email);

        if (result.error) {
          confirmError.textContent = result.error;
          confirmError.hidden = false;
          await loadAvailability(); // the slot may have just been taken — refresh everything
          return;
        }

        state.holdId = result.bookingId;
        state.holdName = name;
        state.holdEmail = email;
        state.slotDisplay = `${fullDateFmt(dateFromKey(selectedDateKey))} at ${formatSlotLabel(currentSlotIso)}`;

        confirmForm.hidden = true;
        holdConfirmedEl.hidden = false;
      });

      continuePaymentBtn.addEventListener('click', () => {
        setStep(4);
        paymentStepEl.hidden = false;
        paymentStatusEl.hidden = true;
        paymentStepEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      await loadAvailability();
    }

    // --- Matches ---------------------------------------------------------
    function renderMatches(matches) {
      matchGridEl.innerHTML = matches.map(({ advisor, reasonText }) => {
        const tags = advisorTags(advisor);
        const photo = advisor.photo
          ? `<img class="advisor-photo" src="${advisor.photo}" alt="${advisor.name}">`
          : `<div class="advisor-photo advisor-photo-initials">${advisor.initials}</div>`;

        return `
          <div class="advisor-card match-card" data-match-slug="${advisor.slug}">
            <div class="advisor-card-top">
              ${photo}
              <div>
                <div class="advisor-name">${advisor.name}</div>
                <div class="advisor-college">${advisor.school}</div>
                <div class="advisor-program">${[advisorProgramLabel(advisor), advisor.major].filter(Boolean).join(' &middot; ')}</div>
              </div>
            </div>
            ${tags.length ? `<div class="advisor-tags">${tags.map(t => `<span class="advisor-tag">${t}</span>`).join('')}</div>` : ''}
            <p class="match-reason">${reasonText}</p>
            <button type="button" class="advisor-cta" data-select-advisor>Select ${advisor.name.split(' ')[0]} &rarr;</button>
          </div>
        `;
      }).join('');

      matchGridEl.querySelectorAll('[data-match-slug]').forEach((card, i) => {
        card.querySelector('[data-select-advisor]').addEventListener('click', () => selectAdvisor(matches[i].advisor, card));
      });
    }

    async function selectAdvisor(advisor, cardEl) {
      // Part 4: switching advisors releases any hold on the previous one
      // and never carries over date/time state — renderScheduling()
      // always rebuilds the whole section fresh.
      if (state.holdId) {
        await cancelBookingHold(state.holdId);
      }

      matchGridEl.querySelectorAll('.match-card').forEach(c => c.classList.remove('is-selected'));
      if (cardEl) cardEl.classList.add('is-selected');

      setStep(3);
      scheduleStepEl.hidden = false;
      await renderScheduling(advisor);
      scheduleStepEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // --- Intake ------------------------------------------------------
    intakeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(intakeForm);
      state.intake = {
        sport: data.get('sport'),
        gradYear: data.get('gradYear'),
        gpa: data.get('gpa'),
        major: data.get('major'),
        schools: data.get('schools'),
        helpTopic: data.get('helpTopic'),
        attendees: data.get('attendees'),
        parentEmail: data.get('parentEmail'),
      };

      intakeStepEl.hidden = true;

      if (preselectedAdvisor) {
        // Direct "Book With {Advisor}" path — skip matching entirely.
        setStep(3);
        scheduleStepEl.hidden = false;
        await renderScheduling(preselectedAdvisor);
        scheduleStepEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const allAdvisors = await loadAdvisors();
      const matches = getTopAdvisorMatches(state.intake, allAdvisors, 3);

      setStep(2);
      matchesStepEl.hidden = false;
      renderMatches(matches);
      matchesStepEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // --- Payment placeholder ------------------------------------------
    confirmBookingBtn.addEventListener('click', () => {
      const fields = [
        ['Name', state.holdName],
        ['Email', state.holdEmail],
        ['Mentor', state.advisor ? state.advisor.name : ''],
        ['Time', state.slotDisplay],
        ['Hold ID', state.holdId],
        ['Sport', state.intake && state.intake.sport],
        ['Graduation Year', state.intake && state.intake.gradYear],
        ['GPA', state.intake && state.intake.gpa],
        ['Intended Major', state.intake && state.intake.major],
        ['Schools of Interest', state.intake && state.intake.schools],
        ['Wants Help With', state.intake && state.intake.helpTopic],
        ['Who Will Attend', state.intake && state.intake.attendees],
        ['Parent/Guardian Email', state.intake && state.intake.parentEmail],
      ].filter(([, value]) => value && String(value).trim());

      const subject = encodeURIComponent(`Call Request from ${state.holdName || 'an athlete'}`);
      const body = encodeURIComponent(fields.map(([label, value]) => `${label}: ${value}`).join('\n'));

      window.location.href = `mailto:strivonathletics@gmail.com?subject=${subject}&body=${body}`;
      paymentStatusEl.hidden = false;
    });
  })();
}

// Advisor application form posts into a hidden iframe so the page never
// navigates away (see advisors.html) — show a confirmation once the
// iframe reports the submission went through.
const advisorForm = document.getElementById('advisorForm');
const hiddenIframe = document.getElementById('hiddenIframe');
const advisorFormStatus = document.getElementById('advisorFormStatus');

if (advisorForm && hiddenIframe && advisorFormStatus) {
  let submitted = false;

  advisorForm.addEventListener('submit', () => {
    submitted = true;
  });

  hiddenIframe.addEventListener('load', () => {
    if (!submitted) return;
    submitted = false;
    advisorForm.reset();
    advisorFormStatus.hidden = false;
  });
}
