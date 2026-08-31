#!/usr/bin/env node
/**
 * Rebuilds every derived artifact in this repository from live sources.
 *
 * The curated entries in README.md are the source of truth for WHAT is listed. Everything
 * else — stars, licences, which manifest formats an entry actually ships, every number on the
 * page — is derived here from the live repositories and rewritten on each run.
 *
 * Writes: CATALOG.md, catalog.csv, plugins.json, badges/*.json, .github/data/first-seen.json,
 *         and the number-bearing blocks in README.md.
 *
 * MARKER-SCOPED, DELIBERATELY. Blocks are located by name (`<!-- coverage:start -->`), never by
 * walking from a heading to the next heading. Heading-range scoping is what lets an auxiliary
 * section leak into a denominator and quietly inflate a count; a named marker cannot drift onto
 * content it was not put around.
 *
 * Two rules this file exists to enforce:
 *   1. THIRD STATE. A tree that fails to read is "not established" and is counted apart from both
 *      buckets. It is never "no manifest found". A run aborts above 5% unreadable, because
 *      absence of evidence printed as evidence of absence is the one bug that makes the
 *      differentiator column dishonest rather than merely thin.
 *   2. THE MARKETPLACE IS READ AT THE PINNED COMMIT. xAI pins each vendor plugin to a full SHA and
 *      a path inside that repo. Guessing the manifest path instead of reading the tree at that SHA
 *      produced a 40% false NOT-FOUND rate on the first attempt at this, which under rule 1 is an
 *      abort, not a result.
 *
 * Run locally with GH_TOKEN set. It prints every drop and refuses to shrink silently.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || '.');
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('GH_TOKEN or GITHUB_TOKEN is required'); process.exit(1); }

const OWNER = 'ZeroPointRepo';
const REPO = 'awesome-grok-bot';
const MARKETPLACE_REPO = 'xai-org/plugin-marketplace';
const MARKETPLACE_MANIFEST = '.grok-plugin/marketplace.json';
const OPEN_SCHEMA = 'agent-plugins.org';
const GH = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': `${OWNER}/${REPO}` };

/* Manifest directory -> the client that reads it. Add a row when a new one turns up in the wild.
   Never infer a client from a repo name; only a manifest in the tree counts. */
const MANIFESTS = [
  ['grok', '.grok-plugin', 'Grok Bot'],
  ['cursor', '.cursor-plugin', 'Cursor'],
  ['claude', '.claude-plugin', 'Claude Code'],
  ['codex', '.codex-plugin', 'Codex'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const drops = [];
const drop = (why) => { drops.push(why); console.log('  DROP ' + why); };
const num = (n) => (n == null ? '' : Number(n).toLocaleString('en-US'));
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

/* lastFailure carries WHY the most recent read failed. Without it every failure mode collapses
   into "unreadable", and a 25-second timeout on a very large response is indistinguishable in the
   log from a 403 or a 404 — which is how a CI-only failure survived three rounds of fixes aimed
   at the wrong cause. */
let lastFailure = '';
async function getText(url, headers = {}, tries = 5, timeoutMs = 25000) {
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers, signal: ctl.signal });
      clearTimeout(t);
      if (r.status === 403 || r.status === 429) {
        /* GitHub answers a SECONDARY rate limit with 403 and tells you how long to wait, in
           `retry-after` or in `x-ratelimit-reset`. A fixed two-second backoff ignores both and
           burns its retries inside the penalty window, which reads downstream as "this repository
           is forbidden" and lands in the catalog as a missing manifest. Wait what it asks for. */
        const ra = Number(r.headers.get('retry-after'));
        const reset = Number(r.headers.get('x-ratelimit-reset'));
        const remaining = Number(r.headers.get('x-ratelimit-remaining'));
        const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000
          : (remaining === 0 && Number.isFinite(reset) ? Math.max(0, reset * 1000 - Date.now()) : 5000 * (i + 1));
        lastFailure = `HTTP ${r.status} (rate limited, asked for ${Math.round(waitMs / 1000)}s)`;
        await sleep(Math.min(waitMs + 1000, 90000));
        continue;
      }
      if (!r.ok) { lastFailure = `HTTP ${r.status}`; return null; }
      return await r.text();
    } catch (err) { clearTimeout(t); lastFailure = err && err.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : `network error: ${err && err.message}`; await sleep(1000 * (i + 1)); }
  }
  return null;
}
const gh = async (p) => { const t = await getText('https://api.github.com' + p, GH); if (!t) return null; try { return JSON.parse(t); } catch { return null; } };
const slugOf = (url) => { const m = String(url || '').match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i); return m ? `${m[1]}/${m[2]}` : null; };
const pathOf = (url) => { const m = String(url || '').match(/^https?:\/\/(?:www\.)?github\.com\/[^/]+\/[^/]+\/tree\/[^/]+\/(.+?)\/?$/i); return m ? m[1] : ''; };

