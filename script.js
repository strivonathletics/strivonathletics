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

// Render advisor cards from the shared/live data so the Home page's
// Featured Advisors and the full Advisors page never drift apart. A grid
// with a data-limit (the homepage teaser) is a lower-commitment context,
// so its cards point to the full roster; the full Advisors page links
// straight to the request form since the visitor has already chosen.
document.querySelectorAll('[data-advisor-grid]').forEach(async grid => {
  const all = await loadAdvisors();
  const isTeaser = grid.hasAttribute('data-limit');
  const limit = isTeaser ? parseInt(grid.dataset.limit, 10) : all.length;
  const list = all.slice(0, limit);

  if (!list.length) {
    grid.innerHTML = `<div class="placeholder-box">Advisor profiles are on the way &mdash; check back soon.</div>`;
    return;
  }

  grid.innerHTML = list.map(a => {
    const tags = [a.sport, a.major, 'Selective D3'].filter(Boolean);
    const photo = a.photo
      ? `<img class="advisor-photo" src="${a.photo}" alt="${a.name}">`
      : `<div class="advisor-photo advisor-photo-initials">${a.initials}</div>`;
    const cta = `<a class="advisor-cta" href="advisor.html?advisor=${encodeURIComponent(a.slug)}">View Advisor &rarr;</a>`;

    return `
    <div class="advisor-card">
      <div class="advisor-card-top">
        ${photo}
        <div>
          <div class="advisor-name">${a.name}</div>
          <div class="advisor-college">${a.school}</div>
        </div>
      </div>
      ${tags.length ? `<div class="advisor-tags">${tags.map(t => `<span class="advisor-tag">${t}</span>`).join('')}</div>` : ''}
      <p class="advisor-bio">${a.bio}</p>
      ${cta}
    </div>
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
      const tags = [a.sport, a.major, 'Selective D3'].filter(Boolean);
      const fitText = (a.fit || '').replace(/^Best for:\s*/i, '');

      profile.innerHTML = `
        <div class="advisor-name">${a.name}</div>
        <div class="advisor-college">${[a.school, a.sport].filter(Boolean).join(' &middot; ')}</div>
        ${a.major ? `<div class="coverflow-major">${a.major}</div>` : ''}
        ${tags.length ? `<div class="advisor-tags">${tags.map(t => `<span class="advisor-tag">${t}</span>`).join('')}</div>` : ''}
        <p class="advisor-bio">${a.bio}</p>
        ${fitText ? `<p class="coverflow-fit"><span class="coverflow-fit-label">Best for:</span> ${fitText}</p>` : ''}
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
        <p class="lead">We couldn't find that advisor.</p>
        <a class="advisor-cta" href="advisors.html">&larr; Back to all advisors</a>
      `;
      return;
    }

    document.title = `${a.name} | Strivon Athletics`;

    const tags = [a.sport, a.major, 'Selective D3'].filter(Boolean);
    const fitText = (a.fit || '').replace(/^Best for:\s*/i, '');
    const photo = a.photo
      ? `<img class="advisor-photo advisor-photo-lg" src="${a.photo}" alt="${a.name}">`
      : `<div class="advisor-photo advisor-photo-lg advisor-photo-initials">${a.initials}</div>`;

    advisorProfileEl.innerHTML = `
      <div class="advisor-profile-header">
        ${photo}
        <div>
          <div class="advisor-name advisor-profile-name">${a.name}</div>
          <div class="advisor-college">${[a.school, a.sport].filter(Boolean).join(' &middot; ')}</div>
          ${a.major ? `<div class="coverflow-major">${a.major}</div>` : ''}
        </div>
      </div>
      ${tags.length ? `<div class="advisor-tags advisor-profile-tags">${tags.map(t => `<span class="advisor-tag">${t}</span>`).join('')}</div>` : ''}
      <p class="advisor-bio advisor-profile-bio">${a.bio}</p>
      ${fitText ? `<p class="coverflow-fit"><span class="coverflow-fit-label">Best for:</span> ${fitText}</p>` : ''}
      <div class="advisor-profile-actions">
        <a href="book.html?advisor=${encodeURIComponent(a.slug)}" class="btn-pill btn-pill-dark">
          <span>Book With ${a.name.split(' ')[0]}</span>
          <span class="arrow-circle">&rarr;</span>
        </a>
        <a href="advisors.html" class="advisor-cta">&larr; Back to all advisors</a>
      </div>
    `;
  })();
}

// Booking page (book.html?advisor=slug) — same slug-driven template
// pattern as the profile page. Directory info (name/school/photo)
// still comes from getAdvisorBySlug() (the Google Sheet pipeline);
// slot data and the booking hold are real, from Supabase. Picking a
// slot creates an actual 10-minute hold via create_booking_hold — the
// database's unique index is what prevents two athletes from taking
// the same time, not this client code. Real payment isn't wired up
// yet (Phase 3), so after a hold succeeds we still route into the
// existing working intake form (mailto), prefilled, with the hold id
// included so Strivon can match it to the real row.
const bookingPageEl = document.querySelector('[data-booking-page]');

if (bookingPageEl) {
  (async () => {
    const slug = new URLSearchParams(window.location.search).get('advisor');
    const a = await getAdvisorBySlug(slug);

    if (!a) {
      bookingPageEl.innerHTML = `
        <p class="lead">We couldn't find that advisor.</p>
        <a class="advisor-cta" href="advisors.html">&larr; Back to all advisors</a>
      `;
      return;
    }

    document.title = `Book With ${a.name} | Strivon Athletics`;

    const dateFmt = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // Look forward 14 days from today — not any specific weekday. Which
    // days actually show up is entirely driven by what the advisor
    // saved in advisor-availability.html; a day with no saved block
    // just never appears, whatever day of the week it is.
    const rangeStart = new Date();
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + 13);

    const photo = a.photo
      ? `<img class="advisor-photo" src="${a.photo}" alt="${a.name}">`
      : `<div class="advisor-photo advisor-photo-initials">${a.initials}</div>`;

    bookingPageEl.innerHTML = `
      <div class="booking-advisor-head">
        ${photo}
        <div>
          <div class="advisor-name">${a.name}</div>
          <div class="advisor-college">${[a.school, a.sport].filter(Boolean).join(' &middot; ')}</div>
        </div>
      </div>

      <div class="session-card">
        <div class="session-title">30-Minute Recruiting Strategy Call</div>
        <div class="session-price">$30</div>
      </div>

      <p class="card-hint booking-slots-note" data-slots-note>Loading available times&hellip;</p>

      <div class="slot-days" data-slot-days></div>

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
            <span>Hold This Time &amp; Continue</span>
            <span class="arrow-circle">&rarr;</span>
          </button>
          <p class="form-status" data-confirm-error hidden></p>
        </form>
      </div>
    `;

    const slotDaysEl = bookingPageEl.querySelector('[data-slot-days]');
    const slotsNoteEl = bookingPageEl.querySelector('[data-slots-note]');
    const selectedBox = bookingPageEl.querySelector('[data-slot-selected]');
    const selectedWhen = bookingPageEl.querySelector('[data-slot-selected-when]');
    const confirmForm = bookingPageEl.querySelector('[data-slot-confirm-form]');
    const confirmError = bookingPageEl.querySelector('[data-confirm-error]');

    let currentSlotIso = null;

    async function renderSlots() {
      selectedBox.hidden = true;
      confirmError.hidden = true;
      currentSlotIso = null;

      if (!sb) {
        slotsNoteEl.textContent = 'Live scheduling isn’t connected on this page yet.';
        slotDaysEl.innerHTML = '';
        return;
      }

      const openIsoTimes = await getOpenSlots(slug, rangeStart, rangeEnd);

      if (!openIsoTimes.length) {
        slotsNoteEl.textContent = `${a.name.split(' ')[0]} doesn't have any open times in the next two weeks.`;
        slotDaysEl.innerHTML = '';
        return;
      }

      slotsNoteEl.textContent = 'Choose a time.';

      // Group by calendar date, preserving chronological order — no
      // assumption about which weekdays show up, only that whatever
      // Supabase returns is grouped and displayed in the order it falls.
      const byDate = new Map();
      openIsoTimes.forEach(iso => {
        const key = slotDateStr(iso);
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key).push(iso);
      });

      const days = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, slots]) => ({
          date: new Date(`${dateKey}T00:00:00`),
          slots,
        }));

      slotDaysEl.innerHTML = days.map(day => `
        <div class="slot-day">
          <p class="slot-day-label">${dateFmt(day.date)}</p>
          <div class="slot-times">${day.slots.map(iso => `<button type="button" class="slot-btn" data-iso="${iso}">${formatSlotLabel(iso)}</button>`).join('')}</div>
        </div>
      `).join('');

      slotDaysEl.querySelectorAll('.slot-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          slotDaysEl.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('is-selected'));
          btn.classList.add('is-selected');

          currentSlotIso = btn.dataset.iso;
          selectedWhen.textContent = `${dateFmt(new Date(`${slotDateStr(currentSlotIso)}T00:00:00`))} · ${formatSlotLabel(currentSlotIso)}`;
          selectedBox.hidden = false;
          confirmError.hidden = true;
          selectedBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      });
    }

    confirmForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentSlotIso) return;

      const data = new FormData(confirmForm);
      const name = data.get('name');
      const email = data.get('email');

      const result = await createBookingHold(slug, currentSlotIso, name, email);

      if (result.error) {
        confirmError.textContent = result.error;
        confirmError.hidden = false;
        await renderSlots(); // the slot may have just been taken — refresh the list
        return;
      }

      const params = new URLSearchParams({
        advisor: a.name,
        slot: `${dateFmt(new Date(`${slotDateStr(currentSlotIso)}T00:00:00`))} at ${formatSlotLabel(currentSlotIso)}`,
        holdId: result.bookingId,
      });
      window.location.href = `book-a-call.html?${params.toString()}#bookingForm`;
    });

    await renderSlots();
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

