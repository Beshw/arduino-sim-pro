/**
 * SVG drawings of every catalog part in local coordinates (pins as defined in
 * the catalog). Drawings react to live simulation outputs: LED glow from the
 * time-averaged diode current, servo horn angle, LCD characters, buzzer rings…
 */
import React from 'react';
import type { PartInstance } from '../../shared/project';
import { PART_MAP } from '../../shared/parts/catalog';

export type Live = Record<string, any> | undefined;
export interface PartHandlers {
  onPress?: (key: string, value: number) => void; // live interaction
  interactive: boolean;
}

const LED_COLORS: Record<string, string> = { red: '#ff3434', yellow: '#ffd21f', green: '#29e05a', blue: '#3c7bff', white: '#f4f7ff' };
const avg = (live: Live, k: string) => { const a = live?.avg?.[k]; return typeof a === 'number' ? a : typeof live?.[k] === 'number' ? live[k] : 0; };
const bright = (i: number) => Math.max(0, Math.min(1, i / 0.015));

/** local bounding box of the drawing, used for hit-testing and selection outline */
export function bodyBox(type: string): { x: number; y: number; w: number; h: number } {
  switch (type) {
    case 'uno': return { x: -12, y: 0, w: 312, h: 210 };
    case 'breadboard': return { x: 0, y: 0, w: 330, h: 190 };
    case 'resistor': return { x: -2, y: -7, w: 44, h: 14 };
    case 'led': return { x: -4, y: -32, w: 18, h: 34 };
    case 'rgb_led': return { x: 2, y: -36, w: 26, h: 38 };
    case 'button': return { x: -5, y: -5, w: 40, h: 40 };
    case 'switch': return { x: -6, y: -18, w: 32, h: 20 };
    case 'potentiometer': return { x: -6, y: -34, w: 32, h: 36 };
    case 'ldr': return { x: -3, y: -22, w: 16, h: 24 };
    case 'ntc': return { x: -3, y: -20, w: 16, h: 22 };
    case 'tmp36': return { x: -2, y: -20, w: 24, h: 22 };
    case 'dht11': return { x: -6, y: -46, w: 32, h: 48 };
    case 'hcsr04': return { x: -26, y: -46, w: 82, h: 48 };
    case 'buzzer': return { x: -9, y: -30, w: 28, h: 32 };
    case 'servo': return { x: -20, y: -64, w: 60, h: 66 };
    case 'dc_motor': return { x: -12, y: -36, w: 34, h: 38 };
    case 'lcd1602': return { x: -12, y: -86, w: 174, h: 88 };
    case 'seven_segment': return { x: -6, y: -2, w: 52, h: 34 };
    case 'capacitor': return { x: -4, y: -30, w: 18, h: 32 };
    case 'inductor': return { x: -2, y: -9, w: 34, h: 13 };
    case 'diode': return { x: -2, y: -6, w: 34, h: 12 };
    case 'npn': return { x: -3, y: -22, w: 26, h: 24 };
    case 'dc_supply': return { x: -10, y: -42, w: 40, h: 44 };
    default: { const d = PART_MAP[type]; return { x: -4, y: -4, w: (d?.w ?? 20) + 8, h: (d?.h ?? 20) + 8 }; }
  }
}

export function resistorBands(ohms: number): string[] {
  const C = ['#000', '#7b3f00', '#e01010', '#ff8c00', '#ffe000', '#10a010', '#1050e0', '#8a2be2', '#888', '#fff'];
  if (!(ohms > 0)) return [C[0], C[0], C[0]];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / Math.pow(10, exp));
  if (sig >= 100) { sig = Math.round(sig / 10); exp++; }
  const d1 = Math.floor(sig / 10), d2 = sig % 10;
  const mult = exp >= 0 && exp <= 9 ? C[exp] : exp === -1 ? '#d4af37' : '#c0c0c0';
  return [C[d1], C[d2], mult, '#d4af37'];
}

const Leg = ({ x, y1 = 0, y2 }: { x: number; y1?: number; y2: number }) => <line x1={x} y1={y1} x2={x} y2={y2} stroke="#b9c2cf" strokeWidth={1.6} strokeLinecap="round" />;

