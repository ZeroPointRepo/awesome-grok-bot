#!/usr/bin/env node
/**
 * Link checker for a curated list.
 *
 * A link check that reports every >=400 as broken is wrong on this kind of page, because a large
 * share of the links point at sites that answer a datacenter IP with a wall rather than with the
 * page. Those are not dead links and filing them as broken trains a maintainer to ignore the alarm.
 * The opposite fix, treating 401/403/429 as fine, is worse: it silently passes real breakage.
 *
 * So every link ends in exactly one of four buckets, and the counts are printed every run:
 *
 *   alive       answered under 400
 *   confirmed   answered with a bot wall, and a first-party registry API for that same resource
 *               says it exists. Upgraded, with the API that said so recorded on the row
 *   challenged  answered with a bot wall and nothing authoritative could confirm it. NOT broken,
 *               NOT passed, reported in its own bucket, and never put in the issue as breakage
 *   broken      answered >=400 with no wall signature, or did not answer at all after a retry
 *
 * The wall test is a SIGNATURE, not a list of hosts. A host allowlist has to be edited every time
 * the web changes and it silently mis-handles every host nobody thought of; the signature covers
 * hosts nobody has hit yet. Adding a domain here is almost always the wrong fix.
 *
 * Usage: node check-links.mjs [file ...]     (defaults to README.md)
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const FILES = process.argv.slice(2).length ? process.argv.slice(2) : ['README.md'];
const UA = process.env.LINK_CHECK_UA || 'Mozilla/5.0 (compatible; awesome-list-link-check/1.0)';
const TIMEOUT = Number(process.env.LINK_CHECK_TIMEOUT_MS || 20000);
const CONCURRENCY = Number(process.env.LINK_CHECK_CONCURRENCY || 6);
const GH = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

// ---------------------------------------------------------------- the wall signature

// Interstitial and challenge pages announce themselves in the body. These are the strings the
// common providers ship, matched case-insensitively against the first few KB.
const BODY_MARKERS = [
  /just a moment/i,                       // Cloudflare
  /checking your browser/i,               // Cloudflare, older
  /cf-browser-verification|__cf_chl|challenge-platform/i,
  /attention required[\s\S]{0,40}cloudflare/i,
  /enable javascript and cookies to continue/i,
  /request unsuccessful[\s\S]{0,40}incapsula/i,  // Imperva
  /pardon our interruption/i,             // Distil
  /reference #\d+\.[\da-f]+\.\d+/i,       // Akamai error reference
  /are you a (human|robot)/i,
  /(recaptcha|hcaptcha|turnstile)/i,
  /access denied[\s\S]{0,60}(ray id|request id)/i,
];

// A status that is a throttle or a bot code rather than a statement about the resource.
const THROTTLE_STATUS = new Set([403, 429, 503]);

function wallSignature(status, headers, body) {
  // 1. Cloudflare says so itself.
  const mitigated = headers.get('cf-mitigated');
  if (mitigated && /challenge/i.test(mitigated)) return 'cf-mitigated: challenge';

  // 2. A non-HTTP status code. LinkedIn's 999 is the well-known one; anything up here is a bot code.
  if (status >= 900) return `non-standard status ${status}, a bot code rather than an HTTP status`;

  // 3. Rate limited. RFC 9110: this is explicitly temporary.
  if (status === 429) return '429, rate limited rather than missing';

  if (!THROTTLE_STATUS.has(status)) return null;

  // 4. A throttle status carrying Retry-After means the server called the condition temporary.
  //    This is what Reddit does to every datacenter IP: a 403 with retry-after and a full page body.
  if (headers.has('retry-after')) return `${status} with a Retry-After header, a temporary refusal`;

  // 5. A throttle status from a challenge provider, with a challenge page in the body.
  const marker = BODY_MARKERS.find((re) => re.test(body));
  if (marker) return `${status} serving an interstitial challenge page`;

  // 6. A throttle status from Cloudflare with no useful body at all: the edge answered, the origin
  //    was never asked. Still not a statement about the resource.
  const cf = /cloudflare/i.test(headers.get('server') || '') || headers.has('cf-ray');
  if (cf && body.trim().length < 512) return `${status} from a Cloudflare edge with no page body`;

  return null;
}

// ---------------------------------------------------------------- authoritative side-checks
//
// Each entry maps a human-facing URL to a first-party API that answers the same question without a
// wall in front of it. Only add one when the API is run by the same people as the page, so a 200
// from it is authoritative about that exact resource and not a guess. Everything else stays
// `challenged`, which is an honest answer.

const SIDE_CHECKS = [
  {
    name: 'npm registry',
    match: /^https?:\/\/(?:www\.)?npmjs\.com\/package\/(.+?)\/?$/i,
    async check(m) {
      const pkg = decodeURIComponent(m[1]);
      const r = await get(`https://registry.npmjs.org/${pkg.replace('/', '%2f')}`);
      return r && r.status === 200 ? `npm registry has ${pkg}` : null;
    },
  },
  {
    name: 'npm registry (scope)',
    match: /^https?:\/\/(?:www\.)?npmjs\.com\/org\/([^/?#]+)\/?$/i,
    async check(m) {
      const org = decodeURIComponent(m[1]);
      const j = await getJson(`https://registry.npmjs.org/-/v1/search?text=@${encodeURIComponent(org)}&size=20`);
      if (!j) return null;
      const hits = (j.objects || []).map((o) => o.package?.name || '').filter((n) => n.startsWith(`@${org}/`));
      return hits.length ? `npm registry publishes ${hits.length} packages under @${org}, including ${hits[0]}` : null;
    },
  },
  {
    name: 'PyPI',
    match: /^https?:\/\/pypi\.org\/project\/([^/?#]+)\/?$/i,
    async check(m) {
      const r = await get(`https://pypi.org/pypi/${encodeURIComponent(m[1])}/json`);
      return r && r.status === 200 ? `PyPI has ${m[1]}` : null;
    },
  },
  {
    name: 'crates.io',
    match: /^https?:\/\/crates\.io\/crates\/([^/?#]+)\/?$/i,
    async check(m) {
      const r = await get(`https://crates.io/api/v1/crates/${encodeURIComponent(m[1])}`);
      return r && r.status === 200 ? `crates.io has ${m[1]}` : null;
    },
  },
  {
    name: 'GitHub API',
    match: /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+?)(?:\.git)?\/?$/i,
    async check(m) {
      if (['orgs', 'sponsors', 'topics', 'features', 'settings'].includes(m[1].toLowerCase())) return null;
      const r = await get(`https://api.github.com/repos/${m[1]}/${m[2]}`, GH ? { Authorization: `Bearer ${GH}` } : {});
      return r && r.status === 200 ? `GitHub API resolves ${m[1]}/${m[2]}` : null;
    },
  },
];

// ---------------------------------------------------------------- plumbing

async function get(url, extraHeaders = {}) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: '*/*', ...extraHeaders },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const body = await r.text().then((t) => t.slice(0, 8192)).catch(() => '');
    return { status: r.status, headers: r.headers, body };
  } catch {
    return null;
  }
}

