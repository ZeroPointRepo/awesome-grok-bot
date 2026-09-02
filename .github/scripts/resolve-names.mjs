#!/usr/bin/env node
// Canonical-name re-resolution. Rewrites entries whose repository was renamed or transferred.
//
// THIS IS A SECURITY CHECK, NOT HYGIENE. When a GitHub repository is renamed or moved to a new
// owner, the old path keeps working by redirect — until somebody else claims the vacated name.
// From that moment the redirect stops and every link we publish points at whoever took it. A
// stale slug in a curated list is a hijack surface with a countdown on it, and nothing about it
// looks broken in the meantime: the link returns 200 the whole time.
//
// KEYED BY IMMUTABLE ID, and that is the entire point. Resolving `GET /repos/{owner}/{repo}`
// follows the redirect, so once a squatter holds the old name that call returns the SQUATTER'S
// repository and reports the stale slug as canonical — the check confirms the very thing it
// exists to catch. `GET /repositories/{id}` cannot be answered by anyone but the original
// repository, so it is the only lookup that stays correct after the name is reclaimed. Every
// slug this run resolves is recorded id-first in .github/data/repo-ids.json; from the second run
// onward the id is what gets asked.
//
// THIRD STATE. A slug that cannot be read is "not established": never rewritten, never counted
// as clean, always listed. Above a 5% failure rate the run rewrites nothing at all, because a
// rate-limited walk that silently reports no renames is indistinguishable from a healthy one.
//
// WHAT IT REWRITES, and what it deliberately does not:
//   * every `owner/repo` occurrence in the target files: the link, the raw URL, the install
//     command, the CSV and JSON columns.
//   * link text, only when the link text is exactly the old repository name. A curated headline
//     is prose and stays untouched.
//   * NOT an npm/PyPI package name that happens to look like a slug. `@liustack/modlens` is a
//     package, not a GitHub path, and a GitHub rename does not move a package: dsh-genui's npm
//     scope moved from @omdsh-dev to @changfenhuang independently of any repo rename. Anything
//     preceded by `@` is left alone.
//
// Usage: GH_TOKEN=... node resolve-names.mjs <file> [file...]
// Exit 0 on a clean or successfully-rewritten run, 1 when the run could not establish enough to
// be trusted. Advisory about findings, never about its own reliability.

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry-run');
if (!files.length) {
  console.error('usage: resolve-names.mjs [--dry-run] <file> [file...]');
  process.exit(2);
}

const LEDGER = '.github/data/repo-ids.json';
const FAIL_CEILING = 0.05;

// GitHub paths that are not repositories.
const RESERVED = new Set([
  'orgs', 'sponsors', 'features', 'settings', 'marketplace', 'apps', 'topics',
  'search', 'about', 'pricing', 'login', 'join', 'notifications', 'explore',
  'collections', 'events', 'readme', 'security', 'enterprise', 'customer-stories',
  'trending', 'codespaces', 'issues', 'pulls', 'dashboard', 'new', 'account',
]);
// Documentation placeholders. CONTRIBUTING.md shows the entry shape with github.com/owner/repo,
// which 404s and would be reported as rot every week until the report is ignored.
const PLACEHOLDER_OWNER = new Set([
  'owner', 'user', 'username', 'your-username', 'yourusername', 'yourname',
  'org', 'your-org', 'your-organization', 'example', 'example-org', 'author',
]);
const PLACEHOLDER_REPO = new Set([
  'repo', 'repository', 'your-repo', 'your-repository', 'project', 'your-project',
  'example', 'example-repo', 'repo-name', 'skill-name', 'plugin-name',
]);
const isPlaceholder = (owner, repo) =>
  PLACEHOLDER_OWNER.has(owner.toLowerCase()) || PLACEHOLDER_REPO.has(repo.toLowerCase()) ||
  /[<>{}]/.test(owner + repo);

