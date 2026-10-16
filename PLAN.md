# Datacentre Tycoon: Project Plan

Context file for Claude Code. Read this fully before writing any code, and re-read it at the start of each session.

## What we're building

A browser-based datacentre/hosting tycoon. The player starts with an empty room and a bit of cash, then builds racks, power, cooling and networking, signs customer contracts, hires staff and survives incidents.

It blends three genres:
- **Management sim:** grid placement, staff, incidents (RollerCoaster Tycoon style)
- **Business/logistics:** buying hardware, contracts, power and bandwidth supply, a market that changes
- **IT theme:** real concepts (racks, PDUs, cooling, uptime, SLAs)

Goal of the project: fun and learning. No deadline, no shipping pressure. Scope can wander, but each milestone must be playable before moving on.

## Hard constraints

- **Claude must be able to build everything from text prompts.** No hand-made art, no binary assets, no external model files.
- All visuals are low-poly primitives (boxes, cylinders, planes) generated in code. This is the art style, not a compromise.
- Look: 2D-ish top-down feel but genuinely 3D. Orthographic camera at a steep angle, slight rotation allowed.
- Runs in a normal browser with no backend. Save/load uses localStorage.

## Tech stack

- Vite + TypeScript (strict mode)
- Three.js for rendering
- Vitest for tests on the simulation
- No UI framework to start. Plain DOM overlay for HUD and menus. Revisit only if the UI gets painful.

## Architecture rule (most important)

**The simulation must be completely separate from the renderer.**

```
src/
  sim/        pure TypeScript, NO Three.js or DOM imports
    state.ts      GameState type and initial state
    tick.ts       advances the sim by one tick
    economy.ts    money, income, costs
    power.ts      power draw and supply
    heat.ts       heat and cooling
    contracts.ts  customers and contracts
    staff.ts      staff and incidents
    rng.ts        seeded random so tests are repeatable
    progression.ts  XP, levels, unlock checks (engine only, no content)
    content/      DATA ONLY: tiers, unlocks, goals, achievements (see Extensibility)
  render/     Three.js only, reads GameState, never mutates it
    scene.ts, camera.ts, grid.ts, models.ts
  input/      mouse and keyboard, turns input into sim commands
  ui/         HUD, build menu, panels
  main.ts     wires everything together
tests/        Vitest tests for sim/
```

Rules:
- Player actions go through commands (e.g. `placeRack(x, y)`) that the sim validates and applies. The renderer and UI never edit state directly.
- Sim runs on a fixed tick (e.g. 1 tick = 1 game minute), independent of frame rate.
- Every sim module gets tests. If a feature can't be tested headless, the architecture has drifted.
- Game balance numbers live in one `config.ts`, not scattered through code.

## Core game loop

1. Spend money on hardware and infrastructure
2. Hardware hosts customers, customers pay recurring income
3. More load means more power draw and more heat
4. Limits (power cap, cooling, space) force the player to make choices
5. Failures and incidents punish bad planning
6. Profit funds expansion

## Milestones

Plan 1 to 3 in detail now. Replan 4 onwards after finishing 3, because the details will be wrong by then.

### Milestone 1: The room ✅ (done 2026-10-16)
- Vite + TS + Three.js project set up
- Orthographic camera, steep angle, pan and zoom
- Grid floor, hover highlight on the tile under the cursor
- Click to place a rack (box), click again to remove
- Sim/render split in place from day one, with a first test

**Done when:** I can open the page, place and remove racks on a grid, and the state lives in `sim/`.

### Milestone 2: Money ✅ (done 2026-10-16)
- Fixed tick loop, pause and speed controls (1x, 2x, 4x)
- Starting cash, rack purchase cost, per-tick running costs
- Each rack earns income
- HUD showing cash, income per tick, current day

**Done when:** I can build racks, watch money tick up, go broke if I overspend.

### Milestone 3: Constraints ✅ (done 2026-10-16)
- Power: total supply vs total draw, build power units to raise supply
- Heat: racks produce heat, cooling units remove it, overheating racks fail
- Visual feedback: tile heat overlay, power bar, warnings
- Failed racks stop earning and need repair

**Done when:** careless building causes real problems and the player has to plan layout.

