import { hslHex } from './color';

/** Inline SVG icons on a 24×24 grid; each document states its size in dp. */

const stroke = (d: string) =>
  `<path d="${d}" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d: string) => `<path d="${d}" fill="COLOR"/>`;

const ICONS = {
  play: fill('M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z'),
  pause: fill('M7 5h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM14 5h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'),
  next: fill('M5 6.2v11.6a1 1 0 0 0 1.55.83l8.4-5.8a1 1 0 0 0 0-1.66l-8.4-5.8A1 1 0 0 0 5 6.2zM17 5h1.5a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5H17a.5.5 0 0 1-.5-.5v-13A.5.5 0 0 1 17 5z'),
  previous: fill('M19 6.2v11.6a1 1 0 0 1-1.55.83l-8.4-5.8a1 1 0 0 1 0-1.66l8.4-5.8A1 1 0 0 1 19 6.2zM7 5H5.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5H7a.5.5 0 0 0 .5-.5v-13A.5.5 0 0 0 7 5z'),
  shuffle: stroke('M3 7h3c5 0 6 10 11 10h4M3 17h3c1.8 0 3-1.3 4-3M14 10c1-1.7 2.2-3 4-3h3M18 4l3 3-3 3M18 14l3 3-3 3'),
  repeat: stroke('M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3'),
  repeatOne:
    stroke('M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3') +
    stroke('M11 10.5l1.5-1v5'),
  heart: stroke('M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z'),
  heartFilled: fill('M12 20.5s-8-4.8-8-10.7A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8 3.2c0 5.9-8 10.7-8 10.7z'),
  search: stroke('M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.8-4.8'),
  library: stroke('M5 4v16M10 4v16M14.5 4.5l5 15'),
  nowPlaying: stroke('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z') + fill('M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'),
  devices: stroke('M4 5h16v10H4zM2 19h20') + stroke('M9 15v4M15 15v4'),
  computer: stroke('M4 5h16v11H4zM8 20h8M12 16v4'),
  smartphone: stroke('M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2'),
  speaker: stroke('M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM12 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 7.5v.01'),
  tv: stroke('M3 6h18v12H3zM8 21h8'),
  car: stroke('M5 16v3M19 16v3M3 13l2-6h14l2 6v3H3zM7 13.5h.01M17 13.5h.01'),
  volume: fill('M4 9.5h3.5L12 5.5v13l-4.5-4H4z') + stroke('M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11'),
  volumeOff: fill('M4 9.5h3.5L12 5.5v13l-4.5-4H4z') + stroke('M16 9.5l5 5M21 9.5l-5 5'),
  queueAdd: stroke('M4 6h11M4 11h11M4 16h7M18 13v7M14.5 16.5h7'),
  back: stroke('M15 5l-7 7 7 7'),
  refresh: stroke('M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5'),
  signOut: stroke('M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10'),
  close: stroke('M6 6l12 12M18 6L6 18'),
  more: fill('M5 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM19 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'),
  music: stroke('M9 18V5l11-2v13') + fill('M6.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'),
} as const;

export type IconName = keyof typeof ICONS;

export function iconSvg(name: IconName, size: number, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${ICONS[
    name
  ].replace(/COLOR/g, color)}</svg>`;
}

export function logoSvg(size: number, hue = 250): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${hslHex(hue, 0.9, 0.7)}"/>
      <stop offset="100%" stop-color="${hslHex(hue + 60, 0.9, 0.6)}"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#g)"/>
  <circle cx="18" cy="24" r="6" fill="none" stroke="#0b1020" stroke-width="3.5"/>
  <path d="M28 17a10 10 0 0 1 0 14M33 12.5a16 16 0 0 1 0 23" fill="none" stroke="#0b1020" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;
}

export function deviceIcon(type: string): IconName {
  switch (type) {
    case 'Computer':
      return 'computer';
    case 'Smartphone':
    case 'Tablet':
      return 'smartphone';
    case 'TV':
    case 'STB':
    case 'CastVideo':
    case 'GameConsole':
      return 'tv';
    case 'Automobile':
      return 'car';
    default:
      return 'speaker';
  }
}
