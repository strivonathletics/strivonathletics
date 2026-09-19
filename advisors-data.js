// Live advisor roster.
//
// Once you publish your "Approved" Google Sheet tab to the web as CSV
// (see setup steps from Claude), paste that URL below. From then on,
// approving someone is just adding a row to that sheet — the site pulls
// it automatically on every page load, no code changes needed.
//
// Until that URL is set (or if the fetch ever fails), the site falls
// back to the static ADVISORS list below, so nothing ever breaks.
const ADVISORS_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRYAvUMgSCz77zCmFurYGFggl47IQE23A716XA8bvGFqAJ9CSHkFiZuinlTI81LBeKwP7c7lQCi8qT_/pub?gid=1317008630&single=true&output=csv";

// Fallback / starter data. Expected sheet columns, in order:
// Name | School | Sport | Major | Bio | Fit | Photo (optional) | Slug (optional) | AvailabilityToken (optional)
//
// Slug powers the public profile/booking URLs (advisor.html?advisor=slug,
// book.html?advisor=slug). Leave it blank in the sheet and script.js will
// derive one from the name automatically — you never have to hand-build
// a page for a new advisor.
//
// AvailabilityToken powers the advisor's private "set your availability"
// link (advisor-availability.html?token=...). IMPORTANT: this is not
// truly private yet — it travels through the same public CSV/JS feed
// that renders the site, so it's visible to anyone who inspects network
// traffic. Real secrecy needs a backend lookup (Supabase RPC) that never
// exposes the full advisor list — see the Phase 1 notes from Claude.
const ADVISORS = [
  {
    initials: "RL",
    name: "Ryan Liu",
    school: "Harvey Mudd College",
    sport: "Soccer",
    major: "Engineering",
    photo: "",
    bio: "Recruited to play soccer at Harvey Mudd &mdash; one of the most academically selective schools with a genuinely competitive D3 program. Learned firsthand that generic, copy-paste emails don't get read, and now helps recruits write outreach that actually feels tailored to each school.",
    fit: "Best for: engineering-minded recruits targeting high-academic programs",
    slug: "ryan-liu",
    availabilityToken: "rl-8f2k9q1z"
  },
  {
    initials: "JW",
    name: "Jason Wu",
    school: "Claremont McKenna College",
    sport: "Track and Field",
    major: "Economics",
    photo: "",
    bio: "Recruited for track and field at Claremont McKenna, a highly academic liberal arts college. Learned firsthand not to rule out reach schools before even reaching out, and now helps recruits build the confidence to contact programs they might otherwise talk themselves out of.",
    fit: "Best for: recruits hesitant to reach out to highly academic reach schools",
    slug: "jason-wu",
    availabilityToken: "jw-4m7p2x9k"
  }
];
