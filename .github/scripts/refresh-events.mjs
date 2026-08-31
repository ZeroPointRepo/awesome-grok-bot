#!/usr/bin/env node
/**
 * Rebuilds EVENTS.md and the events block in README.md from each event's own registration page.
 *
 * Why this exists at all: an events table rots on a CALENDAR, not on a link. A meetup that
 * happened last week still returns HTTP 200, so `link-check` passes it clean forever and
 * `entry-health` never sees it either. The only thing that can catch it is re-reading the page's
 * own `startDate`, which is what this does.
 *
 * The list of events lives in EVENTS.md itself, one anchor per card:
 *     <!-- event: <luma-slug> -->
 * Everything else on the card is derived here and overwritten every run, so a card can never
 * drift from the page it points at.
 *
 * Rules that are not negotiable:
 *   - An event whose startDate has PASSED is DELETED, not greyed out and not left standing.
 *   - A page that could not be read is KEPT UNCHANGED and counted as unresolved. Deleting a row
 *     because a fetch failed is absence-of-evidence printed as evidence-of-absence, which is the
 *     one failure mode that makes this file dishonest rather than merely stale.
 *   - Above 25% unresolved nothing is written at all and the run exits non-zero.
 *
 * Times come from JSON-LD `startDate`, which is the only reliable source: the forum listing and
 * Luma's own summary line render in UTC and are a day out for evening events.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const EVENTS = path.join(ROOT, 'EVENTS.md');
const README = path.join(ROOT, 'README.md');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const IN_README = 8; // one-liners on the front page; the rest live in EVENTS.md
const UNRESOLVED_CEILING = 0.25;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPage(slug) {
  for (let i = 0; i < 3; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch(`https://luma.com/${slug}`, { headers: { 'User-Agent': UA }, signal: ctl.signal, redirect: 'follow' });
      clearTimeout(t);
      if (r.ok) return { html: await r.text(), url: r.url };
      if (r.status === 404 || r.status === 410) return { gone: true };
    } catch { /* retry */ }
    await sleep(1500 * (i + 1));
  }
  return null;
}

function parseEvent(html) {
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    for (const e of [].concat(j)) {
      if (e['@type'] !== 'Event' || !e.startDate) continue;
      const loc = e.location || {};
      const a = loc.address || {};
      const online = /online|virtual/i.test(loc.name || '') || /^https?:/.test(loc.name || '');
      return {
        name: String(e.name || '').trim(),
        startDate: e.startDate,
        venue: online ? '' : String(loc.name || '').trim(),
        where: [a.addressLocality, a.addressCountry].filter(Boolean).join(', '),
        online,
        hosts: [].concat(e.organizer || []).map((o) => o && o.name).filter(Boolean),
      };
    }
  }
  return null;
}

/* Capacity is a real field on the page, so it is read rather than hand-maintained. A hand-typed
   "Waitlist" label is exactly the kind of fact that goes quietly false between passes. */
function parseCapacity(html) {
  const sold = /"is_sold_out":\s*(true|false)/.exec(html);
  const left = /"spots_remaining":\s*(\d+)/.exec(html);
  const near = /"is_near_capacity":\s*(true|false)/.exec(html);
  if (!sold && !left) return null;
  if (sold && sold[1] === 'true') return 'waitlist, sold out';
  if (left && Number(left[1]) > 0 && near && near[1] === 'true') return `${left[1]} spot${left[1] === '1' ? '' : 's'} left`;
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* Local wall-clock, taken from the offset the organiser published, NOT from this machine's zone. */
function localParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  const off = /([+-]\d{2}):?(\d{2})$/.exec(iso);
  const utc = /Z$/.test(iso);
  const zone = utc ? 'UTC' : off ? `UTC${off[1].replace(/^\+0/, '+').replace(/^-0/, '-')}${off[2] === '00' ? '' : ':' + off[2]}` : '';
  return { month: MONTHS[Number(m[2]) - 1], day: String(Number(m[3])), time: `${m[4]}:${m[5]}`, zone };
}

/* ---------- read the anchors ---------- */
if (!fs.existsSync(EVENTS)) { console.error('EVENTS.md is missing; nothing to refresh'); process.exit(1); }
const src = fs.readFileSync(EVENTS, 'utf8');
const slugs = [...src.matchAll(/<!--\s*event:\s*([A-Za-z0-9_-]+)\s*-->/g)].map((m) => m[1]);
if (!slugs.length) { console.error('EVENTS.md carries no <!-- event: slug --> anchors'); process.exit(1); }
console.log(`${slugs.length} event anchor(s) in EVENTS.md`);