// The body `get` returns is capped, because it only exists to be pattern-matched for a challenge
// page. An API response has to be read whole or it will not parse, and a truncated parse fails
// silently as "no proof", which would quietly turn a confirmable link back into a challenged one.
async function getJson(url, extraHeaders = {}) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'application/json', ...extraHeaders },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function extractLinks(files) {
  const out = new Set();
  for (const f of files) {
    if (!existsSync(f)) continue;
    const src = readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, ''); // fenced blocks are commands, not links
    for (const m of src.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) out.add(m[1].replace(/[.,;]+$/, ''));
    for (const m of src.matchAll(/<(?:a[^>]+href|img[^>]+src)\s*=\s*"(https?:\/\/[^"]+)"/gi)) out.add(m[1]);
  }
  // shields.io endpoints point at our own raw files and are rebuilt by another workflow
  return [...out].filter((u) => !/^https?:\/\/img\.shields\.io\//.test(u));
}

async function classify(url) {
  let r = await get(url);
  if (!r) { r = await get(url); }                     // one retry: a single timeout is weather
  if (!r) return { url, bucket: 'broken', detail: 'no response after a retry' };
  if (r.status < 400) return { url, bucket: 'alive', detail: String(r.status) };

  const sig = wallSignature(r.status, r.headers, r.body);
  if (!sig) return { url, bucket: 'broken', detail: String(r.status) };

  for (const sc of SIDE_CHECKS) {
    const m = url.match(sc.match);
    if (!m) continue;
    const proof = await sc.check(m).catch(() => null);
    if (proof) return { url, bucket: 'confirmed', detail: `${r.status} (${sig}), but ${proof}`, via: sc.name };
    break;
  }
  return { url, bucket: 'challenged', detail: `${r.status} (${sig})` };
}

