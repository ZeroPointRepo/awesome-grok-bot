<p align="center">
  <img src="banner.png" width="800" alt="Awesome Grok Bot" />
</p>

<p align="center">
  <a href="https://awesome.re"><img src="https://awesome.re/badge.svg" alt="Awesome" /></a>
  <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FZeroPointRepo%2Fawesome-grok-bot%2Fmain%2Fbadges%2Fentries.json" alt="Entry count" />
  <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2FZeroPointRepo%2Fawesome-grok-bot%2Fmain%2Fbadges%2Fmanifests.json" alt="Entries shipping a Grok Bot manifest" />
  <img src="https://img.shields.io/github/last-commit/ZeroPointRepo/awesome-grok-bot" alt="Last commit" />
  <img src="https://img.shields.io/badge/Grok%20Bot-beta%20(2026--08--11)-informational" alt="Grok Bot status" />
  <img src="https://img.shields.io/badge/status-unofficial-lightgrey" alt="Unofficial, not affiliated with xAI or Cursor" />
  <img src="https://img.shields.io/badge/license-CC%20BY%204.0-lightgrey" alt="License" />
</p>

# Awesome Grok Bot

<!-- promise:start -->
**A curated, verified directory of 63 Grok Bot skills, plugins, MCP servers and self-hosted alternatives.**
<!-- promise:end -->
[Grok Bot](https://docs.x.ai/grok-bot/overview) is xAI/SpaceXAI and Cursor's always-on AI teammates, each
with their own persistent cloud computer. It launched in beta on 2026-08-11 and this list has tracked the
ecosystem from day one.

Everything here is checked against a primary source, including the honest read on how Grok Bot is actually
extended, which is not what most write-ups assume. This is an unofficial, community-maintained list and is
not affiliated with or endorsed by xAI/SpaceXAI or Cursor.

**Machine-readable:** [CATALOG.md](CATALOG.md) · [catalog.csv](catalog.csv) · [plugins.json](plugins.json) · [llms.txt](llms.txt)

---

## Contents

- [What is Grok Bot? (and how do you actually extend it?)](#what-is-grok-bot-and-how-do-you-actually-extend-it)
- [Grok Bot pricing and how to get it](#grok-bot-pricing-and-how-to-get-it)
- [Grok Bot vs OpenClaw vs Hermes Agent](#grok-bot-vs-openclaw-vs-hermes-agent)
- [⭐ Pick of the Week](#-pick-of-the-week)
- [Grok Bot events and community](#grok-bot-events-and-community)
- [The catalog: Grok Bot skills, plugins and MCP](#the-catalog-grok-bot-skills-plugins-and-mcp)
- [🛡️ Security notice](#️-security-notice)
- [🤝 Contributing](#-contributing)
- [Related lists](#related-lists)

---

## What is Grok Bot? (and how do you actually extend it?)

**Grok Bot** ships from xAI/SpaceXAI *and* Cursor jointly — it is not the same product as **Grok Build**
(xAI's separate, open-sourced coding CLI/TUI agent) or plain **Grok** (the chat assistant). Bots are
"AI teammates you can give real work to": each user gets **one persistent, shared cloud computer** — a
browser, filesystem and terminal — that keeps running when your laptop is closed. Files, browser sessions and
app logins persist across tasks and across every Bot on the account (isolation is per-*user*, not per-Bot;
each Bot gets its own screen on the shared machine so several can work in parallel).
([docs.x.ai/grok-bot/overview](https://docs.x.ai/grok-bot/overview))

**How it's actually extended — four distinct mechanisms, verified against xAI's own docs and real installs
in the wild, not assumed:**

1. **Cursor's plugin + MCP marketplace.** Per xAI's own docs: *"Grok Bot follows your team's existing Cursor
   plugin and MCP policy. There are no separate Grok Bot plugin controls."* ([docs.x.ai/grok-bot/teams-and-enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises))
   Team plans add "a team marketplace for internal rules, skills, and plugins." **This is the part worth
   getting right, because it's easy to assume wrong:** the real plugins we found in the wild
   ([`useorgx/orgx-grokbot-plugin`](https://github.com/useorgx/orgx-grokbot-plugin),
   [`GrokBotfun/GrokBotfun`](https://github.com/GrokBotfun/GrokBotfun)) ship in Cursor's **pre-existing,
   proprietary `.cursor-plugin/plugin.json` marketplace format** (or a Bot-specific `.grok-plugin/plugin.json`
   variant) — **not** the new open [Agent Plugins](https://agentplugins.codes/) standard that Cursor itself
   helped launch five days before Grok Bot shipped.

   <!-- convergence:start -->
   xAI's own [official plugin marketplace](https://github.com/xai-org/plugin-marketplace) is where this gets
   interesting, because the answer is now two things at once. Every manifest the marketplace actually loads
   was re-read at the exact commit xAI pins: **0 of the 21 published plugins carry the open spec's `$schema`
   in the manifest that gets consumed.** But **2** of those vendors — netlify and stripe — *also* publish, in the
   very same commit xAI pins, a first-class `plugin.json` carrying
   `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. Convergence on the open
   standard is real and it is incomplete: the vendors have shipped it, and the loader does not read it yet.
   <!-- convergence:end -->

   The cleanest single illustration is a vendor that ships both: **Neon** publishes
   [`neondatabase/agent-skills`](https://github.com/neondatabase/agent-skills) with the canonical
   `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` `$schema`, and separately ships
   `external_plugins/neon/.grok-plugin/plugin.json` into xAI's marketplace with **no `$schema` at all**.
   Same company, same product, two manifest formats, one per ecosystem. Which manifest each entry in this
   list ships is a column in [CATALOG.md](CATALOG.md), read from its repository, nothing inferred. Plugins are
   marketplace bundles of connectors and skills, managed through Cursor-side tools (`SearchPlugins`,
   `InstallPlugin`, `AddMcpServer`, `AuthenticateMcpServer`) and surfaced in
   **App Settings → Plugins → Marketplace / Yours**.
2. **Computer use.** Bots operate apps and websites directly — including ones with no clean API or MCP
   connection at all — by driving the browser/desktop the same way a person would.
3. **Learned routines.** Demonstrate a workflow once; the Bot saves the path as a routine and repeats/adapts
   it later, corrections included.
4. **Skills.** Reusable capability packs, conceptually the same idea as Agent Skills (a `SKILL.md` plus
   optional scripts) — confirmed in docs and in real installs like
   [`jeffhuber/grokbot-imessage-skill`](https://github.com/jeffhuber/grokbot-imessage-skill).

## Grok Bot pricing and how to get it

Grok Bot is **not sold standalone** — it rides on three existing premium plans, and there's no free tier:

| Plan | Price | What it adds |
|---|---|---|
| **SuperGrok Heavy** | $300/mo | xAI's own top consumer tier; Grok Bot included |
| **Cursor Ultra** | $200/mo | Bot's own cloud computer, tool sign-ins, scheduled routines, desktop + mobile access, extended token limits |
| **Cursor Premium Teams** | $120/seat/mo | Adds centralized billing, the team plugin/skills marketplace, shared usage analytics, SAML/OIDC SSO |

Platforms at launch (2026-08-11, beta): **macOS** (Apple silicon & Intel), **Windows** 10/11 x64, **Linux**
(Debian/Ubuntu x64), **iOS**. **Android**: coming soon, no date. No confirmed dedicated web client — don't
assume the ordinary Grok web app carries Bot features.
([kingy.ai — pricing/platform breakdown](https://kingy.ai/blog/what-is-grok-bot/), cross-checked against
[docs.x.ai](https://docs.x.ai/grok-bot/overview))

Exact weekly usage allowances and Bot/concurrency limits per plan are **not published** — treat any specific
number you see elsewhere as unconfirmed until xAI states it.

## Grok Bot vs OpenClaw vs Hermes Agent

| | **Grok Bot** | **OpenClaw** | **Hermes Agent** |
|---|---|---|---|
| Model | Proprietary (Grok), xAI-hosted | Bring-your-own-model | Model-agnostic |
| Hosting | xAI/Cursor-managed shared cloud computer | Self-hosted, your hardware | Self-hosted / hybrid |
| Cost | $120–$300/mo, bundled into existing plans, no free tier | Free, open source | Free, open source |
| GitHub stars | Closed product, so not comparable | [openclaw/openclaw](https://github.com/openclaw/openclaw) | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) |
| Extends via | Cursor plugin/MCP marketplace, computer use, learned routines | Multi-channel plugins (WhatsApp, Telegram, Slack, Discord) | Skills, tools, memory providers, plugins |
| Best fit | Teams already paying for Cursor/SuperGrok who want an always-on coworker with zero infra to run | Full control, multi-channel personal assistant, zero cost | Background execution, personalization that compounds over time |

<!-- ecosystem:start -->
OpenClaw is at **388,194★** and Hermes Agent at **238,764★**, pulled from the GitHub API on 2026-08-31. Grok
Bot is a closed product with no comparable figure: the largest repo in its third-party ecosystem is xAI's own
marketplace at **200★**, 20 days after launch. Numbers this size move daily, so treat them as a snapshot.
<!-- ecosystem:end -->

## ⭐ Pick of the Week

**[HyperGrok](https://github.com/galleonlabs/hypergrok-trading-desk)** by
[galleonlabs](https://github.com/galleonlabs) — merged this week, and the first entry here that treats a
Bot as staff rather than as a tool. It is seven specialist roles (research, sizing, execution, review and
three more) with full system prompts and sixteen skills for working with Hyperliquid, wired together as a
Trading Floor group chat.

What it does in thirty seconds: point your Bot at `SETUP.md`, let it create the seven Bots and the group
chat, and you have a desk that argues with itself before it does anything. It starts in **research mode**
with no wallet attached, so you can watch the whole thing run before any money is involved.

The reason it is the pick rather than just a good entry: it ships a real `.grok-plugin/` manifest **and**
a root `plugin.json` carrying the canonical Agent Plugins `$schema` — still rare in this ecosystem, where
almost everything is marketplace-only. Its own description is careful to say it is instructions and
resources, not a bot that trades for you. Trading is risky and this does not change that.

Install by pointing your Bot at [`SETUP.md`](https://github.com/galleonlabs/hypergrok-trading-desk/blob/main/SETUP.md).

Last week's pick, [chrome-devtools](https://github.com/ChromeDevTools/chrome-devtools-mcp), remains in the catalog.

*Rotates weekly. Nominate an entry by opening an issue.*

---

## Grok Bot events and community

### Upcoming Grok Bot meetups, workshops and hackathons

<!-- events:start -->
Next 8, soonest first. All 17 upcoming, with hosts, venues and times, are in **[EVENTS.md](EVENTS.md)**.

- **Sep 2** · Nijmegen, NL — [Build with Grok Bot: Nijmegen](https://luma.com/fw7ovtge) *(3 spots left)*
- **Sep 3** · Barranquilla, CO — [Grokbot Hackathon Barranquilla](https://luma.com/lgttu49h)
- **Sep 3** · San Francisco, US — [Grok Bot build night for women](https://luma.com/a16zgrokbotbuildnight)
- **Sep 3** · Villahermosa, MX — [Grok Bot Villahermosa Meetup](https://luma.com/cursor-9mh5)
- **Sep 4** · Pasig, PH — [Grok Bot Meetup Manila](https://luma.com/grok-bot-manila-01)
- **Sep 4** · Singapore, SG — [Grok Bot Meetup Singapore](https://luma.com/grokbotsg) *(1 spot left)*
- **Sep 4** · Online — [Grok Bot Meetup Istanbul (Online)](https://luma.com/grok-bot-istanbul)
- **Sep 5** · Vadodara, IN — [Grok Bot Meetup Vadodara](https://luma.com/grokbot-vad-1)
<!-- events:end -->

### Where the Grok Bot community talks

- [Cursor Community Forum, `grok-bot` tag](https://forum.cursor.com/tag/grok-bot) — where Grok Bot bug reports, plugin OAuth failures, feature requests and every meetup above get posted.
- [Cursor Discord](https://discord.gg/cursor) — 38,000+ members, real-time chat with the people using it.
- [r/cursor](https://www.reddit.com/r/cursor/) — release chatter, setups and workflows.
- [Cursor Community events calendar](https://luma.com/cursorcommunity) — every meetup worldwide, Grok Bot and otherwise, as it gets scheduled.

---

## The catalog: Grok Bot skills, plugins and MCP

<!-- coverage:start -->
| What an entry ships | Entries |
|---|---:|
| `.grok-plugin/` manifest, the format Grok Bot loads | 19 |
| `.cursor-plugin/` manifest, so it also loads in Cursor | 19 |
| `.claude-plugin/` manifest, so it also loads in Claude Code | 15 |
| `.codex-plugin/` manifest, so it also loads in Codex | 7 |
| `plugin.json` on the open Agent Plugins standard | 6 |
| An MCP server component | 26 |
| `SKILL.md` skills and no plugin manifest | 11 |

Read from each repository's own file tree on 2026-08-31. Marketplace entries are read at the commit xAI pins, not at HEAD.
<!-- coverage:end -->

<!-- catalog:start -->
### Grok Bot skills

- [botskills](https://github.com/PramodDutta/botskills) by [PramodDutta](https://github.com/PramodDutta) — paste-ready `BOT.md` setups for Grok Bot and Rakazo; every listing declares the one irreversible action it never takes without you. **[beta]**
- [botteams](https://github.com/ellelion/botteams) by [ellelion](https://github.com/ellelion) — fifteen company teams as single markdown files: one installer prompt creates the named Bots, the group chat and the routines. **[beta]**
- [grok-bot-profiles](https://github.com/HAEGONG/grok-bot-profiles) by [HAEGONG](https://github.com/HAEGONG) — spec writer, bug reproducer, PR producer and PR verifier as separate Bots, each with an explicit point where its authority ends. **[beta]**
- [grok-bot-skill](https://github.com/adamanz/grok-bot-skill) by [adamanz](https://github.com/adamanz) — list, message and create Grok Bots from the terminal using the local desktop session, no token copying. **[beta]**
- [grok-bot-super](https://github.com/AgentMindCloud/grok-bot-super) by [AgentMindCloud](https://github.com/AgentMindCloud) — community skill library (daily standup, email triage, meeting-to-actions, research brief, weekly review, X-thread builder). Archived upstream on 2026-08-17 and no longer maintained; the skills still work, but nothing here will be fixed. **[beta]**
- [grok-bot-templates](https://github.com/cobusgreyling/grok-bot-templates) by [cobusgreyling](https://github.com/cobusgreyling) — scored operating contracts (job, never-list, L1 default, CI). Paste START.md, tap a team. **[beta]**
- [grokbot-for-gtm](https://github.com/bcharleson/grokbot-for-gtm) by [bcharleson](https://github.com/bcharleson) — numbered outbound motion for a Bot: intake, sending infrastructure, list build, email, LinkedIn, reply handling, daily ops. **[beta]**
- [grokbot-imessage-skill](https://github.com/jeffhuber/grokbot-imessage-skill) by [jeffhuber](https://github.com/jeffhuber) — read, triage, search and send iMessages on macOS via a local, privacy-first launchd helper (no cloud sync). **[beta]**
- [grokmd](https://github.com/Aiworkflow360/grokmd) by [Aiworkflow360](https://github.com/Aiworkflow360) — twenty `GROK.md` character files written from primary sources, plus the spec and review checklist for writing your own. **[beta]**
- [HyperGrok](https://github.com/galleonlabs/hypergrok-trading-desk) by [galleonlabs](https://github.com/galleonlabs) — seven-agent Hyperliquid trading desk for Grok Bot: research, size, execute, review. **[beta]**
- [overnight](https://github.com/Archive228/overnight) by [Archive228](https://github.com/Archive228) — six-bot crew for sourced short-form video, with one role per boundary and a human gate before anything publishes. **[experimental]**
- [thin-grok-bot-deep-work-on-cli](https://github.com/Luca-Blight/thin-grok-bot-deep-work-on-cli) by [Luca-Blight](https://github.com/Luca-Blight) — keeps the Bot mesh for routing and hands long builds to Cursor CLI, Cursor cloud agents or the grok CLI. **[beta]**
- [werewolf-gamemaster](https://github.com/Heyvhuang/werewolf-gamemaster) by [Heyvhuang](https://github.com/Heyvhuang) — one Bot runs a stateful game of Werewolf: roles and night actions stay in 1:1 chats, turn tokens stop out-of-order replies. **[experimental]**

### Grok Bot plugins and MCP servers

- [agentcouch](https://github.com/stoyan-stoyanov/agentcouch-plugins) by [AgentCouch](https://agentcouch.dev) — hosted messaging rooms for Grok Bot to talk with other people's agents across clients and machines. **[production]**
- [campfiresms-grok-bot](https://github.com/campfiresms/campfiresms-grok-bot) by [CampfireSMS](https://github.com/campfiresms) — hosted SMS bridge over five MCP tools plus a safety skill, on one revocable phone-bound credential. **[beta]**
- [GrokBotfun](https://github.com/GrokBotfun/GrokBotfun) by [GrokBotfun](https://github.com/GrokBotfun) — deploy pump.fun tokens from your agent; ships an MCP server plus a Cursor-marketplace-format plugin (not the open agent-plugins.org spec, despite the repo description). **[experimental]**
- [imagine-mcp](https://github.com/Archive228/imagine-mcp) by [Archive228](https://github.com/Archive228) — remote MCP for xAI image, video and speech generation that returns a persistent blob URL and a per-call cost receipt. **[beta]**
- [mcp-fetch-worker](https://github.com/jkpe/mcp-fetch-worker) by [jkpe](https://github.com/jkpe) — one `http_fetch` MCP tool behind Cloudflare Access, so a Bot reaches your self-hosted APIs on a scoped token you can revoke. **[beta]**
- [nexfade-grok-plugin](https://github.com/NexFade/nexfade-grok-plugin) by [NexFade](https://github.com/NexFade) — one-time encrypted share links: the file is encrypted on the Bot's computer and only ciphertext leaves it. **[beta]**
- [orgx-grokbot-plugin](https://github.com/useorgx/orgx-grokbot-plugin) by [OrgX](https://useorgx.com) — OrgX MCP wiring, initiative-aware skills and specialist agent packs, packaged in Cursor's `.grok-plugin` manifest format. **[beta]**
- [recallsmith](https://github.com/koreysmith123/recallsmith) by [koreysmith123](https://github.com/koreysmith123) — private experiential memory per Bot on local embeddings and pgvector, installed by handing a new Bot the repo URL. **[experimental]**
- [tesla-fleet-mcp](https://github.com/supervised-nl/tesla-fleet-mcp) by [supervised-nl](https://github.com/supervised-nl) — Tesla Fleet API over Streamable HTTP; climate, charge and lock need Tesla's own proxy and a virtual key on the car. **[beta]**
- [yourai-context-plugin](https://github.com/Melade-Inc/yourai-context-plugin) by [Melade](https://github.com/Melade-Inc) — read-only hosted connector for an organization's published knowledge library and the user's own recent computer activity. **[beta]**

#### Official xAI plugin marketplace

<!-- marketplace:start -->
xAI runs an [official plugin marketplace](https://github.com/xai-org/plugin-marketplace) — 21 vendor plugins in
`.grok-plugin` format, the same plugin surface Grok Bot inherits under Cursor's plugin/MCP policy. All
21 are listed below, each resolved at the exact commit the marketplace pins.
<!-- marketplace:end -->

- [axiom](https://github.com/axiomhq/skills) by [Axiom](https://github.com/axiomhq) — query logs and metrics in APL, run SRE investigations, build dashboards and manage monitors. **[production]**
- [base44](https://github.com/base44/skills) by [Base44](https://github.com/base44) — build and deploy Base44 full-stack apps through the CLI and the JavaScript/TypeScript SDK. **[production]**
- [browser-use](https://github.com/browser-use/plugins) by [Browser Use](https://github.com/browser-use) — give the Bot a real browser, either the user's own Chrome with its logins or an isolated cloud one. **[production]**
- [chrome-devtools](https://github.com/ChromeDevTools/chrome-devtools-mcp) by [Chrome DevTools](https://github.com/ChromeDevTools) — drive and inspect a live Chrome: performance traces, network requests, source-mapped console errors. **[production]**
- [cloudflare](https://github.com/cloudflare/skills) by [Cloudflare](https://github.com/cloudflare) — manage Workers, KV, R2, DNS and deployments from the agent. **[production]**
- [exa](https://github.com/exa-labs/exa-grok-plugin) by [Exa](https://github.com/exa-labs) — real-time web search that reads the pages it finds and answers with current sources. **[production]**
- [figma](https://github.com/figma/mcp-server-guide) by [Figma](https://github.com/figma) — read designs, variables and components straight out of Figma files. **[production]**
- [firecrawl](https://github.com/firecrawl/firecrawl-grok-plugin) by [Firecrawl](https://github.com/firecrawl) — turn any site into clean markdown or structured data: search, scrape, map, crawl and extract. **[production]**
- [mongodb](https://github.com/mongodb/agent-skills/tree/HEAD/plugins/mongodb) by [MongoDB](https://github.com/mongodb) — connect any self-managed MongoDB deployment through its own MCP server using your connection string. **[production]**
- [mongodb-atlas](https://github.com/mongodb/agent-skills/tree/HEAD/plugins/mongodb-atlas) by [MongoDB](https://github.com/mongodb) — the managed Atlas half: sign in to explore data and manage clusters, projects, users and network access. **[production]**
- [neon](https://github.com/xai-org/plugin-marketplace/tree/HEAD/external_plugins/neon) by [Neon](https://neon.com) — Neon Serverless Postgres: manage projects and databases, pick a connection method, branch for migration testing. **[production]**
- [netlify](https://github.com/netlify/context-and-tools) by [Netlify](https://github.com/netlify) — serverless and edge functions, Blobs storage, managed Postgres, forms, caching and the Netlify CLI. **[production]**
- [pstack](https://github.com/cursor/plugins/tree/HEAD/pstack) by [Cursor](https://github.com/cursor) — agent playbooks for investigation, design, review, verification and parallel subagent work. **[production]**
- [railway](https://github.com/railwayapp/railway-skills/tree/HEAD/plugins/railway) by [Railway](https://github.com/railwayapp) — deploy services, read build logs and manage environment variables. **[production]**
- [sentry](https://github.com/getsentry/plugin-grok) by [Sentry](https://github.com/getsentry) — read error reports, analyze stack traces and search issues by fingerprint from the agent. **[production]**
- [stripe](https://github.com/stripe/ai/tree/HEAD/providers/grok/plugin) by [Stripe](https://github.com/stripe) — payments, subscriptions and billing objects from the agent, test mode included. **[production]**
- [superpowers](https://github.com/obra/superpowers) by [obra](https://github.com/obra) — the largest general skill collection shipped in the marketplace; planning, debugging and writing workflows. **[production]**
- [tavily](https://github.com/tavily-ai/tavily-grok-plugin) by [Tavily](https://github.com/tavily-ai) — web search, content extraction, crawling and deep research over a hosted MCP server with OAuth. **[production]**
- [tinyfish](https://github.com/tinyfish-io/tinyfish-web-agent-integrations/tree/HEAD/grok) by [TinyFish](https://github.com/tinyfish-io) — goal-driven browser automation on live sites, including authenticated ones, via saved browser profiles. **[production]**
- [vercel](https://github.com/vercel/vercel-plugin) by [Vercel](https://github.com/vercel) — manage deployments, check build status, read logs, configure domains. **[production]**
- [wix](https://github.com/wix/skills) by [Wix](https://github.com/wix) — build, manage and deploy Wix sites and apps: eCommerce, CMS and dashboard extensions. **[production]**
- [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) by [xAI](https://github.com/xai-org) — the official marketplace itself: the vendor set above plus the `.grok-plugin` manifest format they all use. **[production]**

### Self-hosted Grok Bot alternatives, runtimes and bridges

- [foreman](https://github.com/Archive228/foreman) by [Archive228](https://github.com/Archive228) — declares a Bot crew in git, reconciles it against the account, and reports where work stopped, repeated or waited on you. **[beta]**
- [grok-bot-cli](https://github.com/ScriptedAlchemy/grok-bot-cli) by [ScriptedAlchemy](https://github.com/ScriptedAlchemy) — `gbot`: create, update, message and inspect Bots, groups and threads from the terminal on the macOS app's own session. **[beta]**
- [grok-bot-discord](https://github.com/davefmurray/grok-bot-discord) by [davefmurray](https://github.com/davefmurray) — Discord Gateway bridge so a Bot shows online and wakes on `@mention`, with fail-closed guild, channel and author allowlists. **[beta]**
- [grok-bot-flake](https://github.com/jordangarrison/grok-bot-flake) by [jordangarrison](https://github.com/jordangarrison) — Nix flake that repackages the official Linux `.deb` (no source build). **[experimental]**
- [grok-bot-for-linux-and-android](https://github.com/1nc0gn30/grok-bot-for-linux-and-android) by [1nc0gn30](https://github.com/1nc0gn30) — unofficial client covering the two seats xAI does not ship, with a workspace on your own machine and LAN phone pairing. **[experimental]**
- [grok-bot-setup](https://github.com/BlockedPath/grok-bot-setup) by [BlockedPath](https://github.com/BlockedPath) — adapters CLI and custom model-provider bridges (DeepSeek, Claude, Grok, OpenAI). **[beta]**
- [grok-bot-usage](https://github.com/Kargatharaakash/grok-bot-usage) by [Kargatharaakash](https://github.com/Kargatharaakash) — `gbu`: weekly usage and on-demand spend for several Cursor accounts in one terminal, zero dependencies. **[beta]**
- [grok-codex-router](https://github.com/IgorWarzocha/grok-codex-router) by [IgorWarzocha](https://github.com/IgorWarzocha) — routes Bot inference to a ChatGPT Codex subscription by patching the VM; the author warns it can break installs or get an account restricted. **[experimental]**
- [grokbot-shim](https://github.com/codeaashu/grokbot-shim) by [codeaashu](https://github.com/codeaashu) — runs the installed Grok Bot app against a local host runtime, a local Chrome/XFCE desktop and Codex or OpenAI-compatible models. **[experimental]**
- [guaca](https://github.com/madebywelch/guaca) by [madebywelch](https://github.com/madebywelch) — local desktop app where a crew of agents message each other in their own worktrees; everything runs on your machine. **[beta]**
- [omarchy-grok-bot](https://github.com/glorics/omarchy-grok-bot) by [glorics](https://github.com/glorics) — Omarchy bar widget that launches and focuses the Grok Bot Linux client and fetches newer AppImages. **[experimental]**
- [open-grok-bot](https://github.com/Anil-matcha/open-grok-bot) by [Anil-matcha](https://github.com/Anil-matcha) — local-first bot workspace on FastAPI and Next.js with a deny-by-default action gateway and an audit trail. **[experimental]**
- [open-grokbot](https://github.com/ishandutta2007/open-grokbot) by [ishandutta2007](https://github.com/ishandutta2007) — self-hosted multi-agent platform with persistent sandboxes and demonstration-based learning, `docker compose up`. **[beta]**
- [OpenGrokBot](https://github.com/wolfqing/OpenGrokBot) by [wolfqing](https://github.com/wolfqing) — self-hosted, open-source Grok Bot alternative assembled from OpenClaw plus any model you bring; your hardware, your credentials. **[beta]**
- [sand](https://github.com/alokwhitewolf/sand) by [alokwhitewolf](https://github.com/alokwhitewolf) — unofficial terminal bridge to message your Bots from the CLI, since Grok Bot doesn't ship one. **[experimental]**
- [XinyunOpenBot](https://github.com/dongpen-max/XinyunOpenBot) by [dongpen-max](https://github.com/dongpen-max) — Chinese-first desktop alternative with OpenAI-compatible relay endpoints, a cloud desktop and per-bot voices. **[beta]**

### Grok Bot guides and tutorials

- [grok-bot-info](https://github.com/Uncle-Gizmo/grok-bot-info) by [Uncle-Gizmo](https://github.com/Uncle-Gizmo) — public notes on what Grok Bot is for, safe example workflows, and how it fits alongside Grok Build and Grok Heavy. **[guide]**
- [grok-bot-intro-v2](https://github.com/520xiaomumu/grok-bot-intro-v2) by [520xiaomumu](https://github.com/520xiaomumu) — 12-chapter Chinese-language autoplay intro deck. **[guide]**
<!-- catalog:end -->

## Cross-reference

<!-- crossref:start -->
If Grok Bot's plugin ecosystem moves onto the open standard, those plugins will be interoperable with every
other launch client. Track that standard at our sister list:
**[ZeroPointRepo/awesome-agent-plugins](https://github.com/ZeroPointRepo/awesome-agent-plugins)** — 48 verified
Agent Plugins across ChatGPT, Codex, Cursor, GitHub Copilot, Kiro and VS Code.
<!-- crossref:end -->

## 🛡️ Security notice

This is a **curated list, not an audit**. A "beta" or "production" tag means the repo is real and functional
at the time it was checked — it is not a safety review. Several entries above ask for real credentials
(private keys, tool sign-ins, local message-database access): read the code before you grant anything,
exactly as you would for any browser extension or CLI tool. Some entries patch the Grok Bot app itself or
drive undocumented internals; those say so on their own line, and they can break on any update. **The Grok
Bot ecosystem opened on 2026-08-11** — expect churn, expect some of these repos to disappear or go stale
fast, and expect this list to change quickly along with it.

## 🤝 Contributing

PRs are very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the format and the acceptance rules.

---

## Related lists

Sister lists, same standard, same maintainer. Each one covers a different agent ecosystem.

- [awesome-hermes-skills](https://github.com/ZeroPointRepo/awesome-hermes-skills): skills, plugins, agent profiles and memory providers for Hermes Agent.
- [awesome-agent-plugins](https://github.com/ZeroPointRepo/awesome-agent-plugins): plugins on the open Agent Plugins standard, every entry checked for a real `plugin.json`.
- [awesome-dsh-plugins](https://github.com/ZeroPointRepo/awesome-dsh-plugins): DeepSeek Harness plugins organized by what they do, every install command re-checked weekly by CI.
- [awesome-fx-skills](https://github.com/ZeroPointRepo/awesome-fx-skills): skills, MCP servers and subagents for Vercel's fx coding agent, every install command machine-checked weekly.
- [awesome-cursor-plugins](https://github.com/ZeroPointRepo/awesome-cursor-plugins): Cursor plugins from the official marketplace, including the ten that also ship a `.grok-plugin` manifest and therefore load in a Bot.
- [awesome-praxist-plugins](https://github.com/ZeroPointRepo/awesome-praxist-plugins): Praxist plugins for Sapient's autonomous research system, every row carrying the kind, stability and API key read straight out of its manifest.

---

<p align="center">
Maintained by <a href="https://github.com/ZeroPointRepo">ZeroPointRepo</a> · list content licensed
<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · Built with <a href="https://crhq.ai">crhq.ai</a>
<br />
<sub>This is an unofficial, community-maintained list. It is not affiliated with or endorsed by xAI/SpaceXAI
or Cursor.</sub>
</p>