### Milestone 4: Progression (XP, levels, unlocks) ✅ (done 2026-10-16)
Built right after the constraints work, so every later feature plugs into it instead of being retrofitted.
- XP, level, and unlock systems in `sim/progression.ts`, fully tested
- Level-up curve and XP rewards all in `config.ts`
- A single unlock table: each item (rack type, cooling type, building, mechanic) has a required level
- Locked items show greyed out in the build menu with "Unlocks at level X"
- HUD XP bar, level-up popup showing what just unlocked
- Milestone goals system: a list of objectives with rewards (see Progression design below)
- All content defined as data in `src/sim/content/`, with a validation test, versioned saves, and `docs/ADDING_CONTENT.md` (see Extensibility below)
- Prove it works: add one extra dummy tier and goal purely via data files, with no engine code changes, then remove or keep it

**Done when:** I can earn XP by playing, level up, and see new things unlock.

### Later milestones (outline only, replan before starting)
5. ✅ (done 2026-10-16) Local save/load: versioned saves in localStorage, export/import save file, settings. Done early because progression needs persistence.
6. Customers and contracts: demands, payouts, SLA penalties, gated by level
7. Staff and random incidents
8. Hardware tiers, upgrades, research
9. Accounts and cloud saves (see Accounts and cloud saves below)
10. Tutorial hints, polish: sound, particles, UI cleanup, balance pass

## Progression design

This is the draft, and the numbers are placeholders to tune by playing.

### XP sources
XP comes from doing things that matter, not from grinding one action:
- Completing a goal or objective (biggest source)
- Fulfilling a contract successfully
- Reaching new uptime or profit records
- First time doing something (first rack, first cooling unit, first hire)
- Surviving an incident
- Small trickle for building, capped so spamming racks does not level you

Rule: no repeatable action may give unlimited XP. Use diminishing returns or one-time bonuses.

### Level curve
Early levels come fast (a level every few minutes), later ones slow down. Example shape: XP needed = base * level^1.5. Tune in `config.ts`.

### Tiers (groups of levels, each one changes how the game plays)
| Levels | Tier | Main new problem | Examples of unlocks |
|---|---|---|---|
| 1-5 | Server closet | Power and heat basics | Basic racks, fans, first power unit, small contracts |
| 6-12 | Small hosting company | Customers and contracts | Contract board, better cooling, network gear, first staff |
| 13-20 | Regional datacentre | Reliability and people | SLAs, backup power, incidents, security hires |
| 21-30 | Enterprise | Scale and competition | Big contracts, compliance, rival companies, research tree |
| 31+ | Hyperscale | Optimisation and prestige | Mega-halls, custom hardware, prestige reset |

Each tier must add a new kind of problem, not just bigger numbers.

### Goals and milestones
- A visible list of 3 to 5 active goals at any time, each with an XP and cash reward
- Examples: "Run 10 racks", "Hit 99% uptime for 7 days", "Earn 50k total", "Survive a power outage"
- Completing goals reveals the next goals, so there is always a clear next target
- Achievements for one-off bragging rights, separate from the goal list

### Unlock rules
- Everything beyond the starting kit is gated by level (and sometimes by research once that exists)
- Unlocks come in two types: new items (things to buy) and new mechanics (new systems appear)
- Mechanics unlocking is the important part. Tier changes should feel like the game opening up

### Extensibility (hard requirement)
I will keep adding progression after reaching the top, so adding content must never need engine changes.

- **All progression content is data, not code.** Tiers, level thresholds, unlocks, goals, achievements and XP rewards live in plain data files under `src/sim/content/` (e.g. `tiers.ts`, `unlocks.ts`, `goals.ts`, `achievements.ts`). Adding a new tier or goal means adding an entry to a file, nothing else.
- **No hardcoded max level.** The level curve is a formula that works at any level. Content simply runs out at some point, and the game must handle that gracefully (XP bar keeps working, a "more coming soon" or endless mode state instead of a crash).
- **Unlocks are referenced by id.** Each unlockable thing has a stable string id (`rack_basic`, `cooling_liquid`). The unlock table maps id to required level, and the build menu, tooltips and level-up popup all read from it.
- **Goals use a small condition system.** Each goal is `{ id, description, condition, reward }` where `condition` is a typed object like `{ type: 'rackCount', min: 10 }` or `{ type: 'uptimeDays', min: 7, percent: 99 }`. Adding a new condition type is one small function plus one test. Existing goals never change.
- **Endless layer after the top tier.** Plan for a repeatable layer once content runs out: prestige/reset with permanent bonuses, procedurally generated goals that scale with level, or "legacy" ranks. Pick one when I get there, but the structure must not block it.
- **Saves survive content updates.** Save files store a version number and only store ids and numbers (never copies of content definitions). On load, unknown ids are ignored, new content is applied, and a migration step handles any format changes. Adding new levels or tiers must not wipe or break an existing save.
- **Content validation test.** A Vitest test checks all content on every run: unique ids, no unlock pointing at a missing item, level thresholds strictly increasing, every goal condition type is implemented, every reward is valid. A bad data entry should fail the tests, not the game at runtime.
- **Adding content is a documented recipe.** Claude Code must add a short `docs/ADDING_CONTENT.md` in Milestone 4 explaining, with an example, how to add a new tier, unlock, goal and achievement.

