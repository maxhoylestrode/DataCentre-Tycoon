# Adding content

All progression content is plain data in `src/sim/content/`. Adding a tier, unlock, goal or achievement means adding an entry to one of those files. No engine code changes.

After any change, run `npm test`. `tests/content.test.ts` checks every entry (unique ids, valid references, increasing tier levels, known condition types, valid rewards, every goal reachable), so a bad entry fails the tests instead of breaking the game.

## Rules that keep saves working

- **Ids are forever.** Saves store goal, achievement and building ids. Never rename or reuse one. To retire something, delete the entry: saves that mention it simply ignore it.
- **Ids are `lower_snake_case`.**
- **Saves never store content.** Only ids and numbers go in saves, so changing a reward, cost or level applies to existing saves automatically.

## Add a tier

`src/sim/content/tiers.ts`. `minLevel` must be higher than the tier above it.

```ts
{ id: 'global_network', name: 'Global network', minLevel: 41, description: 'Running datacentres across the world' },
```

The HUD shows the tier name next to the level, and the level-up popup announces a new tier.

## Add an unlock

`src/sim/content/unlocks.ts`. Every building in `CONFIG.buildings` and every mechanic in `MECHANICS` (`src/sim/progression.ts`) must have exactly one entry.

**A new building** (e.g. a better rack):

1. Add it to `CONFIG.buildings` in `src/config.ts`. Pick a `category` (`rack`, `power` or `cooling`) and the engine already knows how it behaves:
   ```ts
   rack_dense: {
     name: 'Dense rack', category: 'rack', cost: 2500, upkeepPerTick: 1.6, incomePerTick: 5.5,
     powerDraw: 7, powerSupply: 0, heatPerTick: 1.2, coolingStrength: 0, coolingRadius: 0,
   },
   ```
2. Add its unlock:
   ```ts
   { id: 'rack_dense', type: 'building', level: 5 },
   ```

It appears in the build menu automatically, greyed out with "Unlocks at level 5" until then. (A hotkey is optional: add it to `TOOL_HOTKEYS` in `src/input/tools.ts`.)

