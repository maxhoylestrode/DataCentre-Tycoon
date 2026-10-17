// Staff and clients, simulated only when state.staffSim is on.
//
// Engineers build new buildings and repair failed racks; technicians service
// racks before maintenance runs out. Each picks the nearest job nobody else
// has taken, walks there, works, and moves on. Idle staff head back to the
// staff room. Clients walk in through a front door, queue at a reception
// desk (which makes their contract offer signable) and walk out again.

import { CONFIG } from '../config';
import { canStep, findPath, frontDoors, isWalkable, standsNextTo, type Tile, walkGrid, type WalkGrid } from './paths';
import {
  type Building,
  categoryOf,
  type Client,
  type GameState,
  isRunning,
  type StaffMember,
  type StaffTask,
} from './state';
import { researchBonus } from './research';
import { hasStorage, staffCapacity } from './zones';

const S = CONFIG.staff;

// Everyone slows down when there are more staff than the staff rooms can house.
export function staffSpeedFactor(state: GameState): number {
  const tired = state.staff.length > staffCapacity(state) ? S.tiredSpeed : 1;
  return tired * (1 + researchBonus(state, 'staffSpeed'));
}

// Moves a person along their path. Returns true once the path is used up.
function walk(person: { x: number; y: number; path: Tile[] }, speed: number): boolean {
  let budget = speed;
  while (budget > 0 && person.path.length > 0) {
    const [tx, ty] = person.path[0]!;
    const dx = tx - person.x;
    const dy = ty - person.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= budget) {
      person.x = tx;
      person.y = ty;
      person.path.shift();
      budget -= dist;
    } else {
      person.x += (dx / dist) * budget;
      person.y += (dy / dist) * budget;
      budget = 0;
    }
  }
  return person.path.length === 0;
}

const tileOf = (p: { x: number; y: number }): Tile => [Math.round(p.x), Math.round(p.y)];

// Racks that need servicing soon (technicians start a little early).
function needsService(state: GameState, b: Building): boolean {
  return categoryOf(b) === 'rack' && isRunning(b) && state.tick - b.lastServicedTick > CONFIG.maintenance.intervalTicks * 0.8;
}

// Engineers build and repair; when there's nothing to build or repair they
// service racks too, so a small company run by the founder still copes.
// Technicians only service.
function jobsFor(state: GameState, member: StaffMember, taken: Set<number>): Building[] {
  const open = state.buildings.filter((b) => !taken.has(b.id));
  if (member.role === 'engineer') {
    const engineering = open.filter((b) => b.status === 'building' || (b.status === 'repairing' && b.repairDoneTick === null));
    if (engineering.length > 0) return engineering;
  }
  return open.filter((b) => needsService(state, b));
}

function taskFor(b: Building): StaffTask {
  if (b.status === 'building') return { kind: 'build', buildingId: b.id, workLeft: b.buildRemaining };
  if (b.status === 'repairing') return { kind: 'repair', buildingId: b.id, workLeft: CONFIG.economy.repairTicks };
  return { kind: 'service', buildingId: b.id, workLeft: CONFIG.maintenance.workTicks };
}

// Whether a task still needs doing (the building may be gone or done).
function stillNeeded(state: GameState, task: StaffTask): Building | undefined {
  const b = state.buildings.find((x) => x.id === task.buildingId);
  if (!b) return undefined;
  if (task.kind === 'build') return b.status === 'building' ? b : undefined;
  if (task.kind === 'repair') return b.status === 'repairing' ? b : undefined;
  return isRunning(b) ? b : undefined;
}

function finish(state: GameState, task: StaffTask, b: Building): void {
  if (task.kind === 'build') {
    b.status = 'ok';
    b.buildRemaining = 0;
    // Customers start filling a rack once it's actually built.
    b.builtAtTick = state.tick;
    b.refreshedAtTick = state.tick;
    b.lastServicedTick = state.tick;
  } else if (task.kind === 'repair') {
    b.status = 'ok';
    b.repairDoneTick = null;
  } else {
    b.lastServicedTick = state.tick;
    state.progress.stats.services += 1;
  }
}