const links = extractLinks(FILES);
console.log(`Checking ${links.length} links from ${FILES.join(', ')}`);
const results = [];
const queue = [...links];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) results.push(await classify(queue.shift()));
}));

const by = (b) => results.filter((r) => r.bucket === b).sort((a, b2) => a.url.localeCompare(b2.url));
const alive = by('alive'), confirmed = by('confirmed'), challenged = by('challenged'), broken = by('broken');

const lines = [
  `Links checked: ${results.length}`,
  `  alive: ${alive.length}`,
  `  confirmed alive by a registry API after a bot challenge: ${confirmed.length}`,
  `  challenged, not established: ${challenged.length}`,
  `  broken: ${broken.length}`,
];
for (const r of confirmed) lines.push(`  confirmed  ${r.url} -> ${r.detail}`);
for (const r of challenged) lines.push(`  challenged ${r.url} -> ${r.detail}`);
for (const r of broken) lines.push(`  broken     ${r.url} -> ${r.detail}`);
console.log(lines.join('\n'));

writeFileSync('broken.txt', broken.map((r) => `${r.url} -> ${r.detail}`).join('\n') + (broken.length ? '\n' : ''));
writeFileSync('challenged.txt', [...confirmed, ...challenged].map((r) => `${r.bucket === 'confirmed' ? '[confirmed] ' : '[challenged] '}${r.url} -> ${r.detail}`).join('\n') + (confirmed.length + challenged.length ? '\n' : ''));
writeFileSync('link-report.json', JSON.stringify({
  checked: results.length,
  counts: { alive: alive.length, confirmed: confirmed.length, challenged: challenged.length, broken: broken.length },
  confirmed, challenged, broken,
}, null, 2) + '\n');

// The buckets are visible on the run page whether or not anything is broken. A third state that
// only shows up when something else fails is a third state nobody ever reads.
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    '### Link check',
    '',
    '| Bucket | Count |',
    '|---|---:|',
    `| Alive | ${alive.length} |`,
    `| Confirmed alive by a registry API after a bot challenge | ${confirmed.length} |`,
    `| Challenged, not established | ${challenged.length} |`,
    `| Broken | ${broken.length} |`,
    '',
    confirmed.length ? '**Confirmed after a challenge**\n\n' + confirmed.map((r) => `- \`${r.url}\` ${r.detail}`).join('\n') + '\n' : '',
    challenged.length ? '**Challenged, not established.** The host answered a datacenter IP with a wall. Not counted as broken, and not passed either.\n\n' + challenged.map((r) => `- \`${r.url}\` ${r.detail}`).join('\n') + '\n' : '',
    broken.length ? '**Broken**\n\n' + broken.map((r) => `- \`${r.url}\` ${r.detail}`).join('\n') + '\n' : '',
  ].join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `broken=${broken.length}\nchallenged=${challenged.length}\nconfirmed=${confirmed.length}\n`);
}
