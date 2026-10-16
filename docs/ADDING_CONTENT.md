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
