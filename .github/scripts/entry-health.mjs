#!/usr/bin/env node
// Entry health check: catches what an HTTP status check structurally cannot.
//
// A renamed GitHub repo redirects and returns 200. An archived repo returns 200.
// Both look perfectly healthy to a link checker, and both are real rot: a renamed
// entry credits the wrong owner and breaks the moment the redirect is reclaimed,
// and an archived project should not sit in a curated list unlabelled.
//
// This reads every github.com URL in the given files, resolves each repo through
// the API, and reports:
//   RENAMED  - api full_name differs from the slug we link to
//   ARCHIVED - repo is archived upstream
//   GONE     - 404 (deleted, or made private)
//
// Deliberately NOT a PR gate. Link rot is not a contributor's fault and must never
// block their PR. Runs weekly, opens or updates one issue.

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: entry-health.mjs <file> [file...]');
  process.exit(2);
}

// GitHub paths that are not repositories.
const RESERVED = new Set([
  'orgs', 'sponsors', 'features', 'settings', 'marketplace', 'apps', 'topics',
  'search', 'about', 'pricing', 'login', 'join', 'notifications', 'explore',
  'collections', 'events', 'readme', 'security', 'enterprise', 'customer-stories',
  'trending', 'codespaces', 'issues', 'pulls', 'dashboard', 'new', 'account',
]);

const slugs = new Map(); // slug -> Set(source files)

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    console.log(`(skipping unreadable file: ${file})`);
    continue;
  }
  // Trailing characters that are markdown syntax, not part of the URL.
  // The backtick matters: inline-code URLs otherwise resolve to a bogus %60 path.
  const raw = text.match(/https?:\/\/github\.com\/[^\s)<>"'\]]+/g) || [];
  for (const u of raw) {
    const cleaned = u.replace(/[.,;:!?`*_)\]}>'"]+$/, '');
    const m = cleaned.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (!m) continue;
    const owner = m[1];
    const repo = m[2].replace(/\.git$/i, '');
    if (RESERVED.has(owner.toLowerCase())) continue;
    if (!owner || !repo) continue;
    const slug = `${owner}/${repo}`;
    if (!slugs.has(slug)) slugs.set(slug, new Set());
    slugs.get(slug).add(file);
  }
}

const all = [...slugs.keys()].sort();
console.log(`Resolving ${all.length} unique GitHub repositories...`);

const headers = {
  'User-Agent': 'entry-health-check',
  Accept: 'application/vnd.github+json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

const findings = [];
const errors = [];
let i = 0;

async function worker() {
  while (i < all.length) {
    const slug = all[i++];
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${slug}`, { headers });
    } catch (e) {
      errors.push({ slug, why: `network: ${String(e.message).slice(0, 60)}` });
      continue;
    }
    if (res.status === 404) {
      findings.push({ kind: 'GONE', slug, now: null, files: [...slugs.get(slug)] });
      continue;
    }
    if (res.status === 403 || res.status === 429) {
      errors.push({ slug, why: `rate limited (${res.status})` });
      continue;
    }
    if (!res.ok) {
      errors.push({ slug, why: `HTTP ${res.status}` });
      continue;
    }
    let j;
    try {
      j = await res.json();
    } catch {
      errors.push({ slug, why: 'unparseable response' });
      continue;
    }
    if (j.full_name && j.full_name.toLowerCase() !== slug.toLowerCase()) {
      findings.push({ kind: 'RENAMED', slug, now: j.full_name, files: [...slugs.get(slug)] });
    }
    if (j.archived) {
      findings.push({
        kind: 'ARCHIVED', slug, now: j.full_name,
        pushed: (j.pushed_at || '').slice(0, 10), files: [...slugs.get(slug)],
      });
    }
  }
}

await Promise.all(Array.from({ length: 6 }, worker));

const order = { GONE: 0, RENAMED: 1, ARCHIVED: 2 };
findings.sort((a, b) => order[a.kind] - order[b.kind] || a.slug.localeCompare(b.slug));

const lines = [];
lines.push(`Checked **${all.length}** linked repositories via the GitHub API.`);
lines.push('');
lines.push(
  'These are problems a link checker cannot see: a renamed or archived repository still returns ' +
  'HTTP 200, so the weekly link sweep passes it clean.'
);
lines.push('');

if (!findings.length) {
  lines.push('**No renamed, archived or deleted entries found.**');
} else {
  const gone = findings.filter((f) => f.kind === 'GONE');
  const renamed = findings.filter((f) => f.kind === 'RENAMED');
  const archived = findings.filter((f) => f.kind === 'ARCHIVED');

  if (gone.length) {
    lines.push(`### Gone (404) - ${gone.length}`);
    lines.push('');
    lines.push('Deleted or made private. Remove the entry, and check whether anything else cites it.');
    lines.push('');
    for (const f of gone) lines.push(`- \`${f.slug}\` (in ${f.files.join(', ')})`);
    lines.push('');
  }
  if (renamed.length) {
    lines.push(`### Renamed - ${renamed.length}`);
    lines.push('');
    lines.push('The link still resolves by redirect, but it credits the wrong owner and breaks if the old name is reclaimed.');
    lines.push('');
    for (const f of renamed) lines.push(`- \`${f.slug}\` is now **\`${f.now}\`** (in ${f.files.join(', ')})`);
    lines.push('');
  }
  if (archived.length) {
    lines.push(`### Archived - ${archived.length}`);
    lines.push('');
    lines.push('Read-only upstream. Either label the entry or replace it with a maintained successor.');
    lines.push('');
    for (const f of archived) {
      lines.push(`- \`${f.slug}\`${f.pushed ? ` (last push ${f.pushed})` : ''} (in ${f.files.join(', ')})`);
    }
    lines.push('');
  }
}

if (errors.length) {
  lines.push(`### Not checked - ${errors.length}`);
  lines.push('');
  lines.push('Transient failures, not findings. These are reported so a rate-limited run is never mistaken for a clean one.');
  lines.push('');
  for (const e of errors.slice(0, 25)) lines.push(`- \`${e.slug}\`: ${e.why}`);
  if (errors.length > 25) lines.push(`- ...and ${errors.length - 25} more`);
  lines.push('');
}

lines.push('---');
lines.push('*Automated weekly entry-health check. Advisory only, never blocks a pull request.*');

const report = lines.join('\n');
writeFileSync('entry-health-report.md', report + '\n');
console.log('\n' + report + '\n');

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `findings=${findings.length}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `errors=${errors.length}\n`);
}
console.log(`findings=${findings.length} errors=${errors.length}`);
// Always exit 0: advisory, never fails a build.
process.exit(0);