const headers = {
  'User-Agent': 'canonical-name-resolution',
  Accept: 'application/vnd.github+json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Distinguishable failures. "unreadable" covering four causes is how three consecutive fixes
   land on the wrong target; every failure records WHY. */
async function api(url) {
  for (let i = 0; i < 4; i++) {
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (e) {
      if (i === 3) return { why: `network: ${String(e.message).slice(0, 60)}` };
      await sleep(1000 * (i + 1));
      continue;
    }
    if (res.status === 404) return { gone: true };
    if (res.status === 403 || res.status === 429) {
      const ra = Number(res.headers.get('retry-after'));
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      const remaining = Number(res.headers.get('x-ratelimit-remaining'));
      const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000
        : (remaining === 0 && Number.isFinite(reset) ? Math.max(0, reset * 1000 - Date.now()) : 4000 * (i + 1));
      if (i === 3) return { why: `HTTP ${res.status} (rate limited)` };
      await sleep(Math.min(waitMs + 1000, 60000));
      continue;
    }
    if (!res.ok) return { why: `HTTP ${res.status}` };
    try {
      return { json: await res.json() };
    } catch {
      return { why: 'unparseable response' };
    }
  }
  return { why: 'retries exhausted' };
}

// ---------------------------------------------------------------- collect every linked slug
const contents = new Map();
for (const file of files) {
  try {
    contents.set(file, readFileSync(file, 'utf8'));
  } catch {
    console.log(`(skipping unreadable file: ${file})`);
  }
}
if (!contents.size) {
  console.error('No readable input files. Refusing to report a clean run.');
  process.exit(1);
}

const slugs = new Map(); // slug -> Set(file)
for (const [file, text] of contents) {
  for (const u of text.match(/https?:\/\/github\.com\/[^\s)<>"'\]]+/g) || []) {
    const m = u.replace(/[.,;:!?`*_)\]}>'"]+$/, '').match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (!m) continue;
    const owner = m[1];
    const repo = m[2].replace(/\.git$/i, '');
    if (!owner || !repo || RESERVED.has(owner.toLowerCase()) || isPlaceholder(owner, repo)) continue;
    const slug = `${owner}/${repo}`;
    if (!slugs.has(slug)) slugs.set(slug, new Set());
    slugs.get(slug).add(file);
  }
}

const all = [...slugs.keys()].sort();
console.log(`Re-resolving ${all.length} linked repositories against their canonical full_name.`);

// ---------------------------------------------------------------- the id ledger
let ledger = { _note: '', ids: {} };
if (existsSync(LEDGER)) {
  try {
    const parsed = JSON.parse(readFileSync(LEDGER, 'utf8'));
    if (parsed && parsed.ids) ledger = parsed;
  } catch {
    console.error(`${LEDGER} exists but did not parse. Refusing to overwrite it or to run slug-keyed instead.`);
    process.exit(1);
  }
}
ledger._note =
  'GitHub numeric repository id for every entry this list links to, recorded the first time the ' +
  'entry resolves. The id is immutable and survives a rename or a transfer; the slug does not, ' +
  'and once a vacated slug is claimed by somebody else, a slug-keyed lookup returns the new ' +
  'owner and reports the stale link as correct. Written by .github/scripts/resolve-names.mjs, ' +
  'never edited by hand.';

// ---------------------------------------------------------------- resolve
const renames = [];   // { was, now, id, files }
const gone = [];      // slug 404 - reported, never rewritten
const notEstablished = []; // { slug, why }
let byId = 0, bySlug = 0;
let q = 0;

async function worker() {
  while (q < all.length) {
    const slug = all[q++];
    const known = ledger.ids[slug.toLowerCase()];
    // Immutable-id lookup wherever we have one. This is the leg a squatter cannot answer.
    let r = null;
    if (known && Number.isInteger(known.id)) {
      r = await api(`https://api.github.com/repositories/${known.id}`);
      byId++;
      // A 404 on an id means the repository itself is gone, not that the name moved.
      if (r.gone) { gone.push({ slug, why: 'repository id no longer resolves' }); continue; }
    } else {
      r = await api(`https://api.github.com/repos/${slug}`);
      bySlug++;
      if (r.gone) { gone.push({ slug, why: '404 on first resolution' }); continue; }
    }
    if (!r.json) { notEstablished.push({ slug, why: r.why || 'unknown' }); continue; }
    const canonical = r.json.full_name;
    const id = r.json.id;
    if (!canonical || !Number.isInteger(id)) { notEstablished.push({ slug, why: 'response carried no full_name/id' }); continue; }
    ledger.ids[canonical.toLowerCase()] = { id, full_name: canonical };
    if (canonical.toLowerCase() !== slug.toLowerCase()) {
      renames.push({ was: slug, now: canonical, id, files: [...slugs.get(slug)] });
    } else {
      ledger.ids[slug.toLowerCase()] = { id, full_name: canonical };
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const checked = all.length;
const failed = notEstablished.length;
const rate = checked ? failed / checked : 0;
console.log(`  ${byId} resolved by immutable id, ${bySlug} by slug (first sighting), ${failed} not established.`);

// ---------------------------------------------------------------- rewrite
// A slug occurs in two shapes and they need different guards.
//   1. inside a GitHub URL, where the character in front is always the `/` after the host.
//   2. bare, in an install command or a data column (`github:owner/repo#v1`, `owner/repo` in a
//      CSV cell). Here the `/` in front must NOT be allowed, or `x/a/b` would match the slug
//      `a/b` sitting in the middle of a longer path.
// Neither shape is rewritten when preceded by `@`: that is a package scope, and a GitHub rename
// does not move a package. dsh-genui's npm scope moved from @omdsh-dev to @changfenhuang on its
// own schedule, and rewriting one from the other would have published a package that does not
// exist.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const urlRe = (slug) => {
  const [o, r] = slug.split('/');
  return new RegExp(`(github\\.com|githubusercontent\\.com)/${esc(o)}/${esc(r)}(?![\\w-])`, 'g');
};
const bareRe = (slug) => {
  const [o, r] = slug.split('/');
  return new RegExp(`(?<![\\w.@/-])${esc(o)}/${esc(r)}(?![\\w-])`, 'g');
};

const perFile = new Map();
if (rate > FAIL_CEILING) {
  console.error(
    `${failed} of ${checked} repositories (${(rate * 100).toFixed(1)}%) could not be established, over the ${FAIL_CEILING * 100}% ceiling.\n` +
    'Rewriting nothing: a rate-limited walk that reports no renames looks exactly like a clean one.'
  );
} else if (renames.length && !DRY) {
  for (const f of renames) {
    const [, oldName] = f.was.split('/');
    const [, newName] = f.now.split('/');
    for (const file of f.files) {
      let text = perFile.get(file) ?? contents.get(file);
      const before = text;
      text = text.replace(urlRe(f.was), `$1/${f.now}`);
      text = text.replace(bareRe(f.was), f.now);
      // Link text, only when it is exactly the old repository name. A curated headline is prose.
      if (oldName !== newName) {
        text = text.replace(new RegExp(`\\[${esc(oldName)}\\]\\((https?://github\\.com/${esc(f.now)}[^)]*)\\)`, 'g'), `[${newName}]($1)`);
      }
      if (text !== before) { perFile.set(file, text); f.applied = true; }
    }
  }
  for (const [file, text] of perFile) writeFileSync(file, text);
}

// ---------------------------------------------------------------- report
const lines = [];
lines.push(`Re-resolved **${checked}** linked repositories against their canonical \`full_name\`.`);
lines.push('');
lines.push(`${byId} by immutable repository id, ${bySlug} by slug on first sighting.`);
lines.push('');
if (renames.length) {
  lines.push(`### Renamed or transferred - ${renames.length}`);
  lines.push('');
  lines.push('The old path still redirects, so nothing looks broken. It stops redirecting the moment somebody claims the vacated name, and the link then points at them.');
  lines.push('');
  for (const f of renames) lines.push(`- \`${f.was}\` is now \`${f.now}\` (id ${f.id}) - ${f.applied ? 'rewritten' : 'NOT rewritten'} in ${f.files.join(', ')}`);
  lines.push('');
} else {
  lines.push('**No renamed or transferred entries.**');
  lines.push('');
}
if (gone.length) {
  lines.push(`### Gone - ${gone.length}`);
  lines.push('');
  lines.push('Deleted or made private. Never rewritten automatically; there is nothing to rewrite to.');
  lines.push('');
  for (const g of gone) lines.push(`- \`${g.slug}\`: ${g.why}`);
  lines.push('');
}
if (notEstablished.length) {
  lines.push(`### Not established - ${notEstablished.length}`);
  lines.push('');
  lines.push('Counted apart from both buckets. A repository that could not be read is not a repository that is fine.');
  lines.push('');
  for (const n of notEstablished.slice(0, 25)) lines.push(`- \`${n.slug}\`: ${n.why}`);
  if (notEstablished.length > 25) lines.push(`- ...and ${notEstablished.length - 25} more`);
  lines.push('');
}

const report = lines.join('\n');
writeFileSync('canonical-names-report.md', report + '\n');
console.log('\n' + report);

if (rate <= FAIL_CEILING && !DRY) {
  ledger.ids = Object.fromEntries(Object.entries(ledger.ids).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(path.dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `renames=${renames.length}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `not_established=${failed}\n`);
}
console.log(`\nrenames=${renames.length} rewritten_files=${perFile.size} not_established=${failed}`);
process.exit(rate > FAIL_CEILING ? 1 : 0);
