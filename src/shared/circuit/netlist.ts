/**
 * Netlist extraction from the breadboard/project model and connectivity checks.
 * Connections come from: explicit wires, part-internal groups (breadboard strips,
 * button pairs, board GND pins) and pins that physically sit on a breadboard hole.
 */
import { PART_MAP, pinWorld } from '../parts/catalog';
import type { Project } from '../project';
import { splitEndpoint } from '../project';

export interface Net {
  id: number;
  name: string;
  pins: string[]; // "part.pin"
}
export interface Netlist {
  nets: Net[];
  pinToNet: Map<string, number>;
  groundNet: number | null;
}

class DSU {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (this.parent.get(c) !== r) { const n = this.parent.get(c)!; this.parent.set(c, r); c = n; }
    return r;
  }
  union(a: string, b: string) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.parent.set(ra, rb); }
}

const SNAP = 3; // px tolerance for pin-on-hole contact

export function buildNetlist(project: Project): Netlist {
  const dsu = new DSU();
  const allPins: string[] = [];
  for (const part of project.parts) {
    const def = PART_MAP[part.type];
    for (const pin of def.pins) { const k = `${part.id}.${pin.id}`; dsu.find(k); allPins.push(k); }
    for (const grp of def.internal ?? []) for (let i = 1; i < grp.length; i++) dsu.union(`${part.id}.${grp[0]}`, `${part.id}.${grp[i]}`);
  }
  for (const w of project.wires) dsu.union(w.from, w.to);
  // pins sitting in breadboard holes
  const boards = project.parts.filter((p) => p.type === 'breadboard');
  if (boards.length) {
    const holes = new Map<string, string>();
    for (const b of boards) for (const pin of PART_MAP.breadboard.pins) {
      const w = pinWorld(b, pin.id)!;
      holes.set(`${Math.round(w.x)},${Math.round(w.y)}`, `${b.id}.${pin.id}`);
    }
    for (const part of project.parts) {
      if (part.type === 'breadboard' || part.type === 'uno') continue;
      for (const pin of PART_MAP[part.type].pins) {
        const w = pinWorld(part, pin.id)!;
        for (let dx = -SNAP; dx <= SNAP; dx++) for (let dy = -SNAP; dy <= SNAP; dy++) {
          const h = holes.get(`${Math.round(w.x) + dx},${Math.round(w.y) + dy}`);
          if (h) { dsu.union(`${part.id}.${pin.id}`, h); dx = SNAP + 1; break; }
        }
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const k of allPins) { const r = dsu.find(k); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(k); }
  const nets: Net[] = [];
  const pinToNet = new Map<string, number>();
  let groundNet: number | null = null;
  for (const pins of groups.values()) {
    const id = nets.length;
    const name = netName(pins, project, id);
    nets.push({ id, name, pins });
    for (const p of pins) pinToNet.set(p, id);
    if (name === 'GND') groundNet = id;
  }
  return { nets, pinToNet, groundNet };
}

function netName(pins: string[], project: Project, id: number): string {
  const unoIds = new Set(project.parts.filter((p) => p.type === 'uno').map((p) => p.id));
  const boardPins = pins.filter((p) => unoIds.has(splitEndpoint(p)[0])).map((p) => splitEndpoint(p)[1]);
  if (boardPins.some((p) => p.startsWith('GND'))) return 'GND';
  const pref = ['5V', '3V3', 'VIN', 'AREF', 'RESET', 'IOREF'];
  for (const p of pref) if (boardPins.includes(p)) return p;
  if (boardPins.length) return boardPins.sort()[0];
  return `N${id}`;
}

export type IssueSeverity = 'error' | 'warning' | 'info';
export interface CircuitIssue {
  severity: IssueSeverity;
  code: string;
  message: { ar: string; en: string };
  parts?: string[];
  net?: string;
}

/** Topology checks (independent of firmware): shorts, unconnected pins, bypassed parts. */
export function checkTopology(project: Project, nl: Netlist = buildNetlist(project)): CircuitIssue[] {
  const issues: CircuitIssue[] = [];
  const netOf = (ep: string) => nl.pinToNet.get(ep);
  for (const net of nl.nets) {
    const boardPins = net.pins.filter((p) => PART_MAP[project.parts.find((x) => x.id === splitEndpoint(p)[0])!.type].category === 'board').map((p) => splitEndpoint(p)[1]);
    const hasGnd = boardPins.some((p) => p.startsWith('GND'));
    const supplies = boardPins.filter((p) => ['5V', '3V3', 'VIN'].includes(p));
    if (hasGnd && supplies.length) issues.push({ severity: 'error', code: 'short_supply', net: net.name, message: { ar: `قصر مباشر بين ${supplies.join('/')} والأرضي GND — سيتلف منفذ USB أو منظم الجهد.`, en: `Direct short between ${supplies.join('/')} and GND.` } });
    if (supplies.length > 1) issues.push({ severity: 'error', code: 'supply_conflict', net: net.name, message: { ar: `ربط مصدرين مختلفين معاً (${supplies.join(' و ')}).`, en: `Two different supplies tied together (${supplies.join(', ')}).` } });
    const digital = boardPins.filter((p) => /^(D\d+|A\d)$/.test(p));
    if (digital.length > 1) issues.push({ severity: 'warning', code: 'pins_tied', net: net.name, message: { ar: `المنافذ ${digital.join(' و ')} موصولة ببعضها؛ إذا كانت كلها مخارج بقيم مختلفة سيحدث تعارض وتيار زائد.`, en: `Pins ${digital.join(', ')} are tied together; conflicting outputs will overload them.` } });
    if ((hasGnd || supplies.length) && digital.length) issues.push({ severity: 'warning', code: 'pin_to_rail', net: net.name, message: { ar: `المنفذ ${digital.join('/')} موصول مباشرة بـ ${hasGnd ? 'GND' : supplies[0]}؛ جعله OUTPUT بالقيمة المعاكسة يسبب قصراً.`, en: `Pin ${digital.join('/')} tied directly to ${hasGnd ? 'GND' : supplies[0]}.` } });
  }
  for (const part of project.parts) {
    const def = PART_MAP[part.type];
    if (def.category === 'board' || part.type === 'breadboard') continue;
    const pinNets = def.pins.map((p) => ({ pin: p, net: netOf(`${part.id}.${p.id}`)! }));
    // unconnected: a net that contains only this part's own pins (and maybe empty breadboard holes)
    const unconnected = pinNets.filter(({ net }) => {
      const others = nl.nets[net].pins.filter((ep) => {
        const [pid] = splitEndpoint(ep);
        if (pid === part.id) return false;
        const t = project.parts.find((x) => x.id === pid)!.type;
        return t !== 'breadboard';
      });
      return others.length === 0;
    });
    const optional = new Set(part.type === 'lcd1602' ? ['D0', 'D1', 'D2', 'D3', 'A', 'K'] : part.type === 'button' ? ['1b', '2b', '1a', '2a'] : part.type === 'seven_segment' ? ['DP', 'COM2', 'COM1'] : part.type === 'switch' ? ['c1', 'c2'] : part.type === 'hc595' ? ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q7S'] : []);
    const realUnconnected = unconnected.filter((u) => !optional.has(u.pin.id));
    if (part.type === 'button') {
      const sides = new Set(pinNets.filter((pn) => !unconnected.includes(pn)).map((pn) => pn.pin.id[0]));
      if (sides.size < 2) issues.push({ severity: 'warning', code: 'unconnected', parts: [part.id], message: { ar: `الزر ${part.id} غير موصول من الجهتين؛ لن يغير شيئاً عند الضغط.`, en: `Button ${part.id} is not connected on both sides.` } });
    } else if (realUnconnected.length) {
      issues.push({ severity: 'warning', code: 'unconnected', parts: [part.id], message: { ar: `أطراف غير موصولة في ${def.name.ar} (${part.id}): ${realUnconnected.map((u) => u.pin.label).join('، ')}`, en: `Unconnected pins on ${def.name.en} (${part.id}): ${realUnconnected.map((u) => u.pin.label).join(', ')}` } });
    }
    if (def.pins.length === 2 && pinNets[0].net === pinNets[1].net) {
      issues.push({ severity: 'warning', code: 'bypassed', parts: [part.id], message: { ar: `طرفا ${def.name.ar} (${part.id}) على نفس العقدة؛ المكون مُتجاوز بسلك ولن يعمل.`, en: `${def.name.en} (${part.id}) is shorted out (both pins on the same net).` } });
    }
    if (part.type === 'led') {
      const a = nl.nets[pinNets.find((p) => p.pin.id === 'anode')!.net];
      const k = nl.nets[pinNets.find((p) => p.pin.id === 'cathode')!.net];
      if (a.name === 'GND' && k.name !== 'GND') issues.push({ severity: 'warning', code: 'led_reversed', parts: [part.id], message: { ar: `قد يكون LED ${part.id} معكوساً: الطرف الموجب (الأطول) موصول بالأرضي.`, en: `LED ${part.id} may be reversed (anode on GND).` } });
    }
  }
  return issues;
}