// Book a Call — temporary intake form (mailto) while the real
// scheduling/payment steps on that page aren't wired up yet.
const bookingForm = document.getElementById('bookingForm');

if (bookingForm) {
  // Arrived from an advisor's booking page with a chosen slot? Prefill
  // so nothing has to be retyped (mirrors the ?advisor= prefill on the
  // contact form above).
  const bookingParams = new URLSearchParams(window.location.search);
  const requestedAdvisor = bookingParams.get('advisor');
  const requestedSlot = bookingParams.get('slot');
  const holdId = bookingParams.get('holdId');

  if (requestedSlot) {
    const availabilityField = bookingForm.querySelector('[name="availability"]');
    if (availabilityField) availabilityField.value = requestedSlot;
  }
  if (requestedAdvisor) {
    const notesField = bookingForm.querySelector('[name="notes"]');
    if (notesField) {
      const holdLine = holdId ? ` (hold id: ${holdId})` : '';
      notesField.value = `Requested advisor: ${requestedAdvisor}${holdLine}\n\n`;
    }
  }

  bookingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(bookingForm);
    const name = data.get('name');

    const fields = [
      ['Name', name],
      ['Email', data.get('email')],
      ['Sport', data.get('sport')],
      ['Current School', data.get('school')],
      ['Graduation Year', data.get('gradYear')],
      ['GPA', data.get('gpa')],
      ['Preferred Days/Times', data.get('availability')],
      ['Notes', data.get('notes')],
    ].filter(([, value]) => value && value.trim());

    const subject = encodeURIComponent(`Call Request from ${name}`);
    const body = encodeURIComponent(fields.map(([label, value]) => `${label}: ${value}`).join('\n'));

    window.location.href = `mailto:strivonathletics@gmail.com?subject=${subject}&body=${body}`;

    const status = document.getElementById('bookingFormStatus');
    if (status) status.hidden = false;
  });
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