function Uno({ live, onReset }: { live: Live; onReset?: () => void }) {
  const pinLabels: [string, number, number][] = [];
  const top = ['AREF', 'GND', '13', '12', '~11', '~10', '~9', '8'];
  top.forEach((l, i) => pinLabels.push([l, 96 + i * 10, 22]));
  ['7', '~6', '~5', '4', '~3', '2', 'TX1', 'RX0'].forEach((l, i) => pinLabels.push([l, 186 + i * 10, 22]));
  const bottom = ['IOREF', 'RESET', '3.3V', '5V', 'GND', 'GND', 'VIN'];
  bottom.forEach((l, i) => pinLabels.push([l, 126 + i * 10, 188]));
  ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].forEach((l, i) => pinLabels.push([l, 206 + i * 10, 188]));
  const d13 = live?.d13 ?? 0;
  const tx = live?.tx ?? false;
  return (
    <g>
      <defs>
        <linearGradient id="pcb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1474b8" /><stop offset="1" stopColor="#0a4f86" /></linearGradient>
      </defs>
      <path d="M0 4 a4 4 0 0 1 4 -4 H284 l8 8 V30 l8 8 V176 l-8 8 V206 a4 4 0 0 1 -4 4 H4 a4 4 0 0 1 -4 -4 Z" fill="url(#pcb)" stroke="#063a63" strokeWidth={1.5} />
      {[[14, 12], [282, 22], [282, 190], [14, 198]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={4.5} fill="#e9eef5" stroke="#9fb2c6" />)}
      {/* USB-B and power jack */}
      <rect x={-12} y={34} width={46} height={40} rx={2} fill="#c9d1db" stroke="#7d8a99" />
      <rect x={-8} y={40} width={34} height={28} fill="#aab4c0" />
      <rect x={-6} y={150} width={40} height={34} rx={3} fill="#1b1f27" stroke="#000" />
      {/* headers */}
      <rect x={90} y={4} width={82} height={12} rx={1} fill="#151a22" />
      <rect x={180} y={4} width={82} height={12} rx={1} fill="#151a22" />
      <rect x={120} y={194} width={72} height={12} rx={1} fill="#151a22" />
      <rect x={200} y={194} width={62} height={12} rx={1} fill="#151a22" />
      {/* MCU */}
      <rect x={130} y={128} width={140} height={34} rx={2} fill="#1d2129" stroke="#0b0d11" />
      {Array.from({ length: 14 }).map((_, i) => <rect key={'a' + i} x={134 + i * 9.6} y={124} width={4} height={5} fill="#c5ccd6" />)}
      {Array.from({ length: 14 }).map((_, i) => <rect key={'b' + i} x={134 + i * 9.6} y={161} width={4} height={5} fill="#c5ccd6" />)}
      <circle cx={138} cy={145} r={3} fill="#2c313b" />
      <text x={200} y={149} fontSize={8} fill="#7f8896" textAnchor="middle" fontFamily="monospace">ATMEGA328P</text>
      {/* crystal, caps, regulator */}
      <rect x={70} y={112} width={24} height={9} rx={4.5} fill="#d9dee5" stroke="#8b97a5" />
      <circle cx={60} cy={168} r={8} fill="#c2c9d3" stroke="#777" /><circle cx={80} cy={168} r={8} fill="#c2c9d3" stroke="#777" />
      <rect x={48} y={92} width={18} height={14} fill="#22262e" />
      {/* reset button */}
      <g onPointerDown={(e) => { e.stopPropagation(); onReset?.(); }} style={{ cursor: onReset ? 'pointer' : undefined }}>
        <rect x={30} y={8} width={18} height={18} rx={2} fill="#d8dde4" stroke="#8691a0" />
        <circle cx={39} cy={17} r={5.5} fill="#e23b3b" />
      </g>
      {/* status LEDs */}
      <rect x={100} y={40} width={7} height={4} rx={1} fill={d13 ? '#ffb020' : '#5c4a26'} />
      {d13 ? <circle cx={103.5} cy={42} r={7} fill="#ffb020" opacity={0.45} filter="url(#glow)" /> : null}
      <text x={110} y={44} fontSize={5} fill="#d6e6f5">L</text>
      <rect x={100} y={50} width={7} height={4} rx={1} fill={tx ? '#ffb020' : '#5c4a26'} /><text x={110} y={54} fontSize={5} fill="#d6e6f5">TX</text>
      <rect x={100} y={60} width={7} height={4} rx={1} fill="#5c4a26" /><text x={110} y={64} fontSize={5} fill="#d6e6f5">RX</text>
      <rect x={240} y={60} width={7} height={4} rx={1} fill={live?.powered === false ? '#245030' : '#36f070'} />
      {live?.powered !== false ? <circle cx={243.5} cy={62} r={6} fill="#36f070" opacity={0.4} filter="url(#glow)" /> : null}
      <text x={250} y={64} fontSize={5} fill="#d6e6f5">ON</text>
      {/* board name */}
      <g transform="translate(150 78)">
        <rect x={-46} y={-16} width={92} height={28} rx={6} fill="none" stroke="#e9f3fb" strokeWidth={1.6} opacity={0.85} />
        <text x={0} y={5} fontSize={17} fontWeight={800} fill="#e9f3fb" textAnchor="middle" fontFamily="Segoe UI, Arial">UNO R3</text>
      </g>
      <text x={150} y={110} fontSize={7} fill="#cfe2f2" textAnchor="middle" fontFamily="Segoe UI, Arial">ATmega328P · 16 MHz</text>
      {pinLabels.map(([l, x, y]) => (
        <text key={l + x} x={x} y={y} fontSize={5.2} fill="#e7f1fa" textAnchor={y < 100 ? 'start' : 'end'} transform={`rotate(90 ${x} ${y})`} dominantBaseline="middle" fontFamily="Segoe UI, Arial">{l}</text>
      ))}
      <text x={96} y={34} fontSize={6} fill="#cfe2f2" fontFamily="Segoe UI, Arial">DIGITAL (PWM ~)</text>
      <text x={130} y={180} fontSize={6} fill="#cfe2f2" fontFamily="Segoe UI, Arial">POWER</text>
      <text x={206} y={180} fontSize={6} fill="#cfe2f2" fontFamily="Segoe UI, Arial">ANALOG IN</text>
    </g>
  );
}