function assignJob(grid: WalkGrid, state: GameState, member: StaffMember, taken: Set<number>): void {
  const jobs = jobsFor(state, member, taken);
  if (jobs.length === 0) return idle(grid, state, member);
  // One search reaching whichever job is nearest on foot.
  const byTile = new Map<string, Building[]>();
  for (const job of jobs) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = `${job.x + dx},${job.y + dy}`;
      byTile.set(k, [...(byTile.get(k) ?? []), job]);
    }
  }
  let target: Building | undefined;
  const path = findPath(grid, tileOf(member), (x, y) => {
    const candidates = byTile.get(`${x},${y}`);
    target = candidates?.find((job) => standsNextTo(grid, job.x, job.y)(x, y));
    return target !== undefined;
  });
  if (!path || !target) return idle(grid, state, member);
  member.path = path;
  member.task = taskFor(target);
  taken.add(target.id);
}

// Idle staff wander back to a staff room tile if there is one.
function idle(grid: WalkGrid, state: GameState, member: StaffMember): void {
  if (member.path.length > 0) return;
  const here = tileOf(member);
  const inStaffRoom = state.zones.some((z) => z.kind === 'staff' && z.x === here[0] && z.y === here[1]);
  if (inStaffRoom || !state.zones.some((z) => z.kind === 'staff')) return;
  const staffTiles = new Set(state.zones.filter((z) => z.kind === 'staff').map((z) => `${z.x},${z.y}`));
  member.path = findPath(grid, here, (x, y) => staffTiles.has(`${x},${y}`)) ?? [];
}

export function stepStaff(state: GameState): void {
  if (!state.staffSim || state.staff.length === 0) return;
  const grid = walkGrid(state);
  const speed = S.walkSpeed * staffSpeedFactor(state);
  const workRate = staffSpeedFactor(state);
  const engineerRate = workRate / (hasStorage(state) ? 1 : S.noStorageSlowdown);
  const taken = new Set(state.staff.flatMap((s) => (s.task ? [s.task.buildingId] : [])));

  for (const member of state.staff) {
    if (member.task) {
      const b = stillNeeded(state, member.task);
      if (!b) {
        member.task = null;
        member.path = [];
      }
    }
    if (!member.task) {
      // Idle staff look for work every few ticks, not every tick (searching is
      // the expensive part with a big team).
      if ((state.tick + member.id) % S.jobSearchTicks === 0) assignJob(grid, state, member, taken);
      if (!member.task) {
        walk(member, speed);
        continue;
      }
    }
    if (!walk(member, speed)) continue;
    // On site: work.
    const task = member.task!;
    const b = stillNeeded(state, task)!;
    task.workLeft -= member.role === 'engineer' ? engineerRate : workRate;
    if (task.kind === 'build') b.buildRemaining = Math.max(0, task.workLeft);
    if (task.workLeft <= 0) {
      finish(state, task, b);
      member.task = null;
    }
  }
}

// Where new staff and clients appear: just inside a front door, or the
// starting room's corner if there isn't one.
export function entrance(state: GameState): Tile {
  const door = frontDoors(state)[0];
  return door ? door.inside : [1, 1];
}

// --- Clients -------------------------------------------------------------

export function receptionDesks(state: GameState): Building[] {
  return state.buildings.filter((b) => b.kind === 'desk_reception' && isRunning(b));
}

// Why clients can't reach you, or null if they can.
export function receptionProblem(state: GameState): string | null {
  if (!state.staffSim) return null;
  if (frontDoors(state).length === 0) return 'Clients need a front door: put one in an outside wall (Walls menu).';
  if (receptionDesks(state).length === 0) return 'Clients need a reception desk to queue at (Decor menu).';
  return null;
}