### Tradeoffs that keep unlocks meaningful
- Better hardware costs more power, heat or upkeep, so it is not strictly better
- Big contracts pay well but punish failure hard
- Levels give options, not just power

## Hosting and deployment

- The frontend is a static Vite build, deployed to **GitHub Pages** by `.github/workflows/deploy.yml` on every push to `main` (it runs the tests first, so a failing test blocks the deploy).
- Repo: https://github.com/maxhoylestrode/DataCentre-Tycoon. Live URL: https://maxhoylestrode.github.io/DataCentre-Tycoon/
- Deploy right after Milestone 1 and keep it deployed, so I can play on my phone and catch build problems early.
- Pick the permanent URL early. Set Vite's `base` correctly if not hosted at a domain root.

## Accounts and cloud saves

Goal: log in and play the same game from any device.

**Backend: Supabase** (auth + Postgres, free tier). The static frontend talks to it directly with the Supabase JS client, so there is no custom server to write or host.

Design:
- **Local-first.** The game always plays from local state and works offline. Cloud sync is an add-on, never a requirement to play. Guests can play without an account and link an account later without losing progress.
- **Auth:** email + password and/or magic link to start. OAuth (Google/GitHub) optional later.
- **One table:** `saves` with `user_id`, `slot`, `save_version`, `data` (jsonb), `updated_at`, plus a client-side `device_id`. Multiple slots allowed, start with one.
- **Row Level Security on from day one:** a user can only read and write their own rows. Test this explicitly.
- **Save format is the same versioned JSON blob as local saves** (ids and numbers only, see Extensibility). The cloud stores it as-is, and the existing migration step handles old versions.
- **Sync rules:** on login, compare `updated_at` of local vs cloud. If they differ and both have progress, show a clear "Use cloud save / Use this device / Keep both as slots" choice. Never silently overwrite. Autosave to cloud on a throttled timer (e.g. every 30 to 60 seconds) and on tab close.
- **Trust model:** this is single player, so the client is trusted. No anti-cheat. Do not build server-side validation.
- **Keys and secrets:** only the public anon key goes in the frontend. Never commit the service role key. Keep config in env vars with a `.env.example`.
- **Don't build this before Milestone 5.** Local save/load must be solid and versioned first, because cloud sync is just that blob moved to a database.

Done when: I can create an account, play on one device, log in on another and continue exactly where I left off, with conflicts handled safely.

## Working agreement for Claude Code

- Build one milestone at a time. Do not start the next until I confirm the current one works.
- At the start of each milestone, give a short plan (files to create or change) before coding.
- Run tests and the build before saying something is done.
- Prefer boring and simple over clever. No premature abstractions.
- If a decision affects architecture or game feel, ask me instead of guessing.
- Keep this file up to date: tick off finished milestones and note any decisions that changed.
- If I ask for something that breaks the sim/render separation, tell me and suggest a cleaner way.

## First prompt to use

> Read PLAN.md fully. Then do Milestone 1 only. Start by giving me a short file-by-file plan, then set up the Vite + TypeScript + Three.js project with the folder structure from the plan, and build the room, grid, camera, and rack placement. Keep the sim in `src/sim/` with no Three.js imports, and add at least one Vitest test for the place/remove rack logic. Run the dev server and tests when done and tell me what to check in the browser.

## Decisions log

(Claude Code: add dated entries here when a decision changes the plan.)

