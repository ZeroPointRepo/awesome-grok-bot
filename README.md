<p align="center">
  <img src="banner.png" width="800" alt="Awesome Grok Bot" />
</p>

<p align="center">
  <a href="https://awesome.re"><img src="https://awesome.re/badge.svg" alt="Awesome" /></a>
  <img src="https://img.shields.io/badge/entries-19-blueviolet" alt="Entry count" />
  <img src="https://img.shields.io/github/last-commit/ZeroPointRepo/awesome-grok-bot" alt="Last commit" />
  <img src="https://img.shields.io/badge/Grok%20Bot-beta%20(2026--08--11)-informational" alt="Grok Bot status" />
  <img src="https://img.shields.io/badge/status-unofficial-lightgrey" alt="Unofficial, not affiliated with xAI or Cursor" />
  <img src="https://img.shields.io/badge/license-CC%20BY%204.0-lightgrey" alt="License" />
</p>

# Awesome Grok Bot

**A curated, verified directory of 19 Grok Bot skills, plugins, MCP servers and self-hosted alternatives.**
[Grok Bot](https://docs.x.ai/grok-bot/overview) is xAI/SpaceXAI and Cursor's always-on AI teammates, each
with their own persistent cloud computer. It launched in beta on 2026-08-11 and this list has tracked the
ecosystem from day one.

Everything here is checked against a primary source, including the honest read on how Grok Bot is actually
extended, which is not what most write-ups assume. This is an unofficial, community-maintained list and is
not affiliated with or endorsed by xAI/SpaceXAI or Cursor.

---

## Contents

- [What is Grok Bot? (and how do you actually extend it?)](#what-is-grok-bot-and-how-do-you-actually-extend-it)
- [Grok Bot pricing and how to get it](#grok-bot-pricing-and-how-to-get-it)
- [Grok Bot vs OpenClaw vs Hermes Agent](#grok-bot-vs-openclaw-vs-hermes-agent)
- [⭐ Pick of the Week](#-pick-of-the-week)
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
   helped launch five days before Grok Bot shipped, despite one repo's README describing itself as
   "agent-plugins.org spec." xAI's own
   [official plugin marketplace](https://github.com/xai-org/plugin-marketplace) settles it: its manifests live in
   `.grok-plugin/` (`marketplace.json` plus a per-plugin `plugin.json`), and **not one of its 18 published
   plugins carries the open spec's required `$schema`** — we checked every manifest on 2026-08-17. Plugins are
   marketplace bundles of connectors and skills, managed through Cursor-side tools (`SearchPlugins`,
   `InstallPlugin`, `AddMcpServer`, `AuthenticateMcpServer`) and surfaced in
   **App Settings → Plugins → Marketplace / Yours**.

   We'll flip this the moment a real `plugin.json` targeting
   the open spec shows up for Grok Bot — see [awesome-agent-plugins](https://github.com/ZeroPointRepo/awesome-agent-plugins),
   our sister list, which already tracks 33 verified plugins on the open standard.
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
| GitHub stars | Closed product — the open ecosystem *around* it is <48h old, every repo below 3★ | **386,044★** ([openclaw/openclaw](https://github.com/openclaw/openclaw)) | **229,372★** ([NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)) |
| Extends via | Cursor plugin/MCP marketplace, computer use, learned routines | Multi-channel plugins (WhatsApp, Telegram, Slack, Discord) | Skills, tools, memory providers, plugins |
| Best fit | Teams already paying for Cursor/SuperGrok who want an always-on coworker with zero infra to run | Full control, multi-channel personal assistant, zero cost | Background execution, personalization that compounds over time |

Star counts fetched live via the GitHub API at the time of writing — re-check before citing them months later.

## ⭐ Pick of the Week

**[superpowers](https://github.com/obra/superpowers)** by [obra](https://github.com/obra) — the biggest thing
in xAI's official marketplace, and the one worth installing first. It's a large collection of general working
skills — planning a change before touching code, debugging from evidence rather than guesswork, writing that
survives review — rather than an integration with one vendor's API. For a Bot that runs unattended on its own
cloud machine, that matters more than it does in an interactive editor: the failure mode of an always-on agent
is confidently doing the wrong thing for an hour, and most of these skills exist to interrupt exactly that.

Install it from **App Settings → Plugins → Marketplace** and search `superpowers`, or point a client at the
[marketplace repo](https://github.com/xai-org/plugin-marketplace).

*Rotates weekly. Nominate an entry by opening an issue.*

---

## The catalog: Grok Bot skills, plugins and MCP

Format: `- [name](repo-url) by [author](author-url) — one-line description. **[tag]**`
Tags: **production** · **beta** · **experimental** · **guide** (docs/notes, not runnable)

*The community half of this ecosystem is under a week old — most third-party repos below were created
2026-08-11 or 2026-08-12 and still have a handful of stars. The official marketplace plugins are the
exception: those are established vendor tools that xAI has published into `.grok-plugin` format. We label
which is which rather than blurring them together, and empty subsections stay labeled rather than stretched.*

### Grok Bot skills

- [grok-bot-super](https://github.com/AgentMindCloud/grok-bot-super) by [AgentMindCloud](https://github.com/AgentMindCloud) — community skill library (daily standup, email triage, meeting-to-actions, research brief, weekly review, X-thread builder). **[beta]**
- [grokbot-imessage-skill](https://github.com/jeffhuber/grokbot-imessage-skill) by [jeffhuber](https://github.com/jeffhuber) — read, triage, search and send iMessages on macOS via a local, privacy-first launchd helper (no cloud sync). **[beta]**

### Grok Bot plugins and MCP servers

- [GrokBotfun](https://github.com/GrokBotfun/GrokBotfun) by [GrokBotfun](https://github.com/GrokBotfun) — deploy pump.fun tokens from your agent; ships an MCP server plus a Cursor-marketplace-format plugin (not the open agent-plugins.org spec, despite the repo description). **[experimental]**
- [orgx-grokbot-plugin](https://github.com/useorgx/orgx-grokbot-plugin) by [OrgX](https://useorgx.com) — OrgX MCP wiring, initiative-aware skills and specialist agent packs, packaged in Cursor's `.grok-plugin` manifest format. **[beta]**

#### Official xAI plugin marketplace

xAI runs an [official plugin marketplace](https://github.com/xai-org/plugin-marketplace) — 18 vendor plugins in
`.grok-plugin` format, the same plugin surface Grok Bot inherits under Cursor's plugin/MCP policy. A curated
selection follows; browse the marketplace for the full set.

- [chrome-devtools](https://github.com/ChromeDevTools/chrome-devtools-mcp) by [Chrome DevTools](https://github.com/ChromeDevTools) — drive and inspect a live Chrome: performance traces, network requests, source-mapped console errors. **[production]**
- [cloudflare](https://github.com/cloudflare/skills) by [Cloudflare](https://github.com/cloudflare) — manage Workers, KV, R2, DNS and deployments from the agent. **[production]**
- [figma](https://github.com/figma/mcp-server-guide) by [Figma](https://github.com/figma) — read designs, variables and components straight out of Figma files. **[production]**
- [mongodb](https://github.com/mongodb/agent-skills) by [MongoDB](https://github.com/mongodb) — query collections, inspect schemas and manage Atlas clusters. **[production]**
- [railway](https://github.com/railwayapp/railway-skills) by [Railway](https://github.com/railwayapp) — deploy services, read build logs and manage environment variables. **[production]**
- [stripe](https://github.com/stripe/ai) by [Stripe](https://github.com/stripe) — payments, subscriptions and billing objects from the agent, test mode included. **[production]**
- [superpowers](https://github.com/obra/superpowers) by [obra](https://github.com/obra) — the largest general skill collection shipped in the marketplace; planning, debugging and writing workflows. **[production]**
- [vercel](https://github.com/vercel/vercel-plugin) by [Vercel](https://github.com/vercel) — manage deployments, check build status, read logs, configure domains. **[production]**
- [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) by [xAI](https://github.com/xai-org) — the official marketplace itself: 18 vendor plugins plus the `.grok-plugin` manifest format they all use. **[production]**

### Self-hosted Grok Bot alternatives, runtimes and bridges

- [grok-bot-flake](https://github.com/jordangarrison/grok-bot-flake) by [jordangarrison](https://github.com/jordangarrison) — Nix flake that repackages the official Linux `.deb` (no source build). **[experimental]**
- [grok-bot-setup](https://github.com/BlockedPath/grok-bot-setup) by [BlockedPath](https://github.com/BlockedPath) — adapters CLI and custom model-provider bridges (DeepSeek, Claude, Grok, OpenAI). **[beta]**
- [OpenGrokBot](https://github.com/wolfqing/OpenGrokBot) by [wolfqing](https://github.com/wolfqing) — self-hosted, open-source Grok Bot alternative assembled from OpenClaw plus any model you bring; your hardware, your credentials. **[beta]**
- [sand](https://github.com/alokwhitewolf/sand) by [alokwhitewolf](https://github.com/alokwhitewolf) — unofficial terminal bridge to message your Bots from the CLI, since Grok Bot doesn't ship one. **[experimental]**

### Grok Bot guides and tutorials

- [grok-bot-info](https://github.com/Uncle-Gizmo/grok-bot-info) by [Uncle-Gizmo](https://github.com/Uncle-Gizmo) — public notes on what Grok Bot is for, safe example workflows, and how it fits alongside Grok Build and Grok Heavy. **[guide]**
- [grok-bot-intro-v2](https://github.com/520xiaomumu/grok-bot-intro-v2) by [520xiaomumu](https://github.com/520xiaomumu) — 12-chapter Chinese-language autoplay intro deck. **[guide]**

## Cross-reference

If Grok Bot's plugin ecosystem moves onto the open standard (see above — it hasn't, as of this writing),
those plugins will be interoperable with every other launch client. Track that standard at our sister list:
**[ZeroPointRepo/awesome-agent-plugins](https://github.com/ZeroPointRepo/awesome-agent-plugins)** — 33 verified
Agent Plugins across ChatGPT, Codex, Cursor, GitHub Copilot, Kiro and VS Code.

## 🛡️ Security notice

This is a **curated list, not an audit**. A "beta" or "production" tag means the repo is real and functional
at the time it was checked — it is not a safety review. Several entries above ask for real credentials
(private keys, tool sign-ins, local message-database access): read the code before you grant anything,
exactly as you would for any browser extension or CLI tool. **The Grok Bot ecosystem is under 48 hours old at
the time of writing** — expect churn, expect some of these repos to disappear or go stale fast, and expect
this list to change quickly along with it.

## 🤝 Contributing

PRs are very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the format and the acceptance rules.

---

## Related lists

Sister lists, same standard, same maintainer. Each one covers a different agent ecosystem.

- [awesome-hermes-skills](https://github.com/ZeroPointRepo/awesome-hermes-skills): skills, plugins, agent profiles and memory providers for Hermes Agent.
- [awesome-agent-plugins](https://github.com/ZeroPointRepo/awesome-agent-plugins): plugins on the open Agent Plugins standard, every entry checked for a real `plugin.json`.
- [awesome-dsh-usecases](https://github.com/ZeroPointRepo/awesome-dsh-usecases): what people actually build with DeepSeek Harness, each entry with a working install command.
- [awesome-fx-skills](https://github.com/ZeroPointRepo/awesome-fx-skills): skills, MCP servers and subagents for Vercel's fx coding agent, every install command machine-checked weekly.

---

<p align="center">
Maintained by <a href="https://github.com/ZeroPointRepo">ZeroPointRepo</a> · list content licensed
<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · Built with <a href="https://crhq.ai">crhq.ai</a>
<br />
<sub>This is an unofficial, community-maintained list. It is not affiliated with or endorsed by xAI/SpaceXAI
or Cursor.</sub>
</p>
