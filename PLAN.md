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

### Milestone 6: Customers and contracts
Unlocks at level 6 (the "Small hosting company" tier) as the `contract_board` mechanic.
- **Hybrid income:** racks not under contract keep earning walk-in income (with the ramp-up). Contracted racks earn the contract's rate instead, with no ramp-up.
- **Contract board:** 3 offers, replaced at the start of each game day, generated by a seeded RNG (`sim/rng.ts`, seed stored in the save) from customer types in `sim/content/customers.ts`. Each type has a level, and ranges for racks, days, pay multiplier, uptime promise (SLA), bonus and penalty. Bigger customers pay more and punish failure harder.
- **Signing** needs enough uncommitted racks (owned racks minus racks promised to active contracts).
- **Automatic assignment:** each tick, contracts are served from working racks, oldest contract first, taking the newest racks so the fully ramped racks stay on walk-in. Failed racks, racks under repair, too few racks and brownouts all count as downtime.
- **SLA judged over the whole contract:** uptime = served rack-minutes / promised rack-minutes. At the end, uptime at or above the SLA pays the bonus and contract XP; below it costs the penalty. Cancelling early costs the penalty.
- **Content:** customer types are data. New tier 2 goals and achievements use new condition types (`level`, `contractsSigned`, `contractsCompleted`, `contractsFailed`, `activeContracts`, `perfectContracts`).
- **UI:** a Contracts panel (toolbar button, K) showing capacity, active contracts (uptime vs SLA, days left, cancel) and offers (sign). Toasts when a contract ends.
- **Save v3** with a migration from v2. Tests for generation, signing, serving, uptime, end of contract, cancelling, saves and content validation.

**Done when:** after level 6 I can sign contracts, watch their uptime, get paid a bonus for keeping my promises, and get hit by a penalty when overheating or brownouts break them.

### Building upgrades (built 2026-10-16, between Milestones 6 and 7)
- Click any building with a build tool to open its panel: stats now and after the next upgrade, Upgrade, Repair and Sell.
- **Levels 0–10.** The `upgrades` mechanic unlocks at level 2, and the max upgrade level = player level (capped at 10). Each level costs more (`cost × 0.5 × 1.4^level`).
- **Trade-off for racks:** +15% income per level, but also +6% power draw and +6% heat. Power and cooling units just get +15% supply or cooling per level.
- **Data-driven:** each building's `upgrade` block in `CONFIG.buildings`, read through `sim/buildings.ts` (`buildingStats`), so the economy, power, heat and contracts all see upgrades.
- **Selling** refunds 50% of the purchase price plus every upgrade.
- **Contracts** now take the racks that would earn least on walk-in, so upgraded racks keep their walk-in income.
- **Models** show a coloured trim (grey → gold) and one pip per level. Save v4.

### Milestone 7: Hardware, cooling types and looks (built 2026-10-16, awaiting confirmation)
**Built:**
- **5 rack models:** Entry (L1), Performance (L8), Enterprise (L14), GPU compute (L22), Hyperscale pod (L31), each with its own look.
- **Part slots:** CPU, RAM, storage, network, cooling, plus GPU on GPU racks, filled from a 40-part catalogue of real-brand parts (`sim/content/parts.ts`). Part numbers are "adds over stock", which kept the entry rack's balance unchanged. Parts replace rack upgrade levels; power and cooling units keep their levels. v4 rack levels convert to equivalent parts in save v5.
- **Liquid cooling** is the rack cooling slot: rear-door (-35% heat, L12), direct liquid (-60%, L18), immersion (-85%, L30). A Hyperscale pod overheats on air and is fine with immersion (tested).
- **In-row cooler** (L9) and **chiller + floor vents** (L11). Vents are a second floor layer that can sit under racks; a chiller feeds up to 12 within 4 tiles.
- **Prestige** from 6 decorations and room styles (floor, walls, lighting). Each point adds 0.5% contract pay (cap 30%) and +1 daily offer per 25 points (cap +2).
- **UI:** grouped build menu (Racks / Power / Cooling / Decor / Sell), rack part slots in the building panel, Style panel (L), prestige in the HUD.
- **Not built:** hot/cold aisle containment (dropped to keep scope sane; revisit later).