- 2026-10-16: Chose browser + Three.js, datacentre theme, primitives-only art.
- 2026-10-16: Wants accounts and a database to play anywhere. Chose Supabase (auth + Postgres), local-first with cloud sync, built as Milestone 9 after local saves (Milestone 5) are solid.
- 2026-10-16: Progression content must be data-driven and extensible (ids, no max level, versioned saves, validation test) so I can add more tiers and goals later without engine changes.
- 2026-10-16: Added XP/level/unlock progression as Milestone 4, before contracts and staff, so later features are gated by level from the start.
- 2026-10-16: Milestone 1 built and confirmed. Player commands live in `src/sim/commands.ts`, mutate state in place and return `{ ok }` or `{ ok: false, reason }`. `config.ts` sits at `src/config.ts` so sim and render can share it. `tests/architecture.test.ts` fails if `src/sim` imports Three.js, the DOM or render/input/ui code. Vite `base` is `'./'` so the build works at a domain root or in a subfolder.
- 2026-10-16: Milestone 2 built and confirmed. Decisions: new racks ramp from 0 to full income over one game day while paying full upkeep from day one, so overspending can bankrupt you. Cash may go negative down to `overdraftLimit`, and you're bankrupt past it. Purchases still need positive cash. Removing a rack refunds 50%. 1x speed = 10 ticks (game minutes) per real second, so a day lasts 2.4 minutes. Speed and pause live in `GameState`. A balance test in `tests/tick.test.ts` locks in "spend everything on day 1 = bankrupt, spend half = survive".
- 2026-10-16: First balance was impossible: rent (£1/min) was more than a full rack's profit after upkeep, so one rack lost money forever. Retuned to: start £5,000, rack income £2.40/min at full, upkeep £0.80, rent £0.25, overdraft £500. The balance tests now check that one rack is always safe, that keeping one rack's cost in reserve is safe, that spending everything on day 1 bankrupts you, and that a full rack covers its upkeep plus twice the rent.
- 2026-10-16: Milestone 3 built and confirmed. Decisions:
  - Power overload is a brownout. Everything runs at supply/draw efficiency, so income, heat and cooling all scale down; an overload therefore also weakens your cooling.
  - Heat is spatial: per-tile temperature with spreading, leak to ambient, and cooling units that pull tiles within a radius down towards ambient.
  - Racks fail as soon as their tile passes `failTemp`. Repairing costs 25% of a rack and keeps it offline for 3 game hours.
  - `racks` became `buildings` with a `kind` (rack, power or cooling), with every building's numbers in `CONFIG.buildings`.
  - Click-to-toggle was replaced by tools (R/P/C/X). Clicking a failed rack with a build tool repairs it. Tool logic is in `src/input/tools.ts`.
  - Heat numbers were tuned with a throwaway scenario script. The heat balance tests lock in that a lone rack stays cool, an uncooled 3x3 block fails within a day, and two cooling units save it.
- 2026-10-16: Hosting is GitHub Pages instead of Cloudflare Pages/Vercel (user's choice). Vite `base: './'` already works under the `/DataCentre-Tycoon/` subpath. Commits use the GitHub noreply email so the real address stays out of public history.
- 2026-10-16: Built Milestones 5 (saves) and 4 (progression) together, saves first. Both confirmed. Saves went first so that progression state is persisted from the start and the v1 → v2 save migration gets a real test.
  - **Building ids are now permanent**: `rack_basic`, `power_basic`, `cooling_fan`. Each has a `category` (rack, power or cooling) that decides its behaviour, and its own income and cooling numbers in `CONFIG.buildings`, so a new rack type is a pure data addition.
  - **Saves**: `src/sim/save.ts` (pure, versioned, migration chain, unknown ids dropped, invalid fields fall back to defaults). `src/io/storage.ts` handles localStorage and file export/import; a save that fails to load is copied to a `.backup` key before anything else happens. Autosave every 30s, on tab hide and on page close. The ⚙ menu has Save now, Export, Import (with confirmation), an autosave toggle and New game (click twice). Importing reloads the page so the room is rebuilt.
  - **Progression**: `src/sim/progression.ts` is the engine, `src/sim/conditions.ts` holds the goal condition types, and `src/sim/content/` is data only. Level is derived from total XP and never stored, so curve changes apply to old saves. Starting unlocks: Rack at L1, Power unit at L2, Cooling unit and the Heat map mechanic at L3.
  - **XP sources**: goals (main source), achievements (one-off), building (10 XP, capped at 50 per game day) and beating your best day's profit (50 XP).
  - **Popups** are detected in the UI by comparing progress with what it last saw (`src/ui/announcer.ts`), so the sim emits no events.
  - **Extensibility proven**: the Global network tier (L41) and the earn_250k goal were added through data files only; kept. The content test also caught a deliberately broken goal (unknown condition type, missing prerequisite, negative XP), which was then removed.