/* ---------- 1. the curated entries, read between named markers ---------- */
const readmePath = path.join(ROOT, 'README.md');
const readme = fs.readFileSync(readmePath, 'utf8');
const scoped = /<!-- catalog:start -->\n([\s\S]*?)<!-- catalog:end -->/.exec(readme);
if (!scoped) { console.error('catalog markers missing from README.md; refusing to guess the catalog boundaries'); process.exit(1); }

const ENTRY_RE = /^- \[([^\]]+)\]\(([^)]+)\) by \[([^\]]+)\]\(([^)]+)\) — (.+?) \*\*\[([a-z]+)\]\*\*\s*$/;
const parsed = [];
let section = '', subsection = '';
for (const line of scoped[1].split('\n')) {
  if (line.startsWith('#### ')) { subsection = line.slice(5).trim(); continue; }
  if (line.startsWith('### ')) { section = line.slice(4).trim(); subsection = ''; continue; }
  if (!line.startsWith('- [')) continue;
  const m = ENTRY_RE.exec(line);
  if (!m) { drop(`a bullet in "${section}" does not match the entry format: ${line.slice(0, 70)}`); continue; }
  parsed.push({ name: m[1], url: m[2], author: m[3], authorUrl: m[4], description: m[5], tag: m[6], section, subsection });
}
console.log(`${parsed.length} curated entries between the catalog markers`);
if (parsed.length < 10) { console.error('implausibly few entries parsed; refusing to write'); process.exit(1); }

