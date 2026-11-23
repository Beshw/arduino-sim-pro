/**
 * SPICE netlist generation from the same element decomposition used by the
 * internal MNA engine (so ngspice results are directly comparable), PWL sources
 * from captured GPIO traces, and parsing of ngspice `wrdata` output.
 */
import type { Element } from '../circuit/mna';
import type { BuiltCircuit } from '../circuit/models';
import type { Edge } from '../signals/signals';

export interface SpiceOptions {
  title?: string;
  analysis: { type: 'op' } | { type: 'tran'; stepS: number; stopS: number; uic?: boolean };
  /** endpoint/net names whose voltages are written to the data file */
  probes?: string[];
  /** element names whose current is recorded (V sources only in ngspice; we add 0 V ammeters) */
  currentProbes?: string[];
  /** replace MCU pin drivers with PWL from a GPIO trace (AVR -> SPICE) */
  pwl?: { pin: string; edges: Edge[]; vHigh?: number; riseS?: number }[];
  dataFile?: string;
}

const sanitize = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_');
const fmt = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(9)).toString() : '0');

export function nodeNames(b: BuiltCircuit): string[] {
  const names: string[] = [];
  const used = new Set<string>(['0']);
  for (let n = 0; n < b.circuit.nodeCount; n++) {
    if (n === 0) { names.push('0'); continue; }
    const net = b.nodeNet.get(n);
    let name = net !== undefined ? 'n_' + sanitize(b.netlist.nets[net].name) : `n_int${n}`;
    while (used.has(name)) name += '_';
    used.add(name); names.push(name);
  }
  return names;
}

export function pwlFromEdges(edges: Edge[], vHigh = 5, riseS = 10e-9, stopS?: number): string {
  if (!edges.length) throw new Error('PWL needs at least one edge');
  const pts: string[] = [];
  const sorted = [...edges].sort((a, b) => a.t - b.t);
  if (sorted[0].t > 0) throw new Error('PWL requires an initial state at t=0 (first edge must be at 0 ms)');
  let prevV = sorted[0].value * vHigh;
  pts.push(`0 ${fmt(prevV)}`);
  let lastT = 0;
  for (const e of sorted.slice(1)) {
    const t = e.t / 1000;
    const v = e.value * vHigh;
    if (v === prevV) continue;
    const t0 = Math.max(t, lastT + 1e-12);
    pts.push(`${fmt(t0)} ${fmt(prevV)}`);
    pts.push(`${fmt(t0 + riseS)} ${fmt(v)}`);
    prevV = v; lastT = t0 + riseS;
  }
  if (stopS && stopS > lastT) pts.push(`${fmt(stopS)} ${fmt(prevV)}`);
  return `PWL(${pts.join(' ')})`;
}