// A client for each new offer, arriving one after another.
export function spawnClients(state: GameState, offerIds: number[]): void {
  if (!state.staffSim) return;
  const door = frontDoors(state)[0];
  const start: Tile = door ? door.outside : [1, 1];
  offerIds.forEach((offerId, i) => {
    const client: Client = {
      id: state.nextClientId++,
      offerId,
      x: start[0],
      y: start[1],
      path: [],
      state: 'entering',
      spawnTick: state.tick + i * CONFIG.clients.spawnGap,
    };
    state.clients.push(client);
  });
}

// Send a client home (offer signed or expired).
export function dismissClient(state: GameState, offerId: number, signed: boolean): void {
  for (const c of state.clients) {
    if (c.offerId !== offerId || c.state === 'leaving') continue;
    c.state = 'leaving';
    c.path = [];
    if (signed) state.progress.stats.clientsServed += 1;
  }
}

// Queue spots: the walkable tile in front of each desk first, then the
// nearest walkable tiles behind it, so clients form a line.
function queueSpots(grid: WalkGrid, state: GameState, count: number): Tile[] {
  const spots: Tile[] = [];
  const seen = new Set<string>();
  for (const desk of receptionDesks(state)) {
    const front: Tile = [desk.x + [0, 1, 0, -1][desk.rot % 4]!, desk.y + [1, 0, -1, 0][desk.rot % 4]!];
    if (!isWalkable(grid, front[0], front[1]) || !canStep(grid, front[0], front[1], desk.x, desk.y)) continue;
    const queue: Tile[] = [front];
    seen.add(`${front[0]},${front[1]}`);
    while (queue.length > 0 && spots.length < count) {
      const [x, y] = queue.shift()!;
      spots.push([x, y]);
      for (const [nx, ny] of [[x, y + 1], [x, y - 1], [x + 1, y], [x - 1, y]] as Tile[]) {
        const k = `${nx},${ny}`;
        if (seen.has(k) || !isWalkable(grid, nx, ny) || !canStep(grid, x, y, nx, ny)) continue;
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
  }
  return spots;
}

function markArrived(state: GameState, client: Client): void {
  client.state = 'waiting';
  const offer = state.contracts.offers.find((o) => o.id === client.offerId);
  if (offer) offer.arrived = true;
}

export function stepClients(state: GameState): void {
  if (!state.staffSim || state.clients.length === 0) return;
  const grid = walkGrid(state);
  const door = frontDoors(state)[0];
  const ready = receptionProblem(state) === null;
  const inQueue = state.clients.filter((c) => c.state !== 'leaving' && state.tick >= c.spawnTick);
  const spots = ready ? queueSpots(grid, state, inQueue.length) : [];

  for (const client of [...state.clients]) {
    if (state.tick < client.spawnTick) continue;

    if (client.state === 'leaving') {
      if (client.path.length === 0) {
        if (!door) {
          state.clients = state.clients.filter((c) => c !== client);
          continue;
        }
        const out = findPath(grid, tileOf(client), (x, y) => x === door.inside[0] && y === door.inside[1]);
        client.path = [...(out ?? []), door.outside];
      }
      if (walk(client, S.walkSpeed)) state.clients = state.clients.filter((c) => c !== client);
      continue;
    }

    // Walk to this client's place in the queue (it moves up as others leave).
    const spot = spots[inQueue.indexOf(client)];
    if (!spot) continue;
    const goal = client.path.at(-1) ?? tileOf(client);
    if (goal[0] !== spot[0] || goal[1] !== spot[1]) {
      client.path = findPath(grid, tileOf(client), (x, y) => x === spot[0] && y === spot[1]) ?? [];
    }
    if (walk(client, S.walkSpeed)) {
      const [x, y] = tileOf(client);
      if (x === spot[0] && y === spot[1] && client.state === 'entering') markArrived(state, client);
    }
  }
}