**Original draft (kept for reference):**
The player's ideas: better racks unlocked by level, racks with real specs whose individual parts you upgrade, different cooling types such as floor cooling, and decoration to make the datacentre look good.

**Better rack models** (`CONFIG.buildings`, each with an unlock level), getting more expensive and more power-hungry:
- e.g. Entry server rack (L1, today's rack) → Performance rack (L8) → Enterprise rack (L14) → GPU compute rack (L22) → Hyperscale pod (L31).
- Each has a different base income, power, heat and size feel, plus a different model (taller, glass door, blue/green LED colours). "Better is not strictly better": bigger racks need serious power and cooling.

**Racks with real specs and component slots:**
- Each rack has slots: **CPU, RAM, Storage, Network**, plus **GPU** on GPU racks. Each slot holds a part from a parts catalogue (`sim/content/parts.ts`, data only) with brand, model, specs (cores/GHz, GB, TB, Gbps), and its effect: **+£/min**, plus power and heat.
- **Real brand names, as the user chose:** e.g. CPU: AMD EPYC and Intel Xeon generations; GPU: NVIDIA data-centre cards; RAM: Samsung/Micron ECC; Storage: Samsung/Seagate/WD; Network: Mellanox/Intel NICs. Names only, never logos, plus a small in-game note: "Product names are trademarks of their owners. This game is not affiliated with them."
- The rack panel shows each slot: current part, its specs and £/min, and the next part to upgrade to (cost, unlock level, +£/min). Better parts unlock with level.
- Saves store only part ids per slot, as usual.

**Cooling types** (each a building or attachment, data-driven where possible):
- Fan cooling unit (today's).
- In-row cooler: strong but short range.
- **Raised floor / underfloor cooling:** cooled floor tiles placed *under* racks (a second layer on the grid), cheap per tile but needs a chiller to feed it.
- Liquid cooling: a per-rack attachment that removes most of that rack's heat. Expensive, high level.
- Hot/cold aisle containment as a layout bonus.

**Looks (cosmetics):**
- Floor tile styles, wall colours and finishes, LED strip lighting, cable trays, signage with a company name, plants and a front desk. All procedural primitives, no image files.
- Open question: purely visual, or a small "prestige" bonus (e.g. better contract offers)?

**Decisions to ask before starting:**
1. **Parts vs upgrade levels.** Should rack components replace the generic upgrade levels on racks (power and cooling keep levels), or sit on top of them?
2. **Cosmetics:** pure looks, or a prestige bonus?
3. **Underfloor cooling:** a separate floor layer (more depth, more UI), or simpler "cooled floor" buildings?
4. **Order:** probably racks + parts first, then cooling types, then cosmetics, each playable on its own.

### Milestone 8: Running a real business (built 2026-10-17, awaiting confirmation)
The whole 2026-10-17 backlog (A0–F), built in one go with Claude choosing the open answers ("build all now in the best way you think"). Save v8, with a migration that switches staff and clients on for existing real-size saves.

**A0. Late-game balance.** Costs now grow with size by themselves:
- **Electricity bill** with marginal bands (like tax bands): £0.03 per kW/min up to 60 kW, £0.05 to 150, £0.08 to 400, £0.12 above.
- **Market saturation** on walk-in racks only, for the whole company: past 20 walk-in racks each earns `(20/n)^0.45` as much (floor 30%). The HUD shows it.
- **Contract volume discount:** past 40 racks, new offers pay `(40/racks)^0.45` per rack (floor 45%). It shows in the offer's rate, so nothing is hidden. This stops contracts becoming an unlimited escape from saturation.
- **Hardware ageing** per rack, based on its CPU: -6% earning power per game month, floor 55%. A CPU upgrade or **Refurbish** (30% of rack + CPU price) resets it.
- **Balance bot** (`tests/bot.ts`, `tests/balance.test.ts`): a scripted sensible player runs 30 days with every system on. It must never go bankrupt, income must keep growing, and from day 8 the margin must stay under 40%. Current run: about 25–37% late game.
- Running-cost multiplier eased from 1.43 to 1.3, since the new costs do the braking. Buildings under construction pay no upkeep.

**A. Power, network, cooling.**
- **One internet line for the company** (`content/uplinks.ts`): 100 Mbps → 1, 10, 40, 100, 400 → 800 Gbps, gated by level, each with a buy price and a line rental. Racks use bandwidth in step with their earning power (12 Mbps per £/tick), so every upgrade needs a bit more line. Over the limit counts like a brownout, for income and contract uptime. Click the HUD's Network bar to upgrade.
- Rack parts draw 1.6× the power they did. Cooling-unit levels draw more power too.
- **Chiller levels:** +3 vents per level, +1 range every 3 levels.
- **Room AC unit** (L18): cools the whole room.
- **Power multiblocks:** 4 running units in a 2×2 square give +25% each, stacking with their levels. Selling one breaks the block. Shown with an outline.

**B. Editing.** Q rotates the next placement, or the selected building. Every building stores `rot`, and reception desks queue clients in front. Placing a different wall type on a wall swaps it for the price difference. 6 new decorations.

**C0. Zones.** Paint tiles (drag a rectangle) as Server, Staff or Storage. Zones need their furniture to work: a staff room needs a coffee machine, and each break table houses 4 staff (2 without). Storage needs shelving; without it engineers work 1.5× slower. Server-room racks earn +5%. Zones unlock at L4.

**C. Staff.** Hiring unlocks at L3. Each hire has a fee plus a wage per minute; the founder engineer is free and can't be fired.
- **Engineers** walk to new buildings and build them: about 5–10 s at 1×, longer for bigger racks. Buildings are inactive until finished. Engineers also do repairs (a repaired rack waits for one), and service racks when there's nothing else to do.
- **Technicians** service racks every 3 game days; overdue racks earn 75%.
- More staff than the staff rooms house makes everyone 30% slower.
- No random incidents: maintenance is predictable.

**D. Clients.** Each contract offer is a client who walks in through a **front door** (a new outside-wall item) and queues at a reception desk. Only clients who have arrived can be signed. The desk moved to L6 with the contract board, and the panel says what's missing.

**E. Content.** +35 goals and +16 achievements, with 8 new condition types (`staffCount`, `uplinkMbps`, `multiblocks`, `zoneTiles`, `clientsServed`, `services`, `refurbishes`, `receptionReady`).

**F. UI.**
- A how-to guide (G, opens once on first play).
- A redesigned HUD: cash with a hover breakdown of income and costs, clock and speed control, power and network meters, chips, and coloured warnings.
- Staff panel (T) and network panel.

### Later milestones (outline only, replan before starting)
5. ✅ (done 2026-10-16) Local save/load: versioned saves in localStorage, export/import save file, settings. Done early because progression needs persistence.
8. Staff and random incidents (moved after hardware at the user's request)
- Research tree (was part of the old "hardware tiers, upgrades, research" milestone; revisit after Milestone 7)
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

- 2026-10-17: Milestone 9: a harder mid and late game, day/night, and staff with traits (user: "add all of that"). Save v10.
  - **Live world:** everything below is gated on `state.liveWorld`. It's on in real games and in old saves that simulate people, and off in engine tests, the same pattern as `staffSim`.
  - **Difficulty** (Relaxed / Normal / Tough): picked in the menu, changeable any time. It scales the new costs, tax, incidents and reputation losses.
  - **Reputation** (0–100, starts at 50, which is neutral):
    - Drifts hourly towards a target set by uptime, overheating, failed racks and prestige. Contract results and fires move it straight away.
    - Scales walk-in demand (0.7× to 1.3×), contract pay, and how many offers arrive.
  - **Facility overhead:** past 25 racks, a per-rack running cost that grows faster than your size.
  - **Corporation tax:** charged at midnight on the day's profit, with marginal bands.
  - **Hardware end of life:** racks past 60 days since their last CPU change or refurbish start to fail, more often the older they get.
  - **Late-game threats** (from level 20):
    - Blackouts: long, deep power cuts.
    - Ransomware: contracts stop being served until you pay or it passes; strong firewalls stop it.
    - Big fires.
    - Stricter, bigger clients with bigger penalties.
  - **Day/night:**
    - Walk-in demand and bandwidth follow a daily curve that averages 1.
    - Electricity costs 0.6× at night and 1.6× at the evening peak.
    - UPS batteries store charge: in "save money" mode they charge at night and discharge at peak; "reserve" mode keeps them full for outages. Power cuts drain the charge.
    - Ambient temperature swings ±2°C through the day.
    - The lighting changes through the day (with a menu option to turn this off).
  - **Staff:**
    - Names, levels 1–5 (gained from jobs; each level is faster but has a higher wage) and a trait.
    - The traits are speedy, tinkerer, careful, night owl, early bird, workaholic, lazy and charmer.
    - Hiring picks from three daily candidates per role.
    - Training raises a level, or from level 3 gives a specialism (electrician, repair specialist, senior tech or negotiator).
    - Click a person to see their card.

- 2026-10-17: Sales staff who automate contracts (user: "new types of staff which can automate the contract hiring"). `sim/sales.ts`, numbers in `CONFIG.staff.sales`.
  - **Account manager** (level 7, £6,000, £1.10/min):
    - Walks to a free reception desk and stands beside it (one per desk, never in the clients' spot).
    - Talks to each waiting client for 20 ticks, then signs if three things hold. Otherwise it leaves a ✓/✕ note on the offer.
      - The racks are free.
      - Uptime over the last 12 game hours beats the promise by 0.5%.
      - Total income goes up. This compares real income with and without the contract, so a crowded walk-in market counts in the contract's favour.
    - A switch in the Contracts panel turns signing off ("advice only").
  - **Sales rep** (level 10, £9,000, £1.60/min): each brings +1 offer a day and +3% pay on new offers, capped at +4 offers and +15%. They don't walk to jobs.
  - **Roles:** staff roles gained `minLevel`. Account managers wear a teal shirt and headset; sales reps wear purple and carry a briefcase.
  - **Save:** `contracts.autoSign`, offer `review`, `signedByStaff`, `stats.staffSigned` and the `desk` task kind. All read tolerantly, so there is no version bump.

- 2026-10-17: Statistics screen, repair markers and upgradable safety (user request).
  - **Statistics (N):** rebuilt in the style of a city builder's stats screen.
    - A sidebar lists 35 stats in 9 groups, each with its latest value and a trend (green or red by whether up is good).
    - Ticked stats share one big graph. Lines with different units are each scaled to fit.
    - Hovering the graph shows a cursor and exact values.
    - Overview cards with sparklines, income and cost breakdown bars, records and the incident log.
  - **History:** samples now record every field in `HISTORY_FIELDS` (`sim/state.ts`). Older samples keep only what they had, and the graph leaves gaps. No save version bump: `readHistory` handles both shapes.
  - **Repair marker:** a red "!" sprite floats over failed racks, always facing the camera and drawn over everything. Clicking the badge counts as clicking its rack.
  - **Firewalls:** they filter a bandwidth (`ddosFilterMbps`, 1 Gbps × 1.6 per upgrade level) instead of a flat share.
    - An attack is 70% of your line, so attacks grow as you upgrade it.
    - Each firewall blocks at most 50% of an attack, and firewalls add up.
    - On the biggest line a fully upgraded firewall blocks about 20%, so late game needs several.
  - **UPS banks:** now upgradable, with backup × 1.35 per level (40 kW to about 800 kW at level 10). Numbers are in `CONFIG.safety`.

- 2026-10-17: Late-game depth, power tiers, bulk editing, stats and sound (user: "add 1,2,3,4,7", plus "better leveled power sources" and a menu fix). Save v9.
  - **Research** (`content/research.ts`, Y): 19 projects in 4 tiers from L8, £15k up to £5m. One at a time, paid upfront, takes game days. Effects: power, cooling, electricity, contract pay, walk-in income, market size, staff speed, ageing, bandwidth, incident chance, upkeep.
  - **Selling the company** (bottom of Research, from L15): restart for legacy points = floor(4 × √(value in £m)). Each point gives +2% income and +£1,000 starting cash, forever. Value = cash + building resale + 10 days of profit.
  - **Incidents** from L7: power cut, heatwave, fire, cyber attack (bad) and rush job, press visit (good). Chance grows with racks (30% a day + 0.6% per rack, cap 90%), rolled hourly with the seeded RNG.
    - Each bad one has a counter in the new **Safety** menu (F): UPS battery bank (40 kW backup), fire suppression (9×9) and firewall (blocks 35%).
    - Power cuts hit only grid-fed supply (mains, power units, substations).
  - **Bankruptcy grace**: below the overdraft you get 12 game hours to recover, with a HUD countdown. Instant bankruptcy felt unfair once random incidents existed.
  - **Power tiers**: Gas generator 60 kW (L8), Solar array 20 kW (L11; renewable, so off the bill), Fuel cell 130 kW (L15), Grid substation 320 kW (L21), Micro reactor 1000 kW (L30). Multiblocks now need four of the same kind.
  - **Bulk editing**:
    - Drag a box with a build tool to place many; wide boxes leave aisles so staff can reach everything.
    - Drag with Sell to sell a box.
    - Move tool can carry a box as a group.
    - Ctrl+Z undo for layout changes, 30 steps, each for 60 seconds. Repairs and refurbishing aren't undoable, as that would be a refund exploit.
    - On touch, one finger still pans with build tools.
  - **Stats (N)**: hourly samples kept for 14 days, with SVG graphs and an incident log.
  - **Sound**: Web Audio synthesis only (no files): action blips, news jingles, alarms and a server-room hum that scales with running racks. On/off and volume are in the menu.
  - **UI**: the hotbar wrapper is click-through, which fixes the map not responding beside the item panel. Panel toggles became a compact icon grid, and item menus got category colours, a header, edge fades and scroll arrows.
  - **Balance bot** now builds safety, researches and survives incidents. Late margins are about 22–35%.

- 2026-10-17: Milestone 8 (the whole backlog) built. The user asked Claude to decide the open questions; the answers are in the Milestone 8 section. The ones that change how the game feels:
  - **One line for the company.** Bandwidth follows earning power, not NIC speed: tying it to NIC speed made NIC upgrades throttle you.
  - **Saturation hits walk-in racks only**; contracts get a visible volume discount instead.
  - **Clients need a front door plus a reception desk** to be signed.
  - **Construction is building-only** (walls and floor stay instant), with no upkeep while building.
  - **The founder engineer is free**, and also services racks when idle, so a solo start never stalls.
  - **No random incidents.**
  - **Balance tuned with the bot:** freeRacks 12→20, running-cost multiplier 1.43→1.3, electricity bands at 150/400 kW. The first bot runs showed a new player choking on the 100 Mbps line and margins hitting 53% from contracts.
  - **Engine tests run without staff** (`staffSim` off). Real games and migrated real-size saves have it on.

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
  - **Extensibility proven** (Milestone 4): the Global network tier (L41) and the earn_250k goal were added through data files only; kept. The content test also caught a deliberately broken goal (unknown condition type, missing prerequisite, negative XP), which was then removed.
- 2026-10-16: Milestone 6 built (awaiting confirmation). User chose hybrid income, uptime judged over the whole contract, and automatic rack assignment.
  - **Files**: serving and settling in `src/sim/contracts.ts`, offers in `src/sim/contractBoard.ts`, seeded RNG in `src/sim/rng.ts` (mulberry32; the seed is in `GameState` and the save; the game picks a random seed per new game, tests use 1). The level curve moved to `src/sim/levels.ts` so the `level` condition avoids a circular import.
  - **Pay and risk**: a contract pays 1.3–2.2× a full walk-in rack with no ramp-up. Bonus and penalty are fractions of the contract's total pay, so failing a contract still leaves you with what it paid while it ran. Placeholder numbers: tune by playing.
  - **Cancelling and selling**: cancelling costs the penalty. Selling racks you've promised is allowed; it just causes downtime.
  - **Save v3** adds contracts and the RNG seed. A v2 save migrates with no contracts and a seed taken from its tick count.
  - **Dev helper**: `dct.level(n)` and `dct.cash(n)` in the browser console, only on the local dev server.
- 2026-10-16: Building upgrades added (user request). User chose a trade-off for racks (more power and heat), a cap that rises with player level, and **real brand names** for the planned rack components. Hardware, cooling types and looks became Milestone 7; staff and incidents moved to Milestone 8. Panel buttons use `pointerdown`, because live re-renders would swallow `click` events.
- 2026-10-17: "Upgrade max" button in the building panel. `planUpgradeMax` / `upgradeMax` in `sim/commands.ts`: power and cooling units level to the cap while cash lasts; racks repeatedly buy the cheapest next part across slots.
- 2026-10-17: Installable web app (PWA): `public/manifest.webmanifest` (full-screen), an SVG app icon, and `public/sw.js` (network-first pages, cached assets, works offline), registered in production only. Added pinch-to-zoom and disabled browser zoom for touch.
- 2026-10-17: Second balance pass, contract requirements, contracts page redesign (user request).
  - **Balance:** running costs multiplier 1.1 → 1.43 (+30%). Everything except the starter kit (Entry rack, Power unit, Cooling unit) and walls costs 40% more.
  - **Contract requirements:** customer types can require a minimum rack tier, minimum CPU cores per rack (cores per server × servers), or a GPU rack. Racks have a `tier`; CPU parts have `cores`. Contracts with requirements get first pick of qualifying racks. Signing checks a full allocation over owned racks (`canTakeOffer`).
  - **New customer types:** SaaS platform (L9, Performance+), Streaming service (L12, 64+ cores), Fintech (L16, Enterprise+ and 160+ cores), AI lab (L22, GPU racks). Pay is set to beat those racks' walk-in income. Every customer type has a colour.
  - **Contracts page:** summary tiles, colour-coded customer cards with avatar, type chip, stat tiles, bonus/penalty pills, requirement badges (✓/✕ with how many suitable racks you have), uptime bar with a promise marker, time bar, and recent results.
- 2026-10-17: Balance pass and rooms (user request).
  - **Balance:**
    - Every upgrade costs 15% more (`CONFIG.upgrades.costMultiplier`, applied to levels and parts).
    - Rack parts add 10% less income (`partIncomeMultiplier`).
    - Rent, building upkeep and floor upkeep are 10% higher (`economy.runningCostMultiplier`).
    - Fastest speed is now 3x instead of 4x.
    - Starting rack price unchanged.
  - **Rooms:**
    - The map is a grid of 20×14 lots (`sim/content/lots.ts`, 7 for now). You start with one and can buy any lot touching one you own, for £200k, £500k, £1M, £2M, £4M, £8M (then doubling).
    - Rent is charged per room owned.
    - Walls between rooms are permanent and always block heat; doors or glass can be swapped in.
    - Locked rooms show as dark plates; rooms for sale get a dashed outline, a padlock and a clickable price label.
    - The sun now follows the camera so shadows stay sharp on the bigger map.
    - Save v7: old single-room saves load onto the full map with only the starting room owned.
- 2026-10-16: Interior walls (user request).
  - **Placement:** walls sit on tile edges (`state.walls`, each `{ kind, x, y, dir }`), drawn by left-dragging along grid lines with a wall tool (right-drag still pans). Wall (L2), Door (L2) and Glass wall (L8). Doors are closed server-room doors, so they block heat like walls.
  - **Heat:** walls block diffusion, and cooling units only reach tiles within their radius that they can get to without crossing a wall (`sim/walls.ts`). Chiller pipes run under the floor and ignore walls.
  - **Display:** walls are half height by default, with a "Tall walls" toggle (V) for full height. Esc cancels a drag or closes panels. Save v6.
- 2026-10-16: Milestone 7 decisions (user): parts replace rack levels, decor gives prestige that improves contracts, underfloor cooling is a floor layer fed by chillers, everything delivered at once. Rack parts use real brand names with a trademark note in the rack panel. Save v5.