/* keep whatever a previous run rendered, so an unreadable page keeps its card verbatim */
const priorCards = new Map();
for (const block of src.split(/\n(?=### )/)) {
  const m = /<!--\s*event:\s*([A-Za-z0-9_-]+)\s*-->/.exec(block);
  if (m && block.startsWith('### ')) priorCards.set(m[1], block.replace(/\s+$/, ''));
}

const now = Date.now();
const live = [];
const kept = [];
const dropped = [];
let unresolved = 0;

for (const slug of slugs) {
  const page = await getPage(slug);
  if (page && page.gone) { dropped.push(`${slug}: registration page is gone (404)`); continue; }
  const ev = page && page.html ? parseEvent(page.html) : null;
  if (!ev) {
    unresolved++;
    console.log(`  UNRESOLVED ${slug}: page did not load or carried no event JSON-LD. Card kept as-is.`);
    if (priorCards.has(slug)) kept.push({ slug, card: priorCards.get(slug) });
    continue;
  }
  const when = Date.parse(ev.startDate);
  if (!Number.isFinite(when)) { unresolved++; if (priorCards.has(slug)) kept.push({ slug, card: priorCards.get(slug) }); continue; }
  if (when < now) { dropped.push(`${slug}: ${ev.name} started ${ev.startDate} and has passed`); continue; }
  ev.slug = slug;
  ev.url = `https://luma.com/${slug}`;
  ev.capacity = parseCapacity(page.html);
  ev.when = when;
  live.push(ev);
}

if (slugs.length && unresolved / slugs.length > UNRESOLVED_CEILING) {
  console.error(`${unresolved} of ${slugs.length} event pages could not be read. Refusing to write an events section built on gaps.`);
  process.exit(1);
}

live.sort((a, b) => a.when - b.when || a.name.localeCompare(b.name));
for (const d of dropped) console.log(`  DELETED ${d}`);

/* ---------- EVENTS.md ---------- */
const card = (e) => {
  const p = localParts(e.startDate);
  const utc = new Date(e.when).toISOString().slice(11, 16);
  const place = e.online ? 'Online' : (e.where || e.venue || 'Location on the registration page');
  const bits = [`**${place}**`, `${p.month} ${p.day}, ${p.time} local (${p.zone})`, `${utc} UTC`];
  if (e.venue && !e.online) bits.push(e.venue);
  if (e.capacity) bits.push(e.capacity);
  return [
    `### ${e.name}`,
    `<!-- event: ${e.slug} -->`,
    '',
    bits.join(' · '),
    '',
    `${e.hosts.length ? 'Hosted by ' + e.hosts.slice(0, 3).join(', ') + '. ' : ''}[Registration page](${e.url})`,
  ].join('\n');
};

const today = new Date().toISOString().slice(0, 10);
const out = [
  '# Grok Bot events: every upcoming meetup, workshop and hackathon',
  '',
  `**${live.length} upcoming**, soonest first. Rebuilt from each registration page on ${today}.`,
  'The front page of [README.md](README.md) carries the next few as one-liners; this file is the whole set.',
  '',
  'Times are the organiser\'s own local time with the UTC equivalent beside it, both read from the',
  'registration page. Events that have already started are removed from this file rather than kept',
  'and greyed out.',
  '',
  '---',
  '',
  ...live.map(card).flatMap((c) => [c, '']),
  ...(kept.length ? ['---', '', '<sub>Cards that could not be re-read this run are left exactly as they were, never deleted.</sub>', ''] : []),
  ...kept.map((k) => k.card).flatMap((c) => [c, '']),
  '---',
  '',
  'Sources: the [Cursor Community calendar](https://luma.com/cursorcommunity) and the',
  '[community forum events categories](https://forum.cursor.com/c/events/).',
  '',
  '<sub>Unofficial, community-maintained. Not affiliated with or endorsed by xAI/SpaceXAI or Cursor.</sub>',
].join('\n');
fs.writeFileSync(EVENTS, out.replace(/\n{3,}/g, '\n\n') + '\n');

/* ---------- the README one-liners ---------- */
/* square brackets in an event name break a markdown link label, so the label is sanitised */
const label = (s) => s.replace(/\s*\[([^\]]*)\]\s*/g, ' ($1) ').replace(/\s+/g, ' ').trim();
const line = (e) => {
  const p = localParts(e.startDate);
  const place = e.online ? 'Online' : (e.where || e.venue || 'Venue on the registration page');
  const tail = e.capacity ? ` *(${e.capacity})*` : '';
  return `- **${p.month} ${p.day}** · ${place} — [${label(e.name)}](${e.url})${tail}`;
};
const head = live.slice(0, IN_README);
const block = [
  `Next ${head.length}, soonest first. All ${live.length} upcoming, with hosts, venues and times, are in **[EVENTS.md](EVENTS.md)**.`,
  '',
  ...head.map(line),
].join('\n');

if (fs.existsSync(README)) {
  let r = fs.readFileSync(README, 'utf8');
  const re = /(<!-- events:start -->\n)[\s\S]*?(<!-- events:end -->)/;
  if (!re.test(r)) console.log('  WARN: events markers missing from README, block not refreshed');
  else { fs.writeFileSync(README, r.replace(re, `$1${block}\n$2`)); }
}

console.log(`\nWrote EVENTS.md: ${live.length} upcoming, ${dropped.length} deleted, ${unresolved} unresolved.`);