const BB_RAIL_Y = [10, 20, 170, 180];
function Breadboard() {
  const holes: React.ReactElement[] = [];
  for (let c = 0; c < 30; c++) {
    const x = 20 + c * 10;
    for (let r = 0; r < 5; r++) { holes.push(<rect key={`t${c}${r}`} x={x - 2} y={40 + r * 10 - 2} width={4} height={4} rx={0.8} />); holes.push(<rect key={`b${c}${r}`} x={x - 2} y={110 + r * 10 - 2} width={4} height={4} rx={0.8} />); }
    if (c % 6 !== 5) for (const y of BB_RAIL_Y) holes.push(<rect key={`r${c}${y}`} x={x - 2} y={y - 2} width={4} height={4} rx={0.8} />);
  }
  return (
    <g>
      <rect x={0} y={0} width={330} height={190} rx={6} fill="#eef0ec" stroke="#cdd2cb" />
      <rect x={4} y={92} width={322} height={6} rx={2} fill="#d6dad3" />
      <line x1={14} y1={4} x2={316} y2={4} stroke="#2a62d6" strokeWidth={1.2} />
      <line x1={14} y1={26} x2={316} y2={26} stroke="#e0393e" strokeWidth={1.2} />
      <line x1={14} y1={164} x2={316} y2={164} stroke="#e0393e" strokeWidth={1.2} />
      <line x1={14} y1={186} x2={316} y2={186} stroke="#2a62d6" strokeWidth={1.2} />
      <text x={8} y={12} fontSize={7} fill="#2a62d6">−</text><text x={8} y={23} fontSize={7} fill="#e0393e">+</text>
      <text x={8} y={173} fontSize={7} fill="#e0393e">+</text><text x={8} y={183} fontSize={7} fill="#2a62d6">−</text>
      <g fill="#3b3f44">{holes}</g>
      {['a', 'b', 'c', 'd', 'e'].map((r, i) => <text key={r} x={8} y={42 + i * 10} fontSize={5.5} fill="#8a9088">{r}</text>)}
      {['f', 'g', 'h', 'i', 'j'].map((r, i) => <text key={r} x={8} y={112 + i * 10} fontSize={5.5} fill="#8a9088">{r}</text>)}
      {Array.from({ length: 6 }).map((_, i) => <text key={i} x={20 + (i * 5) * 10} y={33} fontSize={5} fill="#8a9088" textAnchor="middle">{i * 5 + 1}</text>)}
    </g>
  );
}