export function generateSpice(b: BuiltCircuit, opts: SpiceOptions): { netlist: string; probeColumns: string[]; nodes: string[] } {
  const nn = nodeNames(b);
  const lines: string[] = [];
  const models: string[] = [];
  lines.push(`* ${opts.title ?? 'Arduino Simulator Pro circuit'}`);
  lines.push(`* Generated from the internal MNA element list; MCU pins are Thevenin drivers (V + R).`);
  const pwlMap = new Map((opts.pwl ?? []).map((p) => [p.pin, p]));
  let k = 0;
  const modelKey = new Map<string, string>();
  const ensureModel = (type: 'D' | 'NPN', params: string) => {
    const key = type + params;
    if (!modelKey.has(key)) { const name = `M${type}${modelKey.size + 1}`; modelKey.set(key, name); models.push(`.model ${name} ${type}(${params})`); }
    return modelKey.get(key)!;
  };
  for (const e of b.circuit.elements as Element[]) {
    const id = sanitize(e.name) + '_' + (k++);
    switch (e.kind) {
      case 'R': lines.push(`R${id} ${nn[e.a]} ${nn[e.b]} ${fmt(Math.max(e.r, 1e-6))}`); break;
      case 'C': lines.push(`C${id} ${nn[e.a]} ${nn[e.b]} ${fmt(e.c)} IC=${fmt(e.v0 ?? 0)}`); break;
      case 'L': lines.push(`L${id} ${nn[e.a]} ${nn[e.b]} ${fmt(e.l)} IC=${fmt(e.i0 ?? 0)}`); break;
      case 'V': lines.push(`V${id} ${nn[e.p]} ${nn[e.n]} DC ${fmt(e.v)}`); break;
      case 'I': lines.push(`I${id} ${nn[e.p]} ${nn[e.n]} DC ${fmt(e.i)}`); break;
      case 'N': {
        const pin = e.name.startsWith('mcu:') ? e.name.slice(4) : '';
        const p = pin ? pwlMap.get(pin) : undefined;
        if (!p && e.g < 1e-8 && Math.abs(e.i) < 1e-15) { lines.push(`R${id} ${nn[e.a]} ${nn[e.b]} ${fmt(1 / Math.max(e.g, 1e-12))}`); break; }
        const mid = `x_${id}`;
        const src = p ? pwlFromEdges(p.edges, p.vHigh ?? 5, p.riseS ?? 10e-9, opts.analysis.type === 'tran' ? opts.analysis.stopS : undefined) : `DC ${fmt(e.i / e.g)}`;
        const r = p ? 30 : 1 / e.g;
        lines.push(`V${id} ${mid} ${nn[e.b]} ${src}`);
        lines.push(`R${id} ${nn[e.a]} ${mid} ${fmt(r)}`);
        break;
      }
      case 'D': lines.push(`D${id} ${nn[e.a]} ${nn[e.k]} ${ensureModel('D', `IS=${fmt(e.is)} N=${fmt(e.n)}`)}`); break;
      case 'Q': lines.push(`Q${id} ${nn[e.c]} ${nn[e.b]} ${nn[e.e]} ${ensureModel('NPN', `IS=${fmt(e.is)} BF=${fmt(e.bf)} BR=${fmt(e.br)}`)}`); break;
    }
  }
  // gmin to ground on every node (matches the internal solver and avoids singular floating nodes)
  for (let n = 1; n < nn.length; n++) lines.push(`Rgmin_${n} ${nn[n]} 0 1e12`);
  lines.push(...models);
  const probeColumns: string[] = [];
  const vecs: string[] = [];
  for (const pr of opts.probes ?? []) {
    let node: number | undefined;
    if (pr.includes('.')) node = b.nodeOf(pr);
    else { const net = b.netlist.nets.find((n) => n.name === pr); if (net) node = b.netNode[net.id]; }
    if (node === undefined || node < 0) throw new Error('Unknown probe ' + pr);
    if (node === 0) continue;
    vecs.push(`v(${nn[node]})`); probeColumns.push(pr);
  }
  const data = opts.dataFile ?? 'asp_data.txt';
  if (opts.analysis.type === 'op') lines.push('.op');
  else lines.push(`.tran ${fmt(opts.analysis.stepS)} ${fmt(opts.analysis.stopS)}${opts.analysis.uic ? ' UIC' : ''}`);
  lines.push('.options noacct');
  lines.push('.control', 'set noaskquit', 'set wr_singlescale', 'set wr_vecnames', 'run');
  if (vecs.length) lines.push(`wrdata ${data} ${vecs.join(' ')}`);
  lines.push('.endc', '.end');
  return { netlist: lines.join('\n') + '\n', probeColumns, nodes: nn };
}

export interface SpiceData { columns: string[]; rows: number[][] }
export function parseWrdata(text: string, maxRows = 500000): SpiceData {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error('ngspice produced an empty data file');
  let columns: string[] = [];
  let start = 0;
  if (/[a-zA-Z]/.test(lines[0])) { columns = lines[0].split(/\s+/); start = 1; }
  const rows: number[][] = [];
  for (let i = start; i < lines.length && rows.length < maxRows; i++) {
    const r = lines[i].split(/\s+/).map(Number);
    if (r.some((x) => !Number.isFinite(x))) throw new Error(`Invalid number in ngspice output row ${i + 1}`);
    rows.push(r);
  }
  if (!rows.length) throw new Error('ngspice data file has no samples');
  return { columns, rows };
}

/** Parse "name = value" pairs printed by ngspice for an operating point. */
export function parseOpOutput(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of text.matchAll(/^\s*([vV]\([^)]+\)|[A-Za-z_][\w#:.()]*)\s*=\s*([-+0-9.eE]+)\s*$/gm)) out[m[1].toLowerCase()] = Number(m[2]);
  return out;
}