**A new mechanic** needs code for the mechanic itself (that's a feature, not content). Once the code exists, add its id to `MECHANICS` and add an unlock with a `name` and `description`:

```ts
{ id: 'contract_board', type: 'mechanic', level: 6, name: 'Contract board', description: 'Pick customer contracts.' },
```

Code that implements the mechanic checks `isUnlocked(state, 'contract_board')`.

## Add a goal

`src/sim/content/goals.ts`. Up to `CONFIG.progression.maxActiveGoals` goals are shown at once: those not yet done whose `after` goals are all done, in file order.

```ts
{
  id: 'earn_250k',
  description: 'Earn £250,000 in total',
  condition: { type: 'totalEarned', min: 250_000 },
  reward: { xp: 1_200, cash: 10_000 },
  after: ['earn_50k', 'twenty_racks'],
},
```

- `after` is optional. Goals without it appear from the start.
- `reward.cash` is optional.
- Players who already meet the condition complete it on their next tick, so adding goals to an old save just works.

### Condition types

| type | extra fields | met when |
|---|---|---|
| `rackCount` | `min` | you own at least `min` racks (working or not) |
| `buildingCount` | `kind`, `min` | you own at least `min` of that building id |
| `totalEarned` | `min` | lifetime income is at least `min` |
| `netIncome` | `min` | current net £/min is at least `min` |
| `cash` | `min` | cash on hand is at least `min` |
| `day` | `min` | it is day `min` or later |
| `repairs` | `min` | you have repaired at least `min` racks |
| `failures` | `min` | at least `min` racks have failed |
| `level` | `min` | you are level `min` or higher |
| `contractsSigned` | `min` | you have signed at least `min` contracts |
| `contractsCompleted` | `min` | at least `min` contracts ended with the uptime promise kept |
| `contractsFailed` | `min` | at least `min` contracts ended with the promise broken |
| `activeContracts` | `min` | at least `min` contracts are running right now |
| `perfectContracts` | `min` | at least `min` contracts were completed at 100% uptime |
| `upgrades` | `min` | at least `min` upgrades bought (levels and parts) |
| `highestUpgrade` | `min` | some power/cooling unit is at upgrade level `min` |
| `prestige` | `min` | prestige is at least `min` |
| `fedVents` | `min` | at least `min` floor vents are fed by a chiller |
| `liquidCooledRacks` | `min` | at least `min` racks have a non-stock cooling part |
| `staffCount` | `min`, optional `role` | at least `min` hired staff (of that role); the founder doesn't count |
| `uplinkMbps` | `min` | your internet line is at least `min` Mbps |
| `multiblocks` | `min` | at least `min` 2×2 power multiblocks are running |
| `zoneTiles` | `zone`, `min` | at least `min` tiles are painted as that zone (`server`, `staff`, `storage`) |
| `clientsServed` | `min` | at least `min` clients signed at reception |
| `services` | `min` | racks have been serviced at least `min` times |
| `refurbishes` | `min` | at least `min` racks refurbished |
| `receptionReady` | `min: 1` | there's a front door and a finished reception desk |

**Adding a condition type** is engine work, but small: in `src/sim/conditions.ts` add it to the `Condition` union and add one evaluator (a function returning the current value) to `EVALUATORS`. TypeScript won't compile until both are there. Then add a test for it in the `conditions` block of `tests/progression.test.ts`.

## Add an achievement

`src/sim/content/achievements.ts`. Same conditions as goals. Earned once, the first time the condition is met.

```ts
{
  id: 'power_station',
  name: 'Power station',
  description: 'Own 3 power units',
  condition: { type: 'buildingCount', kind: 'power_basic', min: 3 },
  reward: { xp: 100 },
},
```

## Add a rack model

Add it to `CONFIG.buildings` with `category: 'rack'`, then an unlock entry. Its look comes from `RACK_LOOKS` in `src/render/models.ts` and needs an entry in `FACTORIES` there (TypeScript insists).

```ts
rack_quantum: {
  name: 'Quantum rack', category: 'rack', cost: 300000, upkeepPerTick: 30, incomePerTick: 2.4,
  powerDraw: 4, powerSupply: 0, heatPerTick: 0.65, coolingStrength: 0, coolingRadius: 0,
  upgrade: { output: 0, powerDraw: 0, heat: 0 },
  partMultiplier: 20, powerFactor: 14, heatFactor: 10,
  slots: ['cpu', 'ram', 'storage', 'network', 'cooling'],
},
```

`incomePerTick / powerDraw / heatPerTick` are one server with stock parts. The rack holds `partMultiplier` servers' worth (income and part prices scale by it); power and heat scale by `powerFactor` / `heatFactor`.

## Add a rack part

`src/sim/content/parts.ts`. Within a slot, parts are an upgrade path **in file order**, and the first part in each slot is the free stock part. Numbers are what the part adds over stock, per server.

```ts
{ id: 'cpu_epyc_9965', slot: 'cpu', brand: 'AMD', model: 'EPYC 9965', specs: '192 cores, 2.25 GHz',
  level: 34, cost: 40000, income: 8.6, powerDraw: 2.3, heat: 0.24 },
```

Insert it at the right place in its slot's path. The content test checks that each step costs more, earns more (or removes more heat) and never unlocks earlier than the step before. Cooling-slot parts use `heatReduction` (0..1) instead of income.

Real product names are fine (names only, never logos); the in-game note covers trademarks.

## Add a decoration

Add it to `CONFIG.buildings` with `category: 'decor'` and a `prestige` value, an unlock entry, and a model in `FACTORIES` (`src/render/models.ts`). It shows up in the Decor menu automatically.

## Add zone furniture

Add it to `CONFIG.buildings` with `category: 'furniture'` and `zone: 'staff' | 'storage' | 'server'`, an unlock entry, a model in `FACTORIES` and an icon. It appears in the Zones menu. Furniture only has an effect if `src/sim/zones.ts` reads it (e.g. `staffCapacity` counts `break_table` and needs `coffee_machine`; `hasStorage` needs `shelving`). A new zone kind goes in `ZONE_KINDS` in `config.ts`, with a colour in `src/render/zones.ts` and a tool in `src/input/tools.ts`.

## Add an internet line speed

`src/sim/content/uplinks.ts`, slowest first; the first is what every game starts with. Players can only step up one line at a time, so insert new speeds in order.

```ts
{ id: 'uplink_1600g', name: 'Quad 400G backbone', mbps: 1_600_000, level: 38, cost: 2_500_000, rentalPerTick: 90 },
```

Never remove or rename an id: saves store the current line's id. Racks use `CONFIG.network.mbpsPerIncome` Mbps per £/tick they can earn.

## Add a room style

`src/sim/content/styles.ts`. `slot` is `floor`, `wall` or `lighting`; the first style in each slot is the free default. Lighting styles can set `intensity` and an `accent` glow colour.

```ts
{ id: 'wall_glass', slot: 'wall', name: 'Glass partition', level: 24, cost: 30000, prestige: 12, color: 0x9fb8c8 },
```

## Add a wall type

Add it to `CONFIG.walls` (`name`, `cost`) and an unlock entry with `type: 'wall'`. It appears in the Walls menu automatically. For a new look, add a branch in `buildSegment` in `src/render/walls.ts` and an icon in `src/ui/icons.ts`. Every wall type blocks heat.

## Add a room (lot)

`src/sim/content/lots.ts`. Each lot is a `CONFIG.lots.width × height` room at a column and row on the map grid. Lots must touch an existing one (the content test checks every lot can be reached from the starting room) and should only extend right (+col) or towards the camera (+row), so existing coordinates never move. The map grows automatically, and old saves load onto the bigger map.

```ts
{ id: 'lot_3_0', col: 3, row: 0 },
```

Prices go by how many rooms have been bought (`CONFIG.lots.prices`, doubling past the end), not by which lot.

## Add a customer type

`src/sim/content/customers.ts`. Each morning the contract board rolls `CONFIG.contracts.offersPerDay` offers from the types whose `minLevel` you have reached. Ranges are `[min, max]`, both inclusive.

```ts
{
  id: 'bank',
  name: 'Bank',
  minLevel: 13,
  racks: [6, 12],
  days: [7, 14],
  payMultiplier: [2.2, 2.8],   // x CONFIG.contracts.basePayPerRackPerTick
  sla: [0.995, 0.999],         // promised uptime
  bonusFraction: 0.3,          // of the contract's total pay
  penaltyFraction: 0.6,
  xp: 800,
  nameSuffixes: ['Bank', 'Capital', 'Trust'],
},
```

Offers store the numbers they were rolled with, so changing a type only affects new offers, never contracts already signed. Removing a type is safe: signed contracts still finish.

## When content runs out

There is no max level: the XP curve (`xpBase * level ^ xpExponent` in `CONFIG.progression`) works at any level. Past the last unlock, level-ups say "More coming soon"; past the last goal, the goals panel says so too. Nothing breaks.