function Lcd({ live }: { live: Live }) {
  const lines: string[] = Array.isArray(live?.lines) ? live!.lines : ['', ''];
  const on = !!live?.displayOn;
  const bl = Math.max(0.15, Math.min(1, (Number(live?.backlight) || 0) / 0.012));
  return (
    <g>
      <rect x={-12} y={-86} width={174} height={84} rx={3} fill="#126c3a" stroke="#0b4a27" />
      {[[-6, -80], [156, -80], [-6, -8], [156, -8]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill="#e8ecf1" />)}
      <rect x={-2} y={-74} width={154} height={56} rx={2} fill="#1a1d22" />
      <rect x={4} y={-68} width={142} height={44} rx={1} fill={`rgba(${Math.round(60 + 70 * bl)},${Math.round(120 + 110 * bl)},${Math.round(40 + 30 * bl)},1)`} />
      {[0, 1].map((row) => (
        <g key={row}>
          {Array.from({ length: 16 }).map((_, col) => {
            const ch = on ? (lines[row] ?? '')[col] ?? ' ' : ' ';
            return (
              <g key={col}>
                <rect x={7 + col * 8.6} y={-64 + row * 20} width={7.6} height={16} fill="rgba(0,0,0,0.07)" />
                <text x={7 + col * 8.6 + 3.8} y={-51 + row * 20} fontSize={12} textAnchor="middle" fontFamily="'Courier New', monospace" fontWeight={700} fill="#13230f">{ch}</text>
              </g>
            );
          })}
        </g>
      ))}
      <rect x={-2} y={-10} width={154} height={8} fill="#0f0f12" />
    </g>
  );
}

function SevenSeg({ live, color }: { live: Live; color: string }) {
  const on = (s: string) => bright(avg(live, 'current_' + s));
  const c = LED_COLORS[color] ?? LED_COLORS.red;
  const seg = (s: string, d: string) => <path key={s} d={d} fill={c} opacity={0.12 + 0.88 * on(s)} />;
  // digit drawn in a 20x24 box at (10,3)
  return (
    <g>
      <rect x={-6} y={2} width={52} height={26} rx={2} fill="#202328" stroke="#0d0e10" />
      <g transform="translate(12 4) scale(0.9)">
        {seg('A', 'M3 0 h12 l-2 2.5 h-8 Z')}
        {seg('B', 'M16 1 v10 l-2.5 -1.5 v-7 Z')}
        {seg('C', 'M16 13 v10 l-2.5 -2 v-6.5 Z')}
        {seg('D', 'M3 24 h12 l-2 -2.5 h-8 Z')}
        {seg('E', 'M2 13 v10 l2.5 -2 v-6.5 Z')}
        {seg('F', 'M2 1 v10 l2.5 -1.5 v-7 Z')}
        {seg('G', 'M3.5 12 l2 -1.3 h7 l2 1.3 l-2 1.3 h-7 Z')}
        <circle cx={19.5} cy={23} r={1.4} fill={c} opacity={0.12 + 0.88 * on('DP')} />
      </g>
    </g>
  );
}

