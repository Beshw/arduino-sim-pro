/** Inline stroke icons (no icon font / network needed). */
import React from 'react';

const P: Record<string, React.ReactNode> = {
  cursor: <path d="M5 3l14 7-6 2-2 6z" />,
  move: <><path d="M12 2v20M2 12h20" /><path d="M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" /></>,
  rotate: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-5-5M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-5-5M8 11h6" /></>,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></>,
  play: <path d="M7 4l13 8-13 8z" fill="currentColor" />,
  pause: <><rect x="6" y="4" width="4" height="16" fill="currentColor" /><rect x="14" y="4" width="4" height="16" fill="currentColor" /></>,
  stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  code: <path d="M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16" />,
  chip: <><rect x="6" y="6" width="12" height="12" rx="1" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
  cube: <><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M3 7l9 5 9-5M12 12v10" /></>,
  layers: <><path d="M12 2l10 5-10 5L2 7z" /><path d="M2 12l10 5 10-5M2 17l10 5 10-5" /></>,
  cap: <><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6" /></>,
  folder: <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L2 10l8-8z" />,
  send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
  upload: <><path d="M12 21V9M7 14l5-5 5 5" /><path d="M4 3h16" /></>,
  check: <path d="M4 12l5 5L20 6" />,
  checkCircle: <><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 11v6M12 7h.01" /></>,
  serial: <><path d="M9 18l-6-6 6-6" /><path d="M15 6l6 6-6 6" /><path d="M12 9v6" /></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  usb: <><path d="M12 2v14" /><circle cx="12" cy="19" r="3" /><path d="M8 6h8M7 10l5 3 5-3" /></>,
  wave: <path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0 2 3 2 3" />,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></>,
  bolt: <path d="M13 2L3 14h9l-1 8 10-12h-9z" />,
  bulb: <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" /></>,
  hand: <><path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" /></>,
  gauge: <><path d="M12 14l4-4" /><path d="M3.3 19a10 10 0 1 1 17.4 0" /></>,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  thermo: <path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  schematic: <path d="M2 12h4l2-5 3 10 3-10 2 5h6" />,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></>,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  lang: <><path d="M4 5h8M8 3v2c0 4-2 7-5 9M6 9c1 2 3 4 6 5" /><path d="M13 21l4-9 4 9M14.5 18h5" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  speed: <><path d="M12 14l3-6" /><circle cx="12" cy="14" r="8" /></>,
};

export function Icon({ name, size = 18, className, style }: { name: string; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={'ico ' + (className ?? '')} style={style} aria-hidden>
      {P[name] ?? P.info}
    </svg>
  );
}

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 64 40" aria-hidden>
      <defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stopColor="#17c3d6" /><stop offset="1" stopColor="#2f9bff" /></linearGradient></defs>
      <circle cx="18" cy="20" r="13" fill="none" stroke="url(#lg)" strokeWidth="6" />
      <circle cx="46" cy="20" r="13" fill="none" stroke="url(#lg)" strokeWidth="6" />
      <path d="M11 20h4l2-4 3 8 2-4h3M39 20h14" stroke="url(#lg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
