/**
 * Auto-generated schematic from the extracted netlist: standard symbols for
 * each part, connections shown with colour-coded net labels and the live
 * node voltage from the circuit solver. Hovering a net highlights every
 * terminal on it.
 */
import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { PART_MAP } from '../../shared/parts/catalog';
import { buildNetlist } from '../../shared/circuit/netlist';
import { fmtV } from './CircuitCanvas';

const W = 130, H = 64; // cell size for a part symbol
const netColor = (name: string) => {
  if (name === 'GND') return '#8a96a8';
  if (name === '5V' || name === 'VIN') return '#ff5a5a';
  if (name === '3V3') return '#ff9b5a';
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 75% 62%)`;
};

function Symbol({ type, live }: { type: string; live: any }) {
  const s = { stroke: 'var(--sch-ink)', strokeWidth: 1.6, fill: 'none' } as const;
  switch (type) {
    case 'resistor': return <path d="M-25 0 h8 l3 -6 l6 12 l6 -12 l6 12 l6 -12 l3 6 h12" {...s} />;
    case 'led': case 'diode': {
      const lit = type === 'led' && Number(live?.avg?.current_anode ?? live?.current ?? 0) > 0.0005;
      return (
        <g>
          <path d="M-25 0 h17 M8 0 h17" {...s} />
          <path d="M-8 -9 L8 0 L-8 9 Z" {...s} fill={lit ? '#ff4d4d' : 'none'} />
          <path d="M8 -9 v18" {...s} />
          {type === 'led' && <path d="M0 -12 l6 -8 M5 -12 l6 -8 M6 -20 l0 3 M6 -20 l-3 1 M11 -20 l0 3 M11 -20 l-3 1" {...s} strokeWidth={1.1} />}
        </g>
      );
    }
    case 'capacitor': return <path d="M-25 0 h21 M4 0 h21 M-4 -10 v20 M4 -10 v20" {...s} />;
    case 'inductor': return <path d="M-25 0 h7 a4 4 0 0 1 8 0 a4 4 0 0 1 8 0 a4 4 0 0 1 8 0 a4 4 0 0 1 8 0 h11" {...s} />;
    case 'button': case 'switch': return <g><path d="M-25 0 h15 M10 0 h15" {...s} /><circle cx={-10} cy={0} r={2} {...s} /><circle cx={10} cy={0} r={2} {...s} /><path d={Number(live?.pressed ?? live?.position) ? 'M-8 -2 L10 -2' : 'M-8 -2 L9 -10'} {...s} /></g>;
    case 'buzzer': return <g><path d="M-25 0 h13 M12 0 h13" {...s} /><rect x={-12} y={-9} width={24} height={18} rx={2} {...s} /><path d="M-6 -4 v8 M0 -6 v12 M6 -4 v8" {...s} strokeWidth={1.1} /></g>;
    case 'dc_motor': return <g><path d="M-25 0 h13 M12 0 h13" {...s} /><circle r={12} {...s} /><text y={4.5} textAnchor="middle" fontSize={12} fill="var(--sch-ink)">M</text></g>;
    case 'ldr': case 'ntc': return <g><path d="M-25 0 h8 l3 -6 l6 12 l6 -12 l6 12 l6 -12 l3 6 h12" {...s} /><path d="M-12 12 L12 -12 M12 -12 l-5 1 M12 -12 l-1 5" {...s} strokeWidth={1.1} /></g>;
    default: return null;
  }
}

export default function Schematic() {
  const project = useStore((s) => s.project);
  const snap = useStore((s) => s.snap);
  const lang = useStore((s) => s.lang);
  const [hover, setHover] = useState<string | null>(null);
  const nl = useMemo(() => buildNetlist(project), [project.parts, project.wires]);
  const netName = (ep: string) => { const id = nl.pinToNet.get(ep); return id === undefined ? null : nl.nets[id]; };
  const connected = (ep: string) => { const n = netName(ep); return !!n && n.pins.some((p) => !p.startsWith(ep.split('.')[0] + '.') && !p.startsWith('bb.')); };

  const board = project.parts.find((p) => p.type === 'uno');
  const others = project.parts.filter((p) => p.type !== 'uno' && p.type !== 'breadboard');
  const boardPins = board ? PART_MAP.uno.pins.filter((p) => connected(`${board.id}.${p.id}`) || ['5V', 'GND.1'].includes(p.id)) : [];
  const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(others.length))));

  const Label = ({ x, y, ep, side }: { x: number; y: number; ep: string; side: 'l' | 'r' }) => {
    const net = netName(ep);
    if (!net || !connected(ep)) return <g><circle cx={x} cy={y} r={2.2} fill="none" stroke="#f0a030" /><text x={x + (side === 'r' ? 6 : -6)} y={y + 3} fontSize={8} fill="#f0a030" textAnchor={side === 'r' ? 'start' : 'end'}>NC</text></g>;
    const c = netColor(net.name);
    const v = snap?.nets[net.name];
    const w = Math.max(26, net.name.length * 6.2 + 10);
    const lx = side === 'r' ? x + 4 : x - 4 - w;
    const on = hover === net.name;
    return (
      <g onPointerEnter={() => setHover(net.name)} onPointerLeave={() => setHover(null)} style={{ cursor: 'default' }}>
        {net.name === 'GND' ? (
          <g transform={`translate(${side === 'r' ? x + 10 : x - 10} ${y})`}><path d={`M${side === 'r' ? -10 : 10} 0 H0 V4 M-7 4 H7 M-4.5 7.5 H4.5 M-2 11 H2`} stroke={c} strokeWidth={1.6} fill="none" /></g>
        ) : (
          <g>
            <path d={side === 'r' ? `M${lx} ${y - 7} h${w - 6} l6 7 l-6 7 h${-(w - 6)} Z` : `M${lx + w} ${y - 7} h${-(w - 6)} l-6 7 l6 7 h${w - 6} Z`} fill={on ? c : 'var(--sch-bg)'} stroke={c} strokeWidth={1.3} />
            <text x={lx + w / 2 + (side === 'r' ? -2 : 2)} y={y + 3.2} fontSize={8.5} textAnchor="middle" fill={on ? '#0b1220' : c} fontWeight={600}>{net.name}</text>
          </g>
        )}
        {v !== undefined && net.name !== 'GND' && <text x={side === 'r' ? lx + w + 4 : lx - 4} y={y + 3} fontSize={7.5} fill="var(--muted)" textAnchor={side === 'r' ? 'start' : 'end'}>{fmtV(v)}</text>}
        {on && <circle cx={x} cy={y} r={4} fill={c} opacity={0.5} />}
      </g>
    );
  };

  const bx = 30, by = 30, bw = 120, rowH = 18;
  const bh = Math.max(120, boardPins.length * rowH + 40);
  const gx = bx + bw + 150;
  const vbW = gx + cols * (W + 110) + 40;
  const vbH = Math.max(bh + 60, Math.ceil(others.length / cols) * (H + 40) + 80);
  const [zoom, setZoom] = useState(1.5);

  return (
    <div className="schematic-wrap" data-testid="schematic" onWheel={(e) => { if (e.ctrlKey) { e.preventDefault(); setZoom((z) => Math.max(0.5, Math.min(4, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))); } }}>
      <div className="sch-zoom"><button className="btn sm" onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))}>−</button> {Math.round(zoom * 100)}% <button className="btn sm" onClick={() => setZoom((z) => Math.min(4, z * 1.2))}>+</button></div>
      <svg className="schematic-svg" width={vbW * zoom} height={vbH * zoom} viewBox={`0 0 ${vbW} ${vbH}`}>
        {board && (
          <g>
            <rect x={bx} y={by} width={bw} height={bh} rx={4} fill="var(--sch-box)" stroke="var(--sch-ink)" strokeWidth={1.6} />
            <text x={bx + bw / 2} y={by + 18} fontSize={11} textAnchor="middle" fill="var(--sch-ink)" fontWeight={700}>ATmega328P</text>
            <text x={bx + bw / 2} y={by + 30} fontSize={8} textAnchor="middle" fill="var(--muted)">Arduino Uno · {board.id}</text>
            {boardPins.map((p, i) => {
              const y = by + 46 + i * rowH;
              const ep = `${board.id}.${p.id}`;
              const pin = snap?.pins[p.id];
              return (
                <g key={p.id}>
                  <line x1={bx + bw} y1={y} x2={bx + bw + 24} y2={y} stroke="var(--sch-ink)" strokeWidth={1.4} />
                  <text x={bx + bw - 6} y={y + 3} fontSize={8.5} textAnchor="end" fill="var(--sch-ink)">{p.id.replace('.1', '')}</text>
                  {pin && <text x={bx + 6} y={y + 3} fontSize={7} fill="var(--muted)">{pin.mode === 'high' ? 'OUT·H' : pin.mode === 'low' ? 'OUT·L' : pin.mode === 'input_pullup' ? 'IN·PU' : 'IN'}</text>}
                  <Label x={bx + bw + 24} y={y} ep={ep} side="r" />
                </g>
              );
            })}
          </g>
        )}
        {others.map((part, idx) => {
          const def = PART_MAP[part.type];
          const cx = gx + (idx % cols) * (W + 110) + W / 2;
          const cy = by + 30 + Math.floor(idx / cols) * (H + 40);
          const live = snap?.parts[part.id];
          const two = def.pins.length === 2 && !['tmp36'].includes(part.type);
          const sym = two ? <Symbol type={part.type} live={live} /> : null;
          if (two) {
            const [p0, p1] = part.type === 'led' ? [def.pins[0], def.pins[1]] : def.pins; // LED: anode left
            return (
              <g key={part.id} transform={`translate(${cx} ${cy})`}>
                {sym ?? <rect x={-14} y={-9} width={28} height={18} rx={2} fill="none" stroke="var(--sch-ink)" />}
                {!sym && <path d="M-25 0 h11 M14 0 h11" stroke="var(--sch-ink)" strokeWidth={1.6} />}
                <text y={-20} textAnchor="middle" fontSize={9} fill="var(--sch-ink)" fontWeight={600}>{part.id}</text>
                <text y={24} textAnchor="middle" fontSize={7.5} fill="var(--muted)">{valueText(part.type, part.props)}</text>
                <Label x={-25} y={0} ep={`${part.id}.${p0.id}`} side="l" />
                <Label x={25} y={0} ep={`${part.id}.${p1.id}`} side="r" />
              </g>
            );
          }
          const left = def.pins.slice(0, Math.ceil(def.pins.length / 2)), right = def.pins.slice(Math.ceil(def.pins.length / 2));
          const hh = Math.max(left.length, right.length) * 12 + 14;
          return (
            <g key={part.id} transform={`translate(${cx} ${cy})`}>
              <rect x={-30} y={-hh / 2} width={60} height={hh} rx={3} fill="var(--sch-box)" stroke="var(--sch-ink)" strokeWidth={1.5} />
              <text y={-hh / 2 - 6} textAnchor="middle" fontSize={9} fill="var(--sch-ink)" fontWeight={600}>{part.id} · {def.name[lang]}</text>
              {left.map((p, i) => { const y = -hh / 2 + 13 + i * 12; return <g key={p.id}><line x1={-30} y1={y} x2={-42} y2={y} stroke="var(--sch-ink)" /><text x={-27} y={y + 3} fontSize={7} fill="var(--sch-ink)">{p.label}</text><Label x={-42} y={y} ep={`${part.id}.${p.id}`} side="l" /></g>; })}
              {right.map((p, i) => { const y = -hh / 2 + 13 + i * 12; return <g key={p.id}><line x1={30} y1={y} x2={42} y2={y} stroke="var(--sch-ink)" /><text x={27} y={y + 3} fontSize={7} textAnchor="end" fill="var(--sch-ink)">{p.label}</text><Label x={42} y={y} ep={`${part.id}.${p.id}`} side="r" /></g>; })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function valueText(type: string, p: Record<string, any>) {
  const eng = (v: number, u: string) => { const a = Math.abs(v); const [d, s] = a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'k'] : a >= 1 || a === 0 ? [1, ''] : a >= 1e-3 ? [1e-3, 'm'] : a >= 1e-6 ? [1e-6, 'µ'] : a >= 1e-9 ? [1e-9, 'n'] : [1e-12, 'p']; return `${+(v / d).toPrecision(3)}${s}${u}`; };
  switch (type) {
    case 'resistor': return eng(Number(p.ohms), 'Ω');
    case 'capacitor': return eng(Number(p.farads), 'F');
    case 'inductor': return eng(Number(p.henries), 'H');
    case 'led': return String(p.color);
    case 'potentiometer': return eng(Number(p.ohms), 'Ω');
    case 'dc_supply': return `${p.volts} V`;
    case 'diode': return String(p.model).toUpperCase();
    default: return '';
  }
}
