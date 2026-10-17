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
  zones: svg('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1" stroke-dasharray="2 2"/><rect x="3" y="13" width="8" height="8" rx="1" stroke-dasharray="2 2"/><rect x="13" y="13" width="8" height="8" rx="1"/>'),
  staff: svg('<circle cx="9" cy="7" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="8" r="2.4"/><path d="M15.5 13.6c3 .2 5.5 2.6 5.5 5.9"/>'),
  guide: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5"/><circle cx="12" cy="17" r=".7" fill="currentColor"/>'),
  network: svg('<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/>'),
  walls: svg('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19"/>'),
  wallHeight: svg('<path d="M4 20h16M7 20V9M12 20V4M17 20v-8"/><path d="m10 6.5 2-2.5 2 2.5"/>'),
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
  wall_basic: svg('<path d="M3 14 12 9.5l9 4.5v3L12 21.5 3 17z"/><path d="M3 14v3M12 9.5v3M21 14v3M3 14l9 4.5 9-4.5M12 18.5v3"/>'),
  wall_door: svg('<rect x="6" y="2.5" width="12" height="19" rx="1"/><rect x="8.5" y="5" width="7" height="16.5" fill="#8a6a4a" stroke="#8a6a4a" opacity=".85"/><circle cx="14" cy="13" r=".9" fill="#d9c27a" stroke="none"/>'),
  wall_glass: svg('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M7 15l4-6M11 16l5-7" stroke="#bfe3ff"/>'),
  door_outside: svg('<rect x="5" y="2.5" width="14" height="19" rx="1"/><path d="M12 2.5v19" /><rect x="7" y="5" width="3.5" height="15" fill="#bfe3ff" stroke="none" opacity=".5"/><rect x="13.5" y="5" width="3.5" height="15" fill="#bfe3ff" stroke="none" opacity=".5"/><path d="M9 1h6" stroke="#4cc38a" stroke-width="2.2"/>'),
  cooling_ac: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="11" r="4.5"/><path d="M12 11l2.5-2.5M12 11l-2.5 2.5M12 11l2.5 2.5M12 11l-2.5-2.5"/><path d="M7 17.5h10" stroke="#4fb3ff" stroke-width="2"/>'),
  break_table: svg('<ellipse cx="12" cy="10" rx="8" ry="3"/><path d="M12 13v7M8 21h8"/><circle cx="3.5" cy="16" r="1.6" fill="#4aa8ff" stroke="none"/><circle cx="20.5" cy="16" r="1.6" fill="#4aa8ff" stroke="none"/>'),
  coffee_machine: svg('<rect x="5" y="2.5" width="14" height="19" rx="1.5"/><rect x="8" y="5" width="8" height="5" rx="1"/><path d="M9 15h5v3a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2zM14 16h1.5"/><circle cx="16" cy="12.5" r=".8" fill="#ff6a3a" stroke="none"/>'),
  lockers: svg('<rect x="3" y="3" width="6" height="18" fill="#4a62e8" opacity=".35"/><rect x="9" y="3" width="6" height="18" fill="#3fbf6a" opacity=".35"/><rect x="15" y="3" width="6" height="18" fill="#e8603a" opacity=".35"/><path d="M3 3h18v18H3zM9 3v18M15 3v18M5 7h2M11 7h2M17 7h2"/>'),
  shelving: svg('<path d="M4 2v20M20 2v20M4 6h16M4 12h16M4 18h16"/><rect x="6" y="8" width="4" height="4" fill="#c9a227" stroke="none"/><rect x="12" y="14" width="5" height="4" fill="#4aa8ff" stroke="none"/><rect x="11" y="2.5" width="4" height="3.5" fill="#b08a5a" stroke="none"/>'),
  water_cooler: svg('<rect x="7" y="11" width="10" height="11" rx="1"/><path d="M9 11V4.5a3 3 0 0 1 6 0V11" fill="#7fc8ff" fill-opacity=".4"/><path d="M10 15h4"/>'),
  sofa: svg('<path d="M4 13V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" fill="#5a4b8a" fill-opacity=".4"/><path d="M2 13h20v5H2zM4 18v2M20 18v2"/>'),
  arcade_cabinet: svg('<path d="M7 2h10v20H7z"/><rect x="8.5" y="6" width="7" height="5" fill="#3fcf6a" stroke="none" opacity=".8"/><path d="M8 3.5h8" stroke="#ff5ab8" stroke-width="2"/><circle cx="10.5" cy="14" r="1" fill="currentColor"/><circle cx="13.5" cy="14.5" r="1" fill="currentColor"/>'),
  neon_sign: svg('<rect x="2" y="6" width="20" height="9" rx="1.5"/><path d="M5 9v3M7.5 9v3l2-3v3M12 9v3h2M16 9h2v3h-2zM16 10.5h1.5" stroke="#2bd4c4" stroke-width="1.6"/><path d="M12 15v6"/>'),
  aquarium: svg('<rect x="2" y="7" width="20" height="12" rx="1.5" fill="#2f9be0" fill-opacity=".35"/><path d="M7 13c1.5-1.8 3.5-1.8 5 0-1.5 1.8-3.5 1.8-5 0zM12 13l1.5-1.2v2.4z" fill="#ff9a3a" stroke="#ff9a3a"/><path d="M16 15.5c.8-1 2-1 2.8 0-.8 1-2 1-2.8 0z" fill="#ffd23a" stroke="#ffd23a"/>'),
  trophy_case: svg('<path d="M8 3h8v5a4 4 0 0 1-8 0z" fill="#ffd23a" fill-opacity=".6"/><path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4M12 12v4M8 21h8M9.5 16h5v5h-5z"/>'),
  zone_server: svg('<rect x="3" y="3" width="18" height="18" rx="2" fill="#4aa8ff" fill-opacity=".25" stroke="#4aa8ff"/><rect x="8" y="6" width="8" height="12" rx="1"/><path d="M10 9h4M10 12h4"/>'),
  zone_staff: svg('<rect x="3" y="3" width="18" height="18" rx="2" fill="#4cc38a" fill-opacity=".25" stroke="#4cc38a"/><path d="M8 11h7v3a3 3 0 0 1-3 3h-1a3 3 0 0 1-3-3zM15 12h1.5a1.5 1.5 0 0 1 0 3H15M10 6v2M13 6v2"/>'),
  zone_storage: svg('<rect x="3" y="3" width="18" height="18" rx="2" fill="#ffb347" fill-opacity=".25" stroke="#ffb347"/><path d="M7 10l5-3 5 3v6l-5 3-5-3zM7 10l5 3 5-3M12 13v6"/>'),
  zone_clear: svg('<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2"/><path d="M8 8l8 8M16 8l-8 8"/>'),
  sell: ICONS.sell,
};

export function itemIcon(id: string): string {
  return ITEM_ICONS[id] ?? ICONS.racks;
}
