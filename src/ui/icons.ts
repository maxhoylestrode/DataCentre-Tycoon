// Line icons drawn as inline SVG (no image files). 24×24 viewBox, stroked in
// currentColor so CSS controls the colour. Item icons can take an accent
// colour for fills (e.g. each rack model's LED colour).

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// Toolbar group and toggle icons.
export const ICONS = {
  racks: svg('<rect x="6" y="2.5" width="12" height="19" rx="1.5"/><path d="M9 7h6M9 11h6M9 15h6"/><circle cx="15.5" cy="18.5" r=".6" fill="currentColor"/>'),
  power: svg('<path d="M13 2 5 13.5h6L10 22l9-12h-6z"/>'),
  cooling: svg('<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/><path d="m9.5 3.5 2.5 2 2.5-2M9.5 20.5l2.5-2 2.5 2"/>'),
  decor: svg('<path d="M7 21h10l-1.5-6h-7z"/><path d="M12 15c0-4-1-7-5-9 3 0 5 1.5 5 4 0-3.5 2-6 6-6-3 2.5-4 5.5-6 11"/>'),
  sell: svg('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  heat: svg('<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/><path d="M12 9v8"/>'),
  contracts: svg('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>'),
  style: svg('<path d="M18 3l3 3-9.5 9.5-3-3z"/><path d="M8.5 12.5c-2 0-3.5 1.5-3.5 3.5 0 1.5-1 2.5-2 3 3 1 7 .5 8.5-3"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
} as const;

export type GroupIcon = keyof typeof ICONS;

// Per-item icons for the build menu cards. `accent` tints the details.
const rack = (accent: string, tall = false): string =>
  svg(`<rect x="6" y="${tall ? 1.5 : 3}" width="12" height="${tall ? 21 : 18}" rx="1.5"/>
    <path d="M9 7h6M9 10.5h6M9 14h6"/>
    <circle cx="15.5" cy="18.5" r="1" fill="${accent}" stroke="none"/>
    <circle cx="12.5" cy="18.5" r="1" fill="${accent}" stroke="none"/>`);

const ITEM_ICONS: Record<string, string> = {
  rack_basic: rack('#5dff9a'),
  rack_performance: rack('#4fb3ff'),
  rack_enterprise: rack('#ffffff', true),
  rack_gpu: svg(`<rect x="6" y="1.5" width="12" height="21" rx="1.5"/>
    <rect x="8.5" y="5" width="7" height="4" rx=".5" fill="#76ff3a" stroke="none" opacity=".8"/>
    <rect x="8.5" y="11" width="7" height="4" rx=".5" fill="#76ff3a" stroke="none" opacity=".8"/>
    <path d="M9 18.5h6"/>`),
  rack_hyperscale: svg(`<rect x="2.5" y="2" width="8.5" height="20" rx="1.2"/><rect x="13" y="2" width="8.5" height="20" rx="1.2"/>
    <path d="M5 7h3.5M5 11h3.5M15.5 7H19M15.5 11H19"/>
    <circle cx="6.8" cy="18" r="1" fill="#c77dff" stroke="none"/><circle cx="17.2" cy="18" r="1" fill="#c77dff" stroke="none"/>`),
  power_basic: svg('<rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M8 7V4.5M16 7V4.5"/><path d="M12.8 9.5 10 14h3l-1 3.5 3-4.5h-3z" fill="#ffd23a" stroke="#ffd23a" stroke-width="1"/>'),
  cooling_fan: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="6"/><path d="M12 12c0-3 1-4.5 3-5M12 12c2.6 1.5 3.3 3.2 2.5 5.5M12 12c-2.6 1.5-4.4 1.3-5.5-.5"/>'),
  cooling_inrow: svg('<rect x="7.5" y="1.5" width="9" height="21" rx="1.5"/><path d="M10 6h4M10 9h4M10 12h4M10 15h4M10 18h4" stroke="#4fb3ff"/>'),
  chiller: svg('<rect x="2.5" y="8" width="19" height="12" rx="1.5"/><circle cx="8" cy="8" r="3.2"/><circle cx="16" cy="8" r="3.2"/><path d="M7 20v2M17 20v2" stroke="#2f6bff"/>'),
  floor_vent: svg('<path d="M2.5 15 12 10l9.5 5L12 20z"/><path d="m6 13.2 9.5 4.8M8.6 11.9l9.5 4.8M11 10.7l7.6 3.8" stroke="#4fb3ff"/>'),
  plant_small: svg('<path d="M8 21h8l-1-6H9z"/><circle cx="12" cy="10" r="4.5" fill="#3f9b4a" stroke="#3f9b4a" opacity=".85"/>'),
  light_pillar: svg('<path d="M12 3v17M8 21h8"/><path d="M14 4v14" stroke="#7de0ff" stroke-width="2.2"/>'),
  plant_tree: svg('<path d="M9 22h6l-.8-3.5H9.8zM12 18.5V14"/><path d="M12 2 6.5 14h11z" fill="#3f9b4a" stroke="#3f9b4a" opacity=".85"/>'),
  desk_reception: svg('<path d="M3 11h18v9H3zM3 11l2-3h14l2 3"/><rect x="9.5" y="4" width="5" height="4" rx=".5"/>'),
  sign_company: svg('<path d="M12 12v10"/><rect x="3" y="3" width="18" height="9" rx="1.5"/><path d="M7 7.5h10" stroke="#8f7cff" stroke-width="2.4"/>'),
  server_showcase: svg('<rect x="4" y="16" width="16" height="5" rx="1"/><path d="M5 16V5h14v11" stroke-dasharray="2 1.5"/><rect x="9" y="8" width="6" height="8" rx=".5"/><path d="M10.5 12h3" stroke="#ffb347"/>'),
  sell: ICONS.sell,
};

export function itemIcon(id: string): string {
  return ITEM_ICONS[id] ?? ICONS.racks;
}
