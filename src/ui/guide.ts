import { CONFIG } from '../config';
import { unlockFor } from '../sim/progression';
import { ICONS } from './icons';

// The in-game how-to guide (G). Sections are grouped into chapters; each
// starts with a one-line summary, then short lists. The first one opens
// automatically the first time someone plays.

interface Section {
  id: string;
  group: string;
  title: string;
  html: string;
}

// "From level N" badge for a mechanic or building, read from the unlock table.
const lvl = (id: string): string => {
  const level = unlockFor(id)?.level;
  return level && level > 1 ? ` <span class="lvl">Level ${level}</span>` : '';
};
const lead = (text: string): string => `<p class="lead">${text}</p>`;

const SECTIONS: Section[] = [
  // --- Start here ---
  {
    id: 'start',
    group: 'Start here',
    title: 'Getting started',
    html: `
      ${lead('You run a datacentre. <b>Racks earn money</b>. Everything else exists to keep them running.')}
      <h4>Your first few minutes</h4>
      <ol>
        <li>Open <b>Racks</b> on the bottom bar and place an <b>Entry rack</b>. Your founder engineer walks over and builds it.</li>
        <li>Wait: a new rack fills up with customers over a game day, so income ramps up slowly.</li>
        <li>Watch <b>Net £/min</b> in the top-left panel. That's income minus costs, so keep it above zero.</li>
        <li>Add a <b>Power unit</b> before your racks draw more power than you have.</li>
        <li>Follow the <b>Goals</b> list (top right). Goals give XP and cash, and XP unlocks new things.</li>
      </ol>
      <p class="tip">Don't spend every penny at once. Racks take a day to fill up. If cash drops below the overdraft limit, you have 12 game hours to recover before you go bankrupt.</p>`,
  },
  {
    id: 'screen',
    group: 'Start here',
    title: 'The screen',
    html: `
      ${lead('Money and warnings top left, goals top right, everything you build along the bottom.')}
      <ul>
        <li><b>Top left</b>: cash, net £/min (hover it for the breakdown), clock and speed, power and internet bars, and warnings.</li>
        <li><b>Top right</b>: the menu (⚙), the <b>trophy</b> for achievements, and your <b>goals</b>.</li>
        <li><b>Bottom bar</b>: build menus (Racks, Power, Cooling and more). The small buttons on the right open panels like Contracts, Staff and Stats.</li>
        <li><b>Select (E)</b> is the default tool. Clicking things only selects them, so you can look around without building anything by accident.</li>
      </ul>
      <p class="tip">On a phone: drag with one finger to look around, pinch to zoom, and swipe the bottom bar sideways for more buttons.</p>`,
  },
  // --- Keeping racks running ---
  {
    id: 'power',
    group: 'Keeping racks running',
    title: 'Power',
    html: `
      ${lead('Supply must stay above draw. If you draw more than you supply, everything slows down (a <b>brownout</b>).')}
      <h4>Power sources, smallest to biggest</h4>
      <ul>
        <li><b>Power unit</b> 20 kW · <b>Gas generator</b> 60 kW${lvl('power_gas')} · <b>Fuel cell</b> 130 kW${lvl('power_fuelcell')} · <b>Substation</b> 320 kW${lvl('power_substation')} · <b>Micro reactor</b> 1,000 kW${lvl('power_reactor')}</li>
        <li><b>Solar array</b>${lvl('power_solar')}: its power is free, so it comes off your electricity bill.</li>
      </ul>
      <h4>Good to know</h4>
      <ul>
        <li>Put <b>four of the same kind in a 2×2 square</b> to make a multiblock: each one makes 25% more power.</li>
        <li>The <b>electricity bill</b> rises per kW as you use more.</li>
        <li>Power cuts hit grid-fed sources (power units, substations). Generators on site keep running.</li>
      </ul>`,
  },
  {
    id: 'heat',
    group: 'Keeping racks running',
    title: 'Heat & cooling',
    html: `
      ${lead(`Running racks get hot. Over <b>${CONFIG.heat.warnTemp}°C</b> they glow orange; over <b>${CONFIG.heat.failTemp}°C</b> they fail and need a repair.`)}
      <ul>
        <li><b>Cooling unit</b>: cools a 5×5 area. The basic fix.</li>
        <li><b>In-row cooler</b>${lvl('cooling_inrow')}: strong, but short range. Put it in a row of racks.</li>
        <li><b>Chiller + floor vents</b>${lvl('chiller')}: vents go under racks, and a chiller feeds them.</li>
        <li><b>Room AC</b>${lvl('cooling_ac')}: gently cools a whole room.</li>
        <li><b>Liquid cooling</b>: a rack part that removes most of that rack's heat.</li>
      </ul>
      <p class="tip">Press <kbd>H</kbd> for the heat map. Walls block heat, and coolers only cool their own room.</p>`,
  },
  {
    id: 'network',
    group: 'Keeping racks running',
    title: 'Internet',
    html: `
      ${lead('Every running rack uses bandwidth. When the line is full, income slows and contracts lose uptime.')}
      <ul>
        <li>You start on <b>100 Mbps</b>. Click the <b>Network</b> bar (top left) to upgrade, up to 800 Gbps.</li>
        <li>Upgrades that make a rack earn more also make it use more bandwidth.</li>
        <li>The <b>evening rush</b> uses the most. Size your line for the peak, not the average.</li>
      </ul>`,
  },
  {
    id: 'upgrades',
    group: 'Keeping racks running',
    title: 'Upgrades & ageing',
    html: `
      ${lead('Click a building to open its details. Racks upgrade through <b>parts</b>; power and cooling units upgrade through <b>levels</b>.')}
      <ul>
        <li>Rack part slots: CPU, memory, storage, network, cooling and GPU. Each slot takes real hardware.</li>
        <li><b>Upgrade max</b> buys everything you can afford, cheapest first.</li>
        <li>Hardware <b>ages</b>: a rack slowly earns less until you fit a new CPU or <b>refurbish</b> it. The bar over each rack shows its condition.</li>
        <li><b>All racks (J)</b> lists every rack, with buttons to upgrade, repair or refurbish them all at once.</li>
      </ul>
      <p class="warn-tip">Better parts draw more power and make more heat. Plan your power and cooling around them.</p>`,
  },
  // --- Growing ---
  {
    id: 'staff',
    group: 'Growing',
    title: 'Staff',
    html: `
      ${lead('Nothing builds itself: engineers build and repair, and technicians keep racks serviced.')}
      <h4>Roles</h4>
      <ul>
        <li><b>Engineer</b>: builds new things and repairs failed racks. You start with one, the founder.</li>
        <li><b>Technician</b>: services racks every few days. Overdue racks earn less.</li>
        <li><b>Account manager</b> (level ${CONFIG.staff.roles.account_manager.minLevel}): stands at a reception desk and signs good contracts for you.</li>
        <li><b>Sales rep</b> (level ${CONFIG.staff.roles.sales_rep.minLevel}): brings an extra client each day and gets better pay on new offers.</li>
      </ul>
      <h4>Hiring and growth</h4>
      <ul>
        <li>Open <b>Staff (T)</b>. Each morning brings new <b>candidates</b> with a level (1–5) and maybe a <b>trait</b>. Hover a trait to see what it does.</li>
        <li>Staff level up as they work: faster, but paid more. <b>Train</b> them for a level, or from level ${CONFIG.staffGrowth.specialismLevel} for a specialism.</li>
        <li>Click someone in the room to see their card.</li>
      </ul>
      <p class="tip">Staff need a <b>staff room</b> or everyone works slower. Without a <b>storage room</b>, engineers build slower.</p>`,
  },
  {
    id: 'zones',
    group: 'Growing',
    title: 'Zones',
    html: `
      ${lead(`Paint rooms with a purpose from the <b>Zones</b> menu${lvl('zones')}, then add their furniture.`)}
      <ul>
        <li><b>Server room</b>: racks inside earn ${CONFIG.zones.serverRoomBonus * 100}% more.</li>
        <li><b>Staff room</b>: needs a coffee machine. Each break table houses ${CONFIG.staff.perBreakTable} more staff.</li>
        <li><b>Storage room</b>: add parts shelving so engineers work at full speed.</li>
      </ul>`,
  },
  {
    id: 'contracts',
    group: 'Growing',
    title: 'Contracts & clients',
    html: `
      ${lead(`Clients rent your racks for a set time and pay well, as long as you keep your uptime promise.${lvl('contract_board')}`)}
      <h4>Getting clients in</h4>
      <ol>
        <li>Put a <b>front door</b> in an outside wall (Walls menu).</li>
        <li>Build a <b>reception desk</b> (Decor menu).</li>
        <li>Clients walk in and queue at the desk. Sign them in <b>Contracts (K)</b>.</li>
      </ol>
      <h4>The deal</h4>
      <ul>
        <li>Keep the promised <b>uptime</b> for the whole contract to earn a bonus. Fall short and you pay a penalty.</li>
        <li>Some clients need better racks, more CPU cores or GPUs. The card shows ✓ or ✕ for each.</li>
        <li>Contracted racks don't count towards market saturation, so contracts are how big datacentres make money.</li>
      </ul>`,
  },
  {
    id: 'decor',
    group: 'Growing',
    title: 'Decor & prestige',
    html: `
      ${lead('A good-looking datacentre earns <b>prestige</b>: better contract pay, more offers and bigger press visits.')}
      <ul>
        <li>Every decoration (Decor menu) and room style (<b>Style, L</b>) adds prestige.</li>
        <li><b>Decor sets</b>: build one of each item in a set (Lounge, Games room, Indoor garden and more) for a bonus on top. The Style panel shows what's missing, and each item's card says which set it belongs to.</li>
        <li>The <b>trophy case</b> fills up as you earn achievements.</li>
      </ul>`,
  },
  // --- Late game ---
  {
    id: 'incidents',
    group: 'Late game',
    title: 'Incidents',
    html: `
      ${lead(`Things go wrong now and then, and more often the bigger you are.${lvl('events')} Each problem has a building that protects you from it.`)}
      <ul>
        <li><b>Power cut</b> → <b>UPS battery banks</b> cover the gap. Upgrade them for more backup.</li>
        <li><b>Heatwave</b> → spare cooling. The room gets ${CONFIG.events.heatwaveBoost}°C warmer for up to a day.</li>
        <li><b>Fire</b> → <b>fire suppression</b>. Without it, a hot rack and its neighbours burn out.</li>
        <li><b>Cyber attack</b> → <b>firewalls</b>. Each blocks up to ${CONFIG.safety.firewallMaxShare * 100}% of an attack, and they add up.</li>
      </ul>
      <p>A failed rack shows a red <b>!</b> above it. Click it to repair. Some news is good: <b>rush jobs</b> pay cash, and <b>press visits</b> pay more the more prestige you have.</p>
      <p class="tip">Build protection from the <b>Safety</b> menu (F).</p>`,
  },
  {
    id: 'daynight',
    group: 'Late game',
    title: 'Day & night',
    html: `
      ${lead('Demand follows the clock: quiet before dawn, busiest around 8pm.')}
      <ul>
        <li>Electricity is <b>cheap at night</b> (00:00–07:00, ${CONFIG.dayNight.nightRate}×) and <b>expensive at the evening peak</b> (17:00–21:00, ${CONFIG.dayNight.peakRate}×).</li>
        <li><b>UPS batteries</b> in <i>Save money</i> mode charge at night and cover the peak. In <i>Keep for outages</i> mode they stay full. Switch modes in a UPS bank's details.</li>
        <li>The room is about ${CONFIG.dayNight.tempSwing}°C warmer in the afternoon.</li>
      </ul>
      <p class="tip">Don't like the lighting change? Turn off <b>Day and night lighting</b> in the menu.</p>`,
  },
  {
    id: 'bigcompany',
    group: 'Late game',
    title: 'Running a big company',
    html: `
      ${lead('Growing gets harder on purpose. Better racks beat more racks.')}
      <ul>
        <li><b>Reputation</b> (★, top left) follows how well you run things: uptime, cool racks, few failures and decor. It changes how many customers come and what they pay.</li>
        <li><b>Facility overhead</b>: past ${CONFIG.pressure.overheadFreeRacks} racks, each rack costs more to run.</li>
        <li><b>Corporation tax</b> comes off each day's profit, in bands.</li>
        <li><b>End of life</b>: ${CONFIG.pressure.endOfLifeDays} days after its last new CPU or refurbish, a rack starts failing.</li>
        <li>From level ${CONFIG.pressure.lateFromLevel}: <b>blackouts</b>, <b>ransomware</b> and <b>major fires</b>, plus stricter clients.</li>
      </ul>
      <p class="tip">Choose <b>Relaxed</b>, <b>Normal</b> or <b>Tough</b> difficulty in the menu at any time.</p>`,
  },
  {
    id: 'compliance',
    group: 'Late game',
    title: 'Compliance',
    html: `
      ${lead(`Get certified to win the biggest clients: banks, hospitals, governments and stock exchanges.${lvl('compliance')}`)}
      <h4>How it works</h4>
      <ol>
        <li>Open <b>Compliance (I)</b> and pick a certification: ISO 27001, SOC 2, Green energy, Tier III or Tier IV.</li>
        <li>Check its requirements (firewalls, UPS backup, fire cover, uptime, staff…). Each shows ✓ or ✕ live.</li>
        <li><b>Apply</b> and pay the fee. The auditor reports after ${CONFIG.compliance.auditDays} day: pass if every requirement is ✓ then.</li>
      </ol>
      <h4>Keeping it</h4>
      <ul>
        <li>Each certification adds contract pay and brings new client types.</li>
        <li>It renews every ${CONFIG.compliance.renewEveryDays} days for ${CONFIG.compliance.renewFraction * 100}% of the fee.</li>
        <li>A daily check watches the requirements. If one slips, it's <b>at risk</b>; fix it within ${CONFIG.compliance.graceDays} days or it's <b>revoked</b>. Clients who needed it walk away and their contracts count as broken.</li>
      </ul>`,
  },
  {
    id: 'research',
    group: 'Late game',
    title: 'Research & selling up',
    html: `
      ${lead(`Spend cash and time on permanent bonuses.${lvl('research')}`)}
      <ul>
        <li>Open <b>Research (Y)</b>. One project at a time. It's paid upfront and finishes after its game days.</li>
        <li>From level ${CONFIG.legacy.minLevel} you can <b>sell the company</b> (bottom of Research). You start again, but earn <b>legacy points</b>: +${CONFIG.legacy.incomePerPoint * 100}% income and extra starting cash each, forever.</li>
      </ul>`,
  },
  // --- Tools ---
  {
    id: 'selecting',
    group: 'Tools',
    title: 'Selecting & building fast',
    html: `
      ${lead('Select (E) to pick things, then act on all of them at once.')}
      <h4>Selecting</h4>
      <ul>
        <li><b>Click</b> a building to select it. Click it again for its details.</li>
        <li><b>Shift+click</b> adds or removes one. <b>Drag a box</b> to select everything inside it.</li>
        <li>On touch screens, turn on <b>+ Add mode</b> in the selection bar, then tap to add or remove.</li>
        <li>The selection bar can <b>upgrade, repair, refurbish, rotate, move or sell</b> everything selected. <kbd>Q</kbd> rotates, <kbd>Esc</kbd> clears.</li>
      </ul>
      <h4>Building</h4>
      <ul>
        <li>Pick an item: a <b>hologram</b> shows where it goes. Blue means it fits; red means it doesn't (or you can't afford it).</li>
        <li><b>Drag</b> with a build tool to place many. Wide boxes leave aisles so staff can reach every rack.</li>
        <li>Drag with <b>Sell (X)</b> to sell a box. <b>Move (M)</b> carries a building, or a box of them.</li>
        <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes your last few changes, for up to a minute.</li>
      </ul>`,
  },
  {
    id: 'rooms',
    group: 'Tools',
    title: 'Rooms & walls',
    html: `
      ${lead('Walls block heat and people; doors let people through.')}
      <ul>
        <li>Drag along grid lines with a wall tool. Put a door or glass on a wall to swap it.</li>
        <li>Buy more rooms by clicking a <b>Room for sale</b> next to one you own. Each costs more than the last, and rent is per room.</li>
        <li><kbd>V</kbd> shows walls full height.</li>
      </ul>`,
  },
  {
    id: 'achievements',
    group: 'Tools',
    title: 'Achievements & stats',
    html: `
      ${lead('Achievements reward feats, challenges and collections. Claim them yourself from the trophy.')}
      <ul>
        <li>When you earn one, the <b>trophy</b> (top right) lights up with a count. Open it and press <b>Claim</b> for the XP.</li>
        <li>Unearned achievements show how close you are.</li>
        <li><b>Stats (N)</b>: tick any of 30+ stats to graph them together. Hover the graph for exact values.</li>
      </ul>`,
  },
  {
    id: 'controls',
    group: 'Tools',
    title: 'Controls',
    html: `
      <table class="keys">
        <tr><td>Right-drag / WASD</td><td>Pan (or one-finger drag on touch)</td></tr>
        <tr><td>Wheel / pinch</td><td>Zoom</td></tr>
        <tr><td>Space, 1 2 3</td><td>Pause, speed</td></tr>
        <tr><td>E</td><td>Select: click, Shift+click, drag a box</td></tr>
        <tr><td>R P C F Z B</td><td>Racks, Power, Cooling, Safety, Zones, Walls</td></tr>
        <tr><td>M X</td><td>Move, Sell</td></tr>
        <tr><td>Q</td><td>Rotate (what you're placing, or the selection)</td></tr>
        <tr><td>Ctrl+Z</td><td>Undo</td></tr>
        <tr><td>H K T Y I</td><td>Heat map, Contracts, Staff, Research, Compliance</td></tr>
        <tr><td>N J L V G</td><td>Stats, All racks, Style, Tall walls, Guide</td></tr>
        <tr><td>Esc</td><td>Cancel, clear the selection, close panels</td></tr>
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
        this.root.querySelector('article')?.scrollTo(0, 0);
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
    const index = Math.max(0, SECTIONS.findIndex((s) => s.id === this.section));
    const current = SECTIONS[index]!;
    const prev = SECTIONS[index - 1];
    const next = SECTIONS[index + 1];
    let group = '';
    const nav = SECTIONS.map((s) => {
      const head = s.group !== group ? `<div class="guide-group">${s.group}</div>` : '';
      group = s.group;
      return `${head}<button data-section="${s.id}" class="${s.id === current.id ? 'active' : ''}">${s.title}</button>`;
    });
    this.root.innerHTML = `
      <div class="ct-head">${ICONS.guide}<h2>How to play</h2><button data-act="close" aria-label="Close">✕</button></div>
      <div class="guide-layout">
        <nav>${nav.join('')}</nav>
        <article>
          <h3>${current.title}</h3>${current.html}
          <div class="guide-pager">
            ${prev ? `<button data-section="${prev.id}">‹ ${prev.title}</button>` : '<span></span>'}
            ${next ? `<button data-section="${next.id}" class="primary">${next.title} ›</button>` : ''}
          </div>
        </article>
      </div>`;
  }
}