/* ---------- 2. the marketplace, at the commits xAI pins ---------- */
console.log(`Reading ${MARKETPLACE_REPO}/${MARKETPLACE_MANIFEST}`);
const mkRaw = await getText(`https://raw.githubusercontent.com/${MARKETPLACE_REPO}/HEAD/${MARKETPLACE_MANIFEST}`, GH);
let marketplace = null;
try { marketplace = JSON.parse(mkRaw); } catch { /* handled next */ }
if (!marketplace || !Array.isArray(marketplace.plugins)) {
  console.error('the marketplace manifest did not parse. Fix this reader rather than falling back to a snapshot.');
  process.exit(1);
}
const pins = new Map();
for (const p of marketplace.plugins) {
  const src = p.source || {};
  const repo = slugOf(src.repository || src.url || '');
  const base = String(src.path || '').replace(/^\.\//, '').replace(/\/$/, '');
  pins.set(p.name, {
    repo: repo || MARKETPLACE_REPO,
    ref: (repo && (src.sha || src.ref || src.rev || src.commit)) || 'HEAD',
    base: repo ? (base === '.' ? '' : base) : base,
    local: !repo,
    description: (p.description || '').replace(/\s+/g, ' ').trim(),
  });
}
console.log(`  ${pins.size} vendor plugins published, ${[...pins.values()].filter((p) => !p.local).length} pinned to a remote commit`);

/* ---------- 3. repositories and their manifest trees ---------- */
const repoCache = new Map();
const treeCache = new Map();

async function repoMeta(slug) {
  if (repoCache.has(slug)) return repoCache.get(slug);
  const meta = await gh(`/repos/${slug}`);
  const out = meta && meta.full_name ? {
    full_name: meta.full_name, stars: meta.stargazers_count, license: meta.license?.spdx_id || null,
    archived: !!meta.archived, default_branch: meta.default_branch, pushed_at: meta.pushed_at,
    description: meta.description || null,
  } : null;
  repoCache.set(slug, out);
  return out;
}
async function treeAt(slug, ref) {
  const key = `${slug}@${ref}`;
  if (treeCache.has(key)) return treeCache.get(key);
  const t = await gh(`/repos/${slug}/git/trees/${ref}?recursive=1`);
  /* TRUNCATED IS NOT OK, because a truncated tree looks exactly like a repo that ships no
     manifest. GitHub truncates a recursive tree on size, so whether a big repository answers
     completely varies run to run — which showed up here as the marketplace flipping between
     19 and 17 .grok-plugin manifests on consecutive runs of the same commit. Numbers that
     wobble on their own are worse than a gap: they make a real change indistinguishable from
     noise, and on a DAILY cadence they would manufacture a commit most days. */
  /* FORCE_TRUNCATED exercises the subtree fallback on demand: `1` for every repository, or a
     substring to hit one. The truncation that motivated the fallback is size-dependent and so
     not reproducible to order, and a fallback nobody can run is a fallback nobody knows is
     broken. The control that matters is FORCE_TRUNCATED=xai-org: the numbers it produces must
     match the ordinary run exactly. */
  const f = process.env.FORCE_TRUNCATED || '';
  const forced = f === '1' || f === 'probe' || (!!f && slug.includes(f));
  const out = {
    ok: !!(t && t.tree) && !t.truncated && !forced,
    truncated: forced || !!(t && t.truncated),
    reason: forced ? 'forced by FORCE_TRUNCATED' : (t && t.truncated ? 'truncated by size' : (t && t.tree ? '' : lastFailure || 'no tree in the response')),
    paths: t && t.tree ? t.tree.filter((x) => x.type === 'blob').map((x) => x.path) : [],
  };
  treeCache.set(key, out);
  return out;
}

/* The fallback for a truncated tree, and it is deliberately a COMPLETE read rather than a cheap
   one. GitHub truncates a recursive tree on total size, but it will happily return a recursive
   listing of a SUBTREE, so the fix is to walk down to the entry's own directory and ask again
   from there. Bounded by that directory's size and complete below it.

   The first attempt at this read only one level down. Its forced-shallow control caught it: the
   manifest-directory columns matched the full read exactly, and the skill, MCP and open-manifest
   columns silently under-counted, because those files sit deeper. A fallback that answers three
   of six questions and reports all six as established is the same defect as the truncated tree
   it was written to repair. If the subtree cannot be resolved, the entry stays Not established.

   An entry whose base path IS the repository root has no smaller subtree to fall back to, so it
   correctly stays Not established rather than being papered over. */
async function subtreeAt(slug, ref, base) {
  /* FORCE_TRUNCATED=probe disables this tier too, so the raw manifest probe below it can be run
     and compared against a full read. A last resort nobody exercises is a last resort nobody
     knows is wrong. */
  if (process.env.FORCE_TRUNCATED === 'probe') return null;
  let sha = ref;
  for (const seg of base.split('/').filter(Boolean)) {
    const t = await gh(`/repos/${slug}/git/trees/${encodeURIComponent(sha)}`);
    const hit = t && t.tree && t.tree.find((x) => x.path === seg && x.type === 'tree');
    if (!hit) return null;
    sha = hit.sha;
  }
  const sub = await gh(`/repos/${slug}/git/trees/${encodeURIComponent(sha)}?recursive=1`);
  if (sub && sub.tree && !sub.truncated) return { ok: true, paths: sub.tree.filter((x) => x.type === 'blob').map((x) => x.path) };

  /* The subtree is itself too big, which is the case for an entry sitting at a repository root.
     Rebuild it from bounded pieces instead: one non-recursive listing (never truncated) plus one
     recursive listing per top-level child. Concatenating those is the same complete answer, just
     assembled. If any single piece still comes back truncated the whole read is abandoned, because
     a tree assembled from some of its parts is exactly the partial answer this guards against. */
  const top = await gh(`/repos/${slug}/git/trees/${encodeURIComponent(sha)}`);
  if (!top || !top.tree || top.truncated) return null;
  const paths = top.tree.filter((x) => x.type === 'blob').map((x) => x.path);
  for (const dir of top.tree.filter((x) => x.type === 'tree')) {
    const part = await gh(`/repos/${slug}/git/trees/${dir.sha}?recursive=1`);
    if (!part || !part.tree || part.truncated) return null;
    for (const b of part.tree) if (b.type === 'blob') paths.push(`${dir.path}/${b.path}`);
  }
  return { ok: true, paths };
}

/* TIER THREE, and the reason it exists is a hard limit rather than a bug. The scheduled run uses
   the workflow's own GITHUB_TOKEN, and that token is refused (403) on the git trees API for
   xai-org/plugin-marketplace no matter how long it waits — two full minutes of header-directed
   backoff still ended in 403. raw.githubusercontent, meanwhile, serves the same repository fine,
   which is how the marketplace manifest itself is read.

   So the last resort asks raw for the canonical manifest paths directly. This is NOT the
   path-guessing that this file warns about elsewhere: guessing means inventing where a vendor
   MIGHT have put a manifest inside a layout you have not read. These five paths are what the
   formats ARE — a manifest that is not at `.grok-plugin/plugin.json` is not a `.grok-plugin`
   manifest — so probing them enumerates the question completely rather than sampling it.

   What it CANNOT establish: SKILL.md counts, MCP configs, and - this one matters most - whether
   the entry carries an open Agent Plugins manifest. Netlify proved that last one during the
   control run: its open plugin.json lives at `agent-plugin/plugin.json`, a path no canonical list
   contains, so probing found three manifests and missed the open one. Reported as a false, that
   silently understates the single number this list is read for. All four fields come back
   UNKNOWN, not zero, and stay unknown all the way through to the table and the denominators.
   An entry resolved this way has established manifest directories and nothing else, and the
   difference is visible rather than averaged away. */
async function probeManifests(slug, ref, base) {
  const at = (f) => `https://raw.githubusercontent.com/${slug}/${ref}/${base ? base.replace(/\/$/, '') + '/' : ''}${f}`;
  const candidates = MANIFESTS.flatMap(([, dir]) => [`${dir}/plugin.json`, `${dir}/marketplace.json`]);
  const found = [];
  let anyAnswer = false;
  for (const f of candidates) {
    const t = await getText(at(f), GH, 2, 15000);
    if (t == null) { if (/HTTP 404/.test(lastFailure)) anyAnswer = true; continue; }
    anyAnswer = true;
    found.push(f);
  }
  if (!anyAnswer) return null; // nothing answered at all: this is not evidence of absence
  return { ok: true, paths: found, manifestsOnly: true };
}

async function carriesOpenSchema(slug, ref, file) {
  const t = await getText(`https://raw.githubusercontent.com/${slug}/${ref}/${file}`, GH, 2, 15000);
  if (!t) return null;
  try { return String(JSON.parse(t).$schema || '').includes(OPEN_SCHEMA); } catch { return null; }
}

console.log('Resolving every entry and reading its manifest tree');
const entries = [];
let i = 0;
const worker = async () => {
  while (i < parsed.length) {
    const e = parsed[i++];
    const slug = slugOf(e.url);
    if (!slug) { entries.push({ ...e, slug: null, known: false, why: 'entry does not point at a GitHub repository' }); continue; }

    const pin = e.subsection.toLowerCase().includes('marketplace') ? pins.get(e.name) : null;
    const meta = await repoMeta(pin ? pin.repo : slug);
    if (!meta) { drop(`${e.name}: ${pin ? pin.repo : slug} did not resolve through the API`); entries.push({ ...e, slug, known: false, why: 'repository did not resolve' }); continue; }

    /* THE PINNED READ. For a marketplace entry the honest question is not "what is in this repo
       today" but "what is in the commit the marketplace loads", so the ref and the path prefix
       both come from the marketplace manifest, never from a guess. */
    /* The git trees API wants a real ref or a SHA; the literal string HEAD does not resolve there
       even though raw.githubusercontent accepts it. A marketplace plugin vendored INTO the
       marketplace repo has no pinned SHA, so it lands on that path, and the mismatch showed up
       only under truncation, where the subtree walk is the code that calls the trees API. */
    const ref = pin ? (/^[0-9a-f]{7,40}$/i.test(pin.ref) ? pin.ref : meta.default_branch) : meta.default_branch;
    const base = pin ? pin.base : pathOf(e.url);
    let tree = await treeAt(pin ? pin.repo : slug, ref);
    let prefix = base ? base.replace(/\/$/, '') + '/' : '';
    let rel = tree.paths.filter((p) => !prefix || p.startsWith(prefix)).map((p) => (prefix ? p.slice(prefix.length) : p));
    let shallow = false;
    let manifestsOnly = false;
    /* Fires on ANY unusable tree, not only a truncated one. The failure that shipped was a 25
       second timeout on a single very large recursive response in CI, which local runs never hit
       because the box is faster; gating the repair on `truncated` meant the repair never ran
       where it was needed. The assembled read replaces one enormous call with several small ones,
       which is the right shape for a timeout as well as for a truncation. */
    if (!tree.ok) {
      console.log(`  RETRY ${e.name}: tree read ${tree.reason || 'failed'}; rebuilding it from bounded subtrees`);
      /* prefix strips the base off a TREE path; filePrefix (below) puts it back on for a raw file
         read. Conflating the two sends every pinned sub-path read to the repository root, which
         the forced-shallow control caught before it could ship. */
      let sub = await subtreeAt(pin ? pin.repo : slug, ref, base);
      if (!sub) {
        console.log(`  RETRY ${e.name}: the assembled read did not resolve either (${lastFailure || 'unknown'}); falling back to a direct manifest probe`);
        sub = await probeManifests(pin ? pin.repo : slug, ref, base);
      }
      if (sub) { tree = sub; prefix = ''; rel = sub.paths; shallow = true; manifestsOnly = !!sub.manifestsOnly; }
      else console.log(`  RETRY ${e.name}: the manifest probe did not answer either (${lastFailure || 'unknown'})`);
    }
    const set = new Set(rel);

    const ships = {};
    for (const [key, dir] of MANIFESTS) ships[key] = set.has(`${dir}/plugin.json`) || set.has(`${dir}/marketplace.json`);
    const skills = manifestsOnly ? null : rel.filter((p) => /(^|\/)SKILL\.md$/i.test(p)).length;
    const mcp = rel.some((p) => /(^|\/)\.?mcp(_?config|_?servers)?\.json$/i.test(p)) || /mcp/i.test(meta.description || '') === false && false;
    const mcpFiles = rel.filter((p) => /(^|\/)\.?mcp(_?config|_?servers)?\.json$/i.test(p));

    /* Enumerate EVERY plugin.json under the entry and read each one, rather than testing a single
       guessed path. This is the read that found netlify and stripe shipping an open manifest in
       the same commit xAI pins a schema-less one. */
    const filePrefix = base ? base.replace(/\/$/, '') + '/' : '';
    const manifestFiles = rel.filter((p) => /(^|\/)plugin\.json$/.test(p)).slice(0, 8);
    let openSchema = false;
    const openSchemaPaths = [];
    let schemaReadFailed = false;
    for (const f of manifestFiles) {
      const carries = await carriesOpenSchema(pin ? pin.repo : slug, ref, filePrefix + f);
      if (carries === null) { schemaReadFailed = true; continue; }
      if (carries) { openSchema = true; openSchemaPaths.push(f); }
    }
    /* The manifest the loader actually consumes, for a marketplace entry: the .grok-plugin one
       under the pinned path. That is the binding test for whether the open standard has arrived
       in Grok Bot: what xAI's loader reads is what Grok Bot runs on. */
    const consumedOpen = pin ? openSchemaPaths.some((p) => p.startsWith('.grok-plugin/')) : null;

    /* Separately, and it is a DIFFERENT question: does the vendor publish an open manifest
       ANYWHERE in the repository at that same pinned commit? Stripe does, at a path xAI does not
       pin. Scoping only to the pinned path answers "what gets loaded" and would report that as a
       no, which is true but not the whole truth. Both numbers are reported, never merged. */
    let openSchemaRepoWide = pin ? openSchema : null;
    if (pin && !openSchemaRepoWide && tree.ok && !shallow) {
      for (const f of tree.paths.filter((p) => /(^|\/)plugin\.json$/.test(p)).slice(0, 12)) {
        if (await carriesOpenSchema(pin.repo, ref, f)) { openSchemaRepoWide = true; break; }
      }
    }

    entries.push({
      ...e,
      slug: meta.full_name, repo: meta.full_name, base, ref,
      stars: meta.stars, license: meta.license, archived: meta.archived, pushedAt: meta.pushed_at,
      repoDescription: meta.description, pinned: !!pin, pinnedRef: pin ? pin.ref : null,
      ships, skills, shallow, manifestsOnly, mcp: manifestsOnly ? null : mcpFiles.length > 0, mcpFiles: mcpFiles.length,
      rootManifest: manifestsOnly ? null : set.has('plugin.json'),
      openSchema: manifestsOnly ? null : openSchema,
      openSchemaPaths, consumedOpen: manifestsOnly ? null : consumedOpen, openSchemaRepoWide: manifestsOnly ? null : openSchemaRepoWide,
      known: tree.ok && !schemaReadFailed,
      why: tree.ok ? (schemaReadFailed ? 'a plugin.json could not be read' : '') : `file tree unusable: ${tree.reason || 'unknown'}`,
    });
  }
};
/* Four, not six. The burst is what trips the secondary limit, and a catalog walk has no deadline
   worth trading correctness for. */
await Promise.all(Array.from({ length: 4 }, worker));

entries.sort((a, b) => (a.section || '').localeCompare(b.section || '') || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

const unknown = entries.filter((e) => !e.known).length;
console.log(`  ${entries.length - unknown} established, ${unknown} not established`);
if (unknown) for (const e of entries.filter((x) => !x.known)) console.log(`  NOT ESTABLISHED ${e.name}: ${e.why}`);
if (entries.length && unknown / entries.length > 0.05) {
  console.error(`more than 5% of entries could not be established (${unknown}/${entries.length}). Refusing to publish a coverage table built on gaps.`);
  process.exit(1);
}

/* ---------- 4. first-seen ledger ---------- */
/* Only ever moves a date EARLIER. That is the one field here with a one-directional error: a
   first-seen date can only ever be recorded too late, so "keep the earlier" is always the true
   value and two concurrent runs merge for free. Counts, descriptions and manifest flags have no
   such direction and are NOT merged - a losing run replays its own generated copy instead. */
const seenPath = path.join(ROOT, '.github/data/first-seen.json');
let seen = { _note: 'When THIS list first carried each entry. Written by build-catalog.mjs, never edited by hand, never back-dated. On a merge, the EARLIER date always wins.', entries: {} };
if (fs.existsSync(seenPath)) { try { seen = JSON.parse(fs.readFileSync(seenPath, 'utf8')); } catch { /* rebuild */ } }
if (!seen.entries) seen.entries = {};
const today = new Date().toISOString().slice(0, 10);
for (const e of entries) {
  const key = e.repo || e.name;
  if (!seen.entries[key] || seen.entries[key] > today) seen.entries[key] = seen.entries[key] ? (seen.entries[key] < today ? seen.entries[key] : today) : today;
}
fs.mkdirSync(path.dirname(seenPath), { recursive: true });
fs.writeFileSync(seenPath, JSON.stringify(seen, null, 2) + '\n');

/* ---------- 5. shrink guard ---------- */
const catalogPath = path.join(ROOT, 'CATALOG.md');
if (fs.existsSync(catalogPath)) {
  const prev = (fs.readFileSync(catalogPath, 'utf8').match(/^\| \[/gm) || []).length;
  if (prev && entries.length < prev * 0.9) {
    console.error(`catalog would shrink from ${prev} to ${entries.length}, refusing. Investigate before forcing.`);
    process.exit(1);
  }
}

/* ---------- 6. the derived numbers ---------- */
const est = entries.filter((e) => e.known);
const shipCount = (k) => est.filter((e) => e.ships[k]).length;
const openKnown = est.filter((e) => e.openSchema != null);
const openCount = openKnown.filter((e) => e.openSchema).length;
const mcpKnown = est.filter((e) => e.mcp != null);
const mcpCount = mcpKnown.filter((e) => e.mcp).length;
const fieldUnknown = est.filter((e) => e.manifestsOnly).length;
const skillsOnly = est.filter((e) => e.skills != null && e.skills > 0 && !MANIFESTS.some(([k]) => e.ships[k]) && !e.rootManifest).length;
const grokManifest = shipCount('grok');
const vendorCount = pins.size;
const vendorOpenConsumed = est.filter((e) => e.pinned && e.consumedOpen).length;
const vendorOpenAnywhere = est.filter((e) => e.pinned && e.openSchemaRepoWide).length;
const vendorOpenNames = est.filter((e) => e.pinned && e.openSchemaRepoWide).map((e) => e.name).sort();

const manifestsOf = (e) => {
  const out = MANIFESTS.filter(([k]) => e.ships[k]).map(([, dir]) => dir);
  if (e.openSchema) out.push('open plugin.json');
  else if (e.rootManifest) out.push('plugin.json');
  if (!out.length && e.mcp) out.push('MCP only');
  if (!out.length && e.skills) out.push('skills only');
  if (e.manifestsOnly) out.push('other formats not established');
  return out;
};
const manifestCell = (e) => (!e.known ? 'Not established' : manifestsOf(e).join(', ') || 'No manifest');

/* ---------- CATALOG.md ---------- */
const md = [];
md.push(`# Grok Bot catalog: all ${entries.length} entries, with what each one ships\n`);
md.push(`Every entry on [README.md](README.md), re-resolved from its own repository on ${today}. This file is the whole set.\n`);
md.push(`**${grokManifest}** ship a \`.grok-plugin\` manifest, the format Grok Bot loads. **${openCount}** of the ${openKnown.length} that could be checked carry a \`plugin.json\` on the open Agent Plugins standard. **${mcpCount}** of the ${mcpKnown.length} that could be checked bring an MCP server component${unknown ? `. **${unknown}** could not be established at all this run` : ''}.\n`);
md.push('`Ships` is manifest presence in that repository, read from its file tree. Nothing is inferred from a name or a description. Marketplace entries are read at the commit xAI pins, not at HEAD.\n');
md.push('| Entry | Section | Author | Stars | Ships | Skills | Licence | Added |');
md.push('|---|---|---|---:|---|---:|---|---|');
for (const e of entries) {
  md.push(`| [${e.name}](${e.url}) | ${e.subsection || e.section} | ${e.author} | ${num(e.stars)} | ${manifestCell(e)} | ${e.skills == null ? '?' : (e.skills || '')} | ${e.license || ''} | ${seen.entries[e.repo || e.name] || ''} |`);
}
md.push('\n---\n');
md.push('<sub>Unofficial, community-maintained. Not affiliated with or endorsed by xAI/SpaceXAI or Cursor.</sub>');
fs.writeFileSync(catalogPath, md.join('\n') + '\n');

/* ---------- catalog.csv ---------- */
const cols = ['name', 'section', 'subsection', 'url', 'repo', 'path', 'ref', 'author', 'tag', 'stars', 'license', 'archived', 'pushed_at', 'skills', 'mcp_component', 'root_plugin_json', 'open_agent_plugins_schema', 'open_schema_paths', 'open_schema_in_pinned_repo', ...MANIFESTS.map(([k]) => 'ships_' + k), 'marketplace_pinned', 'manifests_established', 'first_seen', 'description'];
const rows = [cols.join(',')];
for (const e of entries) {
  rows.push([e.name, e.section, e.subsection, e.url, e.repo || '', e.base || '', e.ref || '', e.author, e.tag, e.stars, e.license, e.archived, e.pushedAt, e.skills, e.mcp, e.rootManifest, e.openSchema, (e.openSchemaPaths || []).join(' '), e.openSchemaRepoWide, ...MANIFESTS.map(([k]) => e.ships && e.ships[k]), e.pinned, e.known, seen.entries[e.repo || e.name] || '', e.description].map(csvCell).join(','));
}
fs.writeFileSync(path.join(ROOT, 'catalog.csv'), rows.join('\n') + '\n');

/* ---------- plugins.json ---------- */
fs.writeFileSync(path.join(ROOT, 'plugins.json'), JSON.stringify({
  name: 'awesome-grok-bot',
  url: `https://github.com/${OWNER}/${REPO}`,
  source: `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/plugins.json`,
  updated: today,
  count: entries.length,
  entries: entries.map((e) => ({
    name: e.name, section: e.subsection || e.section, url: e.url, repo: e.repo || null,
    author: e.author, tag: e.tag, description: { en: e.description },
    stars: e.stars ?? null, license: e.license || null, archived: !!e.archived,
    added: seen.entries[e.repo || e.name] || null,
    ships: e.known ? manifestsOf(e) : null,
    skills: e.skills ?? null, mcp_component: e.known ? !!e.mcp : null,
    open_agent_plugins_schema: e.known ? !!e.openSchema : null,
    marketplace_pinned_ref: e.pinnedRef || null,
  })),
}, null, 2) + '\n');

/* ---------- badges ---------- */
const badge = (label, message, color) => JSON.stringify({ schemaVersion: 1, label, message, color }, null, 2) + '\n';
fs.mkdirSync(path.join(ROOT, 'badges'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'badges/entries.json'), badge('entries', String(entries.length), 'blueviolet'));
fs.writeFileSync(path.join(ROOT, 'badges/manifests.json'), badge('ship a .grok-plugin', `${grokManifest}/${entries.length}`, '6799FE'));
fs.writeFileSync(path.join(ROOT, 'badges/checked-at.json'), badge('last checked', new Date().toISOString().replace(/\.\d+Z$/, 'Z'), 'blue'));

/* ---------- README: every number on the page is written from this run ----------
   The prose is hand-written. The numbers are not, and never are. A page that promises 63 while
   the catalog holds 61 is worse than a page with no number on it. */
const coverageBlock = [
  '| What an entry ships | Entries |',
  '|---|---:|',
  ...MANIFESTS.map(([k, dir, label]) => `| \`${dir}/\` manifest${k === 'grok' ? ', the format Grok Bot loads' : `, so it also loads in ${label}`} | ${shipCount(k)} |`)
    .filter((_, idx) => shipCount(MANIFESTS[idx][0]) > 0),
  `| \`plugin.json\` on the open Agent Plugins standard | ${openCount}${openKnown.length < est.length ? ` of ${openKnown.length} checked` : ''} |`,
  `| An MCP server component | ${mcpCount}${mcpKnown.length < est.length ? ` of ${mcpKnown.length} checked` : ''} |`,
  `| \`SKILL.md\` skills and no plugin manifest | ${skillsOnly} |`,
  ...(unknown ? [`| Could not be established this run | ${unknown} |`] : []),
  '',
  `Read from each repository's own file tree on ${today}. Marketplace entries are read at the commit xAI pins, not at HEAD.`,
  ...(fieldUnknown ? [`${fieldUnknown} entr${fieldUnknown === 1 ? 'y' : 'ies'} answered on manifest directories but not on skills, MCP or the open standard this run, and ${fieldUnknown === 1 ? 'is' : 'are'} left out of those rows rather than counted as zero.`] : []),
].join('\n');

const marketplaceBlock = [
  `xAI runs an [official plugin marketplace](https://github.com/${MARKETPLACE_REPO}) — ${vendorCount} vendor plugins in`,
  '`.grok-plugin` format, the same plugin surface Grok Bot inherits under Cursor\'s plugin/MCP policy. All',
  `${vendorCount} are listed below, each resolved at the exact commit the marketplace pins.`,
].join('\n');

const convergenceBlock = [
  `xAI's own [official plugin marketplace](https://github.com/${MARKETPLACE_REPO}) is where this gets`,
  'interesting, because the answer is now two things at once. Every manifest the marketplace actually loads',
  `was re-read at the exact commit xAI pins: **${vendorOpenConsumed} of the ${vendorCount} published plugins carry the open spec's \`$schema\``,
  `in the manifest that gets consumed.** But **${vendorOpenAnywhere}** of those vendors${vendorOpenAnywhere && vendorOpenAnywhere <= 4 ? ' — ' + vendorOpenNames.join(' and ') + ' — ' : ' '}*also* publish, in the`,
  'very same commit xAI pins, a first-class `plugin.json` carrying',
  '`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. Convergence on the open',
  'standard is real and it is incomplete: the vendors have shipped it, and the loader does not read it yet.',
].join('\n');

/* the promise line, and the cross-reference count, which is a live read of the sister list */
const promiseBlock = `**A curated, verified directory of ${entries.length} Grok Bot skills, plugins, MCP servers and self-hosted alternatives.**`;

let crossrefBlock = null;
{
  const sis = await getText(`https://raw.githubusercontent.com/${OWNER}/awesome-agent-plugins/main/README.md`, GH, 2, 20000);
  const badgeN = sis && /badge\/plugins-(\d+)-/.exec(sis);
  const bulletN = sis ? (sis.match(/^- \[[^\]]+\]\([^)]+\) by \[/gm) || []).length : 0;
  const n = badgeN ? Number(badgeN[1]) : (bulletN >= 10 ? bulletN : null);
  if (n) {
    crossrefBlock = [
      'If Grok Bot\'s plugin ecosystem moves onto the open standard, those plugins will be interoperable with every',
      'other launch client. Track that standard at our sister list:',
      `**[ZeroPointRepo/awesome-agent-plugins](https://github.com/${OWNER}/awesome-agent-plugins)** — ${n} verified`,
      'Agent Plugins across ChatGPT, Codex, Cursor, GitHub Copilot, Kiro and VS Code.',
    ].join('\n');
  } else {
    console.log('  WARN: the sister list count could not be established; the cross-reference block is left untouched');
  }
}

/* the ecosystem scale line under the comparison table */
let ecosystemBlock = null;
{
  const want = ['openclaw/openclaw', 'NousResearch/hermes-agent', MARKETPLACE_REPO];
  const got = {};
  for (const s of want) { const m = await repoMeta(s); if (m) got[s] = m.stars; }
  if (Object.keys(got).length === want.length) {
    const launched = Date.UTC(2026, 7, 11);
    const days = Math.floor((Date.now() - launched) / 86400000);
    ecosystemBlock = [
      `OpenClaw is at **${num(got['openclaw/openclaw'])}★** and Hermes Agent at **${num(got['NousResearch/hermes-agent'])}★**, pulled from the GitHub API on ${today}. Grok`,
      'Bot is a closed product with no comparable figure: the largest repo in its third-party ecosystem is xAI\'s own',
      `marketplace at **${num(got[MARKETPLACE_REPO])}★**, ${days} days after launch. Numbers this size move daily, so treat them as a snapshot.`,
    ].join('\n');
  } else console.log('  WARN: an ecosystem star figure did not resolve; that block is left untouched');
}

{
  let r = fs.readFileSync(readmePath, 'utf8');
  /* The indent in front of the start marker is preserved on the end marker, so a block nested
     inside a list item does not lose its alignment a little more on every run. */
  const between = (name, body) => {
    if (body == null) return;
    const re = new RegExp(`^([ \\t]*)(<!-- ${name}:start -->\\n)[\\s\\S]*?([ \\t]*)(<!-- ${name}:end -->)`, 'm');
    if (!re.test(r)) { console.log(`  WARN: ${name} markers missing from README, block not refreshed`); return; }
    r = r.replace(re, (_m, indent, start) => `${indent}${start}${body}\n${indent}${'<!-- ' + name + ':end -->'}`);
  };
  between('promise', promiseBlock);
  between('coverage', coverageBlock);
  between('marketplace', marketplaceBlock);
  between('convergence', convergenceBlock.split('\n').map((l) => '   ' + l).join('\n'));
  between('crossref', crossrefBlock);
  between('ecosystem', ecosystemBlock);
  fs.writeFileSync(readmePath, r);
}

console.log(`\nWrote CATALOG.md (${entries.length}), catalog.csv, plugins.json, 3 badges, first-seen ledger.`);
console.log(`Ships: ${grokManifest} .grok-plugin, ${shipCount('cursor')} .cursor-plugin, ${shipCount('claude')} .claude-plugin, ${openCount}/${openKnown.length} open plugin.json, ${mcpCount}/${mcpKnown.length} MCP, ${skillsOnly} skills-only, ${unknown} not established, ${fieldUnknown} manifest-only.`);
console.log(`Marketplace: ${vendorCount} vendor plugins, ${vendorOpenConsumed} carrying the open $schema in the CONSUMED manifest, ${vendorOpenAnywhere} carrying it anywhere in the pinned tree (${vendorOpenNames.join(', ') || 'none'}).`);
console.log(drops.length ? `${drops.length} drop(s) this run, listed above.` : 'No drops this run.');
