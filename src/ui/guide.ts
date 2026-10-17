import { ICONS } from './icons';

// The in-game how-to guide (G). Plain text sections; the first one opens
// automatically the first time someone plays.

interface Section {
  id: string;
  title: string;
  html: string;
}

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'Getting started',
    html: `
      <p>You run a datacentre. <b>Racks earn money</b>; everything else keeps them running.</p>
      <ol>
        <li>Open <b>Racks</b> on the bottom bar and place an <b>Entry rack</b>. Your founder engineer walks over and builds it.</li>
        <li>New racks fill up with customers over a day, so income ramps up.</li>
        <li>Watch the HUD: <b>Net £/min</b> is income minus costs. Keep it positive.</li>
        <li>Follow the <b>Goals</b> panel (top right) for XP, cash and unlocks.</li>
      </ol>
      <p class="tip">Don't spend every penny at once: new racks cost upkeep before they earn, and below the overdraft limit you go bankrupt.</p>`,
  },
  {
    id: 'power',
    title: 'Power',
    html: `
      <p>Racks and coolers draw <b>kW</b>. Your building supplies a little; <b>Power units</b> add more. If you draw more than you supply, everything slows down (a brownout).</p>
      <p>Put <b>four power units in a 2×2 square</b> to form a multiblock: each produces 25% more.</p>
      <p>You also pay an <b>electricity bill</b> for what you draw. The more you use, the higher the rate per kW.</p>`,
  },
  {
    id: 'heat',
    title: 'Heat & cooling',
    html: `
      <p>Running racks make heat, which spreads to nearby tiles. Over <b>35°C</b> racks glow orange; over <b>45°C</b> they fail and need repairing.</p>
      <ul>
        <li><b>Cooling unit</b>: cools a 5×5 area.</li>
        <li><b>In-row cooler</b>: strong, short range.</li>
        <li><b>Chiller + floor vents</b>: vents go under racks; a chiller feeds them.</li>
        <li><b>Room AC</b>: gently cools a whole room.</li>
        <li><b>Liquid cooling</b>: a rack part that removes most of that rack's heat.</li>
      </ul>
      <p class="tip">Press <b>H</b> for the heat map. Walls block heat, and coolers only cool their own room.</p>`,
  },
  {
    id: 'network',
    title: 'Internet',
    html: `
      <p>Every running rack uses bandwidth on your internet line, which starts at <b>100 Mbps</b>. When the line is full, income slows and contracts lose uptime.</p>
      <p>Click the <b>Network</b> bar in the HUD to upgrade, up to 800 Gbps. Every upgrade that makes a rack earn more also makes it use more bandwidth.</p>`,
  },
  {
    id: 'upgrades',
    title: 'Upgrades & ageing',
    html: `
      <p>Click any building to open its panel. Racks have <b>part slots</b> (CPU, memory, storage, network, cooling, GPU) with real hardware; power and cooling units have levels. <b>Upgrade max</b> buys everything you can afford.</p>
      <p>Hardware <b>ages</b>: a rack slowly earns less until you fit a new CPU or <b>Refurbish</b> it.</p>
      <p class="tip">Upgraded parts draw more power and make more heat, so plan power and cooling with them.</p>`,
  },
  {
    id: 'staff',
    title: 'Staff & building',
    html: `
      <p>Nothing builds itself: <b>engineers</b> walk to new buildings and build them, and repair failed racks. <b>Technicians</b> service racks every few days; overdue racks earn less.</p>
      <p>Open <b>Staff (T)</b> to hire. Each hire costs a fee and a wage every minute.</p>
      <p>Staff need somewhere to rest: without enough <b>staff room</b> space everyone works slower, and without a <b>storage room</b> engineers build slower.</p>`,
  },
  {
    id: 'zones',
    title: 'Zones',
    html: `
      <p>Open <b>Zones</b> and drag to paint tiles:</p>
      <ul>
        <li><b>Server room</b>: racks inside earn 5% more.</li>
        <li><b>Staff room</b>: add a coffee machine and break tables. Each table houses 4 more staff.</li>
        <li><b>Storage room</b>: add parts shelving so engineers work at full speed.</li>
      </ul>`,
  },
  {
    id: 'contracts',
    title: 'Contracts & clients',
    html: `
      <p>From level 6, clients bring contracts. They walk in through your <b>front door</b> (Walls menu, on an outside wall) and queue at a <b>reception desk</b>. You can only sign when they reach the desk.</p>
      <p>A contract uses some of your racks for its length and pays well, but promises an <b>uptime</b>. Keep it and you get a bonus; break it and you pay a penalty. Some clients need better racks, more CPU cores or GPUs.</p>
      <p class="tip">Contracted racks don't count towards market saturation: walk-in customers run out as you grow, so contracts are how big datacentres make money.</p>`,
  },
  {
    id: 'rooms',
    title: 'Rooms & walls',
    html: `
      <p>Drag along grid lines with a wall tool to build walls. Put a door or glass on an existing wall to swap it. People walk through doors; walls and glass block them, and every wall blocks heat.</p>
      <p>Buy more rooms by clicking a <b>Room for sale</b> next to one you own. Each costs more than the last, and rent is per room.</p>`,
  },
  {
    id: 'controls',
    title: 'Controls',
    html: `
      <table class="keys">
        <tr><td>Drag / WASD</td><td>Pan</td></tr>
        <tr><td>Wheel / pinch</td><td>Zoom</td></tr>
        <tr><td>Space, 1 2 3</td><td>Pause, speed</td></tr>
        <tr><td>R P C Z B X</td><td>Racks, Power, Cooling, Zones, Walls, Sell</td></tr>
        <tr><td>M</td><td>Move: click a building to pick it up, click to put it down (free; Q turns it, Esc cancels)</td></tr>
        <tr><td>Q</td><td>Rotate what you're placing</td></tr>
        <tr><td>H K T L V G</td><td>Heat, Contracts, Staff, Style, Tall walls, Guide</td></tr>
        <tr><td>Esc</td><td>Cancel / close panels</td></tr>
      </table>`,
  },
];

export class GuidePanel {
  private readonly root: HTMLElement;
  private section = SECTIONS[0]!.id;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'contracts ct-panel guide-panel';
    parent.appendChild(this.root);
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest('button');
      if (!button) return;
      if (button.dataset.act === 'close') this.toggle(false);
      else if (button.dataset.section) {
        this.section = button.dataset.section;
        this.render();
      }
    });
    this.render();
  }

  get open(): boolean {
    return this.root.classList.contains('open');
  }

  toggle(force?: boolean): void {
    this.root.classList.toggle('open', force);
  }

  private render(): void {
    const current = SECTIONS.find((s) => s.id === this.section) ?? SECTIONS[0]!;
    this.root.innerHTML = `
      <div class="ct-head">${ICONS.guide}<h2>How to play</h2><button data-act="close" aria-label="Close">✕</button></div>
      <div class="guide-layout">
        <nav>${SECTIONS.map((s) => `<button data-section="${s.id}" class="${s.id === current.id ? 'active' : ''}">${s.title}</button>`).join('')}</nav>
        <article><h3>${current.title}</h3>${current.html}</article>
      </div>`;
  }
}