export function PartSvg({ part, live, h, onReset }: { part: PartInstance; live: Live; h: PartHandlers; onReset?: () => void }) {
  const p = part.props;
  const press = (key: string, v: number) => (e: React.PointerEvent) => { if (!h.interactive) return; e.stopPropagation(); h.onPress?.(key, v); };
  switch (part.type) {
    case 'uno': return <Uno live={live} onReset={onReset} />;
    case 'breadboard': return <Breadboard />;
    case 'resistor': {
      const bands = resistorBands(Number(p.ohms));
      const hot = live?.overPower;
      return (
        <g>
          <line x1={0} y1={0} x2={40} y2={0} stroke="#b9c2cf" strokeWidth={1.6} />
          <rect x={9} y={-4.5} width={22} height={9} rx={4} fill={hot ? '#ff7043' : '#e3c79a'} stroke="#a88c5e" strokeWidth={0.6} />
          {bands.map((b, i) => <rect key={i} x={12 + i * 4.4 + (i === 3 ? 1.8 : 0)} y={-4.5} width={2.2} height={9} fill={b} />)}
        </g>
      );
    }
    case 'led': {
      const c = LED_COLORS[String(p.color)] ?? LED_COLORS.red;
      const b = bright(avg(live, 'current_anode'));
      return (
        <g>
          <Leg x={0} y2={-13} /><Leg x={10} y2={-13} />
          {b > 0.02 && <circle cx={5} cy={-21} r={16} fill={c} opacity={0.65 * b} filter="url(#glow)" />}
          <path d="M-1 -13 h12 v-8 a6 6 0 0 0 -12 0 Z" fill={c} opacity={0.55 + 0.45 * b} stroke="rgba(0,0,0,0.35)" strokeWidth={0.6} />
          <rect x={-2} y={-14} width={14} height={2} rx={0.6} fill={c} opacity={0.8} />
          <ellipse cx={2.5} cy={-23} rx={1.6} ry={3} fill="#fff" opacity={0.55} />
          {b > 0.02 && <circle cx={5} cy={-21} r={4} fill="#fff" opacity={0.6 * b} />}
          {live?.overCurrent && <text x={14} y={-24} fontSize={9} fill="#ff5a5a">⚠</text>}
        </g>
      );
    }
    case 'rgb_led': {
      const r = bright(avg(live, 'current_R')), g = bright(avg(live, 'current_G')), bl = bright(avg(live, 'current_B'));
      const col = `rgb(${Math.round(80 + 175 * r)},${Math.round(80 + 175 * g)},${Math.round(80 + 175 * bl)})`;
      const any = Math.max(r, g, bl);
      return (
        <g>
          {[0, 10, 20, 30].map((x) => <Leg key={x} x={x} y2={-14} />)}
          {any > 0.02 && <circle cx={15} cy={-24} r={20} fill={col} opacity={0.6 * any} filter="url(#glow)" />}
          <path d="M5 -14 h20 v-10 a10 10 0 0 0 -20 0 Z" fill={col} opacity={0.7 + 0.3 * any} stroke="rgba(0,0,0,0.3)" strokeWidth={0.6} />
          <ellipse cx={10} cy={-26} rx={2} ry={4} fill="#fff" opacity={0.45} />
        </g>
      );
    }
    case 'button': {
      const pressed = Number(p.pressed) > 0.5;
      return (
        <g onPointerDown={press('pressed', 1)} onPointerUp={press('pressed', 0)} onPointerLeave={(e) => { if (pressed && h.interactive) press('pressed', 0)(e); }} style={{ cursor: h.interactive ? 'pointer' : undefined }}>
          <rect x={-4} y={-4} width={38} height={38} rx={3} fill="#2a2e35" stroke="#121418" />
          {[[-1, -1], [31, -1], [-1, 31], [31, 31]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2} fill="#8d96a3" />)}
          <circle cx={15} cy={15} r={pressed ? 9 : 10} fill={pressed ? '#14171b' : '#1c1f24'} stroke="#000" />
          <circle cx={15} cy={15} r={pressed ? 6.5 : 7.5} fill={pressed ? '#3a7bd5' : '#495260'} />
          {h.interactive && <circle cx={15} cy={15} r={13} fill="none" stroke="#2f9bff" strokeOpacity={0.35} strokeDasharray="2 2" />}
        </g>
      );
    }
    case 'switch': {
      const pos = Number(p.position) > 0.5;
      return (
        <g onPointerDown={press('position', pos ? 0 : 1)} style={{ cursor: h.interactive ? 'pointer' : undefined }}>
          {[0, 10, 20].map((x) => <Leg key={x} x={x} y2={-4} />)}
          <rect x={-6} y={-16} width={32} height={12} rx={2} fill="#1f2a3a" stroke="#0c121b" />
          <rect x={pos ? 12 : -1} y={-20} width={10} height={9} rx={1.5} fill="#e6e9ee" stroke="#8892a0" />
        </g>
      );
    }
    case 'potentiometer': {
      const pos = Number(p.position);
      const ang = -135 + 270 * pos;
      return (
        <g style={{ cursor: h.interactive ? 'ns-resize' : undefined }}
          onPointerDown={(e) => {
            if (!h.interactive) return;
            e.stopPropagation();
            const el = e.currentTarget as SVGGElement; el.setPointerCapture(e.pointerId);
            const y0 = e.clientY, p0 = pos;
            const mv = (ev: PointerEvent) => h.onPress?.('position', Math.max(0, Math.min(1, Math.round((p0 + (y0 - ev.clientY) / 150) * 100) / 100)));
            const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); };
            el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
          }}
          onWheel={(e) => { if (!h.interactive) return; e.stopPropagation(); h.onPress?.('position', Math.max(0, Math.min(1, Math.round((pos - Math.sign(e.deltaY) * 0.02) * 100) / 100))); }}>
          {[0, 10, 20].map((x) => <Leg key={x} x={x} y2={-6} />)}
          <rect x={-6} y={-32} width={32} height={26} rx={2} fill="#1f5fbf" stroke="#123c7c" />
          <circle cx={10} cy={-19} r={10} fill="#2c3440" stroke="#11161d" />
          <circle cx={10} cy={-19} r={7.5} fill="#e8ebef" />
          <line x1={10} y1={-19} x2={10 + 7 * Math.sin((ang * Math.PI) / 180)} y2={-19 - 7 * Math.cos((ang * Math.PI) / 180)} stroke="#1a1d22" strokeWidth={2} strokeLinecap="round" />
          <text x={10} y={-34} fontSize={6} textAnchor="middle" fill="#9fb4cc">{Math.round(pos * 100)}%</text>
        </g>
      );
    }
    case 'ldr': {
      const lux = Number(p.lux);
      return (
        <g onWheel={(e) => { if (!h.interactive) return; e.stopPropagation(); h.onPress?.('lux', Math.max(0.1, Math.round(lux * (e.deltaY < 0 ? 1.25 : 0.8) * 10) / 10)); }}>
          <Leg x={0} y2={-8} /><Leg x={10} y2={-8} />
          <circle cx={5} cy={-14} r={7.5} fill="#d9902f" stroke="#8a5717" />
          <path d="M0 -17 h3 v3 h4 v-3 h3 M0 -11 h3 v-3 M7 -14 v3 h3" stroke="#5a2f08" strokeWidth={1} fill="none" />
          <text x={5} y={-24} fontSize={5.5} textAnchor="middle" fill="#9fb4cc">{lux >= 1000 ? (lux / 1000).toFixed(1) + 'k' : Math.round(lux)} lx</text>
        </g>
      );
    }
    case 'ntc': return (<g><Leg x={0} y2={-8} /><Leg x={10} y2={-8} /><ellipse cx={5} cy={-13} rx={6} ry={6.5} fill="#2b6fd8" stroke="#123b80" /><text x={5} y={-22} fontSize={5.5} textAnchor="middle" fill="#9fb4cc">{Number(p.temperature)}°C</text></g>);
    case 'tmp36': return (
      <g>{[0, 10, 20].map((x) => <Leg key={x} x={x} y2={-6} />)}<path d="M-1 -6 h22 v-6 a11 9 0 0 0 -22 0 Z" fill="#1c1e22" stroke="#000" /><text x={10} y={-9} fontSize={4.5} textAnchor="middle" fill="#bbb">TMP36</text><text x={10} y={-23} fontSize={5.5} textAnchor="middle" fill="#9fb4cc">{Number(p.temperature)}°C</text></g>
    );
    case 'dht11': return (
      <g>{[0, 10, 20].map((x) => <Leg key={x} x={x} y2={-6} />)}
        <rect x={-6} y={-44} width={32} height={38} rx={2} fill="#2f7fd6" stroke="#174b85" />
        {Array.from({ length: 4 }).map((_, r) => Array.from({ length: 4 }).map((__, c) => <rect key={r + '-' + c} x={-2 + c * 7} y={-40 + r * 7} width={5} height={5} rx={1} fill="#1d5aa0" />))}
        <text x={10} y={-8.5} fontSize={4.5} textAnchor="middle" fill="#dbe9fa">{Number(p.temperature)}°C {Number(p.humidity)}%</text>
      </g>
    );
    case 'hcsr04': return (
      <g>{[0, 10, 20, 30].map((x) => <Leg key={x} x={x} y2={-6} />)}
        <rect x={-26} y={-44} width={82} height={38} rx={2} fill="#1a4f9c" stroke="#0e3266" />
        {[-8, 38].map((cx) => <g key={cx}><circle cx={cx} cy={-25} r={14} fill="#c9ced6" stroke="#7e8794" /><circle cx={cx} cy={-25} r={10} fill="#3b3f46" /><circle cx={cx} cy={-25} r={6} fill="#22252a" /></g>)}
        <rect x={9} y={-40} width={12} height={6} rx={1} fill="#c8ccd2" />
        <text x={15} y={-9} fontSize={5.5} textAnchor="middle" fill="#dbe9fa">{Number(p.distance)} cm</text>
      </g>
    );
    case 'buzzer': {
      const f = Number(live?.frequency) || 0;
      return (
        <g>
          <Leg x={0} y2={-6} /><Leg x={10} y2={-6} />
          {f > 0 && [16, 22, 28].map((r, i) => <circle key={r} cx={5} cy={-16} r={r} fill="none" stroke="#a46bff" strokeWidth={1.2} className="sound-ring" style={{ animationDelay: `${i * 0.2}s` }} />)}
          <circle cx={5} cy={-16} r={13} fill="#121417" stroke="#000" />
          <circle cx={5} cy={-16} r={9} fill="#1d2025" />
          <circle cx={5} cy={-16} r={2.5} fill="#07080a" />
          <text x={12} y={-25} fontSize={6} fill="#f0f0f0">+</text>
        </g>
      );
    }
    case 'servo': {
      const a = Number(live?.angle ?? 90);
      return (
        <g>
          {[0, 10, 20].map((x, i) => <line key={x} x1={x} y1={0} x2={x} y2={-8} stroke={['#5b3a1e', '#e0393e', '#f0a020'][i]} strokeWidth={2} />)}
          <rect x={-20} y={-56} width={60} height={48} rx={3} fill="#2f6fd0" stroke="#173d7a" />
          <rect x={-26} y={-44} width={72} height={6} rx={2} fill="#2a63bb" />
          <circle cx={10} cy={-38} r={9} fill="#e6e9ee" stroke="#9aa3af" />
          <g transform={`rotate(${a - 90} 10 -38)`} style={{ transition: 'transform 0.12s linear' }}>
            <path d="M10 -64 l4 4 v20 h-8 v-20 Z" fill="#f4f6f8" stroke="#9aa3af" />
            <circle cx={10} cy={-60} r={1.5} fill="#9aa3af" />
          </g>
          <circle cx={10} cy={-38} r={2.5} fill="#9aa3af" />
          <text x={10} y={-12} fontSize={6} textAnchor="middle" fill="#dbe9fa">{Math.round(a)}°</text>
        </g>
      );
    }
    case 'dc_motor': {
      const rpm = Number(live?.rpm) || 0;
      const dur = Math.abs(rpm) > 5 ? Math.max(0.05, 60 / Math.abs(rpm)) * 8 : 0;
      return (
        <g>
          <Leg x={0} y2={-6} /><Leg x={10} y2={-6} />
          <circle cx={5} cy={-20} r={15} fill="#c7ccd4" stroke="#7d8692" />
          <g className={dur ? 'spin' : undefined} style={{ animationDuration: `${dur}s`, transformOrigin: '5px -20px', animationDirection: rpm < 0 ? 'reverse' : 'normal' }}>
            <circle cx={5} cy={-20} r={5} fill="#f5f6f8" stroke="#666" />
            <rect x={4} y={-33} width={2} height={13} fill="#444" />
          </g>
          <text x={5} y={-38} fontSize={5.5} textAnchor="middle" fill="#9fb4cc">{Math.round(rpm)} rpm</text>
        </g>
      );
    }
    case 'lcd1602': return <Lcd live={live} />;
    case 'seven_segment': return <SevenSeg live={live} color={String(p.color)} />;
    case 'capacitor': return (
      <g><Leg x={0} y2={-8} /><Leg x={10} y2={-8} />
        <rect x={-3} y={-28} width={16} height={20} rx={3} fill="#2747a6" stroke="#152a66" />
        <rect x={7} y={-28} width={4} height={20} fill="#c8d1ea" opacity={0.75} />
        <text x={9} y={-12} fontSize={5} fill="#24325a">−</text>
        <ellipse cx={5} cy={-28} rx={8} ry={1.5} fill="#9aa5c2" />
      </g>
    );
    case 'inductor': return (
      <g><line x1={0} y1={0} x2={30} y2={0} stroke="#b9c2cf" strokeWidth={1.6} />
        <rect x={5} y={-6} width={20} height={11} rx={5} fill="#3f8f4d" stroke="#225c2c" />
        {[8, 12, 16, 20].map((x) => <line key={x} x1={x} y1={-6} x2={x + 2} y2={5} stroke="#b87333" strokeWidth={1.3} />)}
      </g>
    );
    case 'diode': return (
      <g><line x1={0} y1={0} x2={30} y2={0} stroke="#b9c2cf" strokeWidth={1.6} />
        <rect x={7} y={-4.5} width={16} height={9} rx={2} fill="#1c1e22" />
        <rect x={19} y={-4.5} width={2.5} height={9} fill="#c9ccd1" />
      </g>
    );
    case 'npn': return (
      <g>{[0, 10, 20].map((x) => <Leg key={x} x={x} y2={-6} />)}<path d="M-1 -6 h22 v-6 a11 9 0 0 0 -22 0 Z" fill="#1c1e22" stroke="#000" /><text x={10} y={-9} fontSize={4.5} textAnchor="middle" fill="#bbb">2N2222</text></g>
    );
    case 'dc_supply': return (
      <g><Leg x={0} y2={-6} /><Leg x={20} y2={-6} />
        <rect x={-10} y={-42} width={40} height={36} rx={3} fill="#1e2530" stroke="#0b0f15" />
        <rect x={-6} y={-38} width={32} height={14} rx={1.5} fill="#0e3a24" />
        <text x={10} y={-27.5} fontSize={9} textAnchor="middle" fill="#45f08b" fontFamily="monospace">{Number(p.volts).toFixed(1)}V</text>
        <circle cx={0} cy={-14} r={3} fill="#e0393e" /><circle cx={20} cy={-14} r={3} fill="#222" stroke="#666" />
      </g>
    );
    default: {
      const d = PART_MAP[part.type];
      return <g><rect x={-4} y={-4} width={(d?.w ?? 20) + 8} height={(d?.h ?? 20) + 8} rx={3} fill="#334" /><text x={4} y={8} fontSize={6} fill="#fff">{part.type}</text></g>;
    }
  }
}

/** Small icon used in palettes (renders the real drawing scaled to fit). */
export function PartIcon({ type, size = 40 }: { type: string; size?: number }) {
  const bb = bodyBox(type);
  const def = PART_MAP[type];
  const part: PartInstance = { id: 'icon', type, x: 0, y: 0, props: Object.fromEntries((def?.props ?? []).map((p) => [p.key, p.default])) };
  const live = type === 'led' ? { avg: { current_anode: 0.012 } } : type === 'lcd1602' ? { displayOn: true, lines: ['Hello', ''], backlight: 0.01 } : undefined;
  const pad = 4;
  return (
    <svg width={size} height={size} viewBox={`${bb.x - pad} ${bb.y - pad} ${bb.w + 2 * pad} ${bb.h + 2 * pad}`} aria-hidden>
      <PartSvg part={part} live={live} h={{ interactive: false }} />
    </svg>
  );
}
