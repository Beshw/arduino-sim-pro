/**
 * GPIO trace utilities: CSV (time_ms,pin,value), VCD import/export,
 * waveform metrics (frequency, duty cycle, pulse widths) and Blink validation.
 * These only analyse traces; provenance is tracked separately.
 */
export interface Edge { t: number; pin: string; value: 0 | 1 } // t in milliseconds
export class TraceError extends Error {}

const PIN_RE = /^(D(?:[0-9]|1[0-3])|A[0-5])$/;

export function parseGpioCsv(src: string, maxRows = 500000): Edge[] {
  if (typeof src !== 'string') throw new TraceError('CSV must be text');
  const lines = src.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new TraceError('Empty trace');
  if (!/^time_ms\s*,\s*pin\s*,\s*value$/i.test(lines[0])) throw new TraceError('Header must be time_ms,pin,value');
  if (lines.length - 1 > maxRows) throw new TraceError('Too many rows');
  const out: Edge[] = [];
  const lastT = new Map<string, number>();
  let prevT = -Infinity;
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((s) => s.trim());
    if (parts.length !== 3) throw new TraceError(`Row ${i + 1}: expected 3 columns`);
    const t = Number(parts[0]);
    if (!Number.isFinite(t) || t < 0) throw new TraceError(`Row ${i + 1}: invalid time`);
    if (t < prevT) throw new TraceError(`Row ${i + 1}: time goes backwards`);
    prevT = t;
    const pin = parts[1].toUpperCase();
    if (!PIN_RE.test(pin)) throw new TraceError(`Row ${i + 1}: invalid pin ${parts[1]}`);
    if (parts[2] !== '0' && parts[2] !== '1') throw new TraceError(`Row ${i + 1}: value must be 0 or 1`);
    if (lastT.get(pin) === t) throw new TraceError(`Row ${i + 1}: duplicate timestamp for ${pin}`);
    lastT.set(pin, t);
    out.push({ t, pin, value: parts[2] === '1' ? 1 : 0 });
  }
  return out;
}

export function toGpioCsv(edges: Edge[]): string {
  return 'time_ms,pin,value\n' + edges.map((e) => `${+e.t.toFixed(6)},${e.pin},${e.value}`).join('\n') + (edges.length ? '\n' : '');
}

/** Export to VCD with 1 µs resolution; rejects timestamps that would be rounded. */
export function exportVcd(edges: Edge[], opts: { module?: string; date?: string; strictResolution?: boolean } = {}): string {
  const pins = [...new Set(edges.map((e) => e.pin))].sort();
  const ids = new Map(pins.map((p, i) => [p, String.fromCharCode(33 + i)]));
  const head = [
    `$date ${opts.date ?? new Date().toISOString()} $end`,
    '$version Arduino Simulator Pro $end',
    '$timescale 1 us $end',
    `$scope module ${opts.module ?? 'uno'} $end`,
    ...pins.map((p) => `$var wire 1 ${ids.get(p)} ${p} $end`),
    '$upscope $end', '$enddefinitions $end',
  ];
  const body: string[] = [];
  let cur = -1;
  const sorted = [...edges].sort((a, b) => a.t - b.t);
  for (const e of sorted) {
    const us = e.t * 1000;
    const rounded = Math.round(us);
    if (opts.strictResolution && Math.abs(us - rounded) > 1e-6) throw new TraceError(`Timestamp ${e.t} ms is finer than 1 µs`);
    if (rounded !== cur) { body.push(`#${rounded}`); cur = rounded; }
    body.push(`${e.value}${ids.get(e.pin)}`);
  }
  return head.join('\n') + '\n' + body.join('\n') + '\n';
}

const UNIT: Record<string, number> = { s: 1e3, ms: 1, us: 1e-3, ns: 1e-6, ps: 1e-9, fs: 1e-12 };

/** Import scalar signals from VCD; mapping: VCD reference name -> Arduino pin */
export function importVcd(text: string, mapping: Record<string, string>): Edge[] {
  if (typeof text !== 'string' || text.length > 20_000_000) throw new TraceError('Invalid VCD');
  for (const p of Object.values(mapping)) if (!PIN_RE.test(p)) throw new TraceError(`Invalid target pin ${p}`);
  const tokens = text.split(/\s+/).filter(Boolean);
  let i = 0;
  let scale = 1e-3; // default 1 us in ms
  const idToPin = new Map<string, string>();
  const scalarIds = new Set<string>();
  let defsDone = false;
  while (i < tokens.length && !defsDone) {
    const tok = tokens[i++];
    if (tok === '$timescale') {
      let spec = '';
      while (i < tokens.length && tokens[i] !== '$end') spec += tokens[i++];
      i++;
      const m = /^(1|10|100)(s|ms|us|ns|ps|fs)$/.exec(spec);
      if (!m) throw new TraceError(`Unsupported timescale ${spec}`);
      scale = +m[1] * UNIT[m[2]];
    } else if (tok === '$var') {
      const fields: string[] = [];
      while (i < tokens.length && tokens[i] !== '$end') fields.push(tokens[i++]);
      i++;
      const [, width, id, ref] = fields;
      if (mapping[ref] !== undefined) {
        if (width !== '1') throw new TraceError(`Signal ${ref} is not 1-bit`);
        idToPin.set(id, mapping[ref]);
        scalarIds.add(id);
      }
    } else if (tok === '$enddefinitions') {
      while (i < tokens.length && tokens[i] !== '$end') i++;
      i++; defsDone = true;
    } else if (tok.startsWith('$')) {
      while (i < tokens.length && tokens[i] !== '$end') i++;
      i++;
    }
  }
  if (!defsDone) throw new TraceError('Missing $enddefinitions');
  for (const ref of Object.keys(mapping)) if (![...idToPin.values()].includes(mapping[ref])) throw new TraceError(`Signal ${ref} not found in VCD`);
  const edges: Edge[] = [];
  let t = 0; let lastT = -1;
  const lastVal = new Map<string, number>();
  for (; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok[0] === '#') {
      const nt = Number(tok.slice(1));
      if (!Number.isFinite(nt) || nt < lastT) throw new TraceError(`Time goes backwards at ${tok}`);
      lastT = nt; t = nt * scale;
    } else if (tok === '$dumpvars' || tok === '$dumpon' || tok === '$dumpoff' || tok === '$dumpall' || tok === '$end') {
      continue;
    } else if (tok.startsWith('$comment')) {
      while (i < tokens.length && tokens[i] !== '$end') i++;
    } else if (tok[0] === 'b' || tok[0] === 'B' || tok[0] === 'r' || tok[0] === 'R') {
      const id = tokens[++i];
      if (scalarIds.has(id)) throw new TraceError(`Vector value for scalar signal ${id}`);
    } else {
      const v = tok[0].toLowerCase(); const id = tok.slice(1);
      const pin = idToPin.get(id);
      if (!pin) continue;
      if (v === 'x' || v === 'z') throw new TraceError(`Unknown state ${v} on ${pin} at ${t} ms`);
      if (v !== '0' && v !== '1') throw new TraceError(`Invalid value ${tok}`);
      const val = v === '1' ? 1 : 0;
      if (lastVal.get(pin) === val) continue; // not an edge
      lastVal.set(pin, val);
      edges.push({ t: +t.toFixed(9), pin, value: val as 0 | 1 });
    }
  }
  return edges;
}

export interface PinMetrics {
  pin: string; transitions: number; firstMs: number | null; lastMs: number | null;
  highMs: number; lowMs: number; duty: number | null; frequencyHz: number | null;
  minHighMs: number | null; minLowMs: number | null; periods: number[];
}

/** Waveform metrics within [start, end] ms (end defaults to last edge). */
export function pinMetrics(edges: Edge[], pin: string, endMs?: number): PinMetrics {
  const ev = edges.filter((e) => e.pin === pin).sort((a, b) => a.t - b.t);
  const res: PinMetrics = { pin, transitions: 0, firstMs: null, lastMs: null, highMs: 0, lowMs: 0, duty: null, frequencyHz: null, minHighMs: null, minLowMs: null, periods: [] };
  if (!ev.length) return res;
  const end = endMs ?? ev[ev.length - 1].t;
  res.firstMs = ev[0].t; res.lastMs = ev[ev.length - 1].t;
  const rises: number[] = [];
  for (let i = 0; i < ev.length; i++) {
    if (i > 0 && ev[i].value !== ev[i - 1].value) res.transitions++;
    const tEnd = i + 1 < ev.length ? ev[i + 1].t : end;
    const w = Math.max(0, tEnd - ev[i].t);
    if (ev[i].value) { res.highMs += w; if (i + 1 < ev.length) res.minHighMs = res.minHighMs === null ? w : Math.min(res.minHighMs, w); }
    else { res.lowMs += w; if (i + 1 < ev.length) res.minLowMs = res.minLowMs === null ? w : Math.min(res.minLowMs, w); }
    if (ev[i].value === 1 && (i === 0 || ev[i - 1].value === 0) && i > 0) rises.push(ev[i].t);
  }
  const total = res.highMs + res.lowMs;
  res.duty = total > 0 ? res.highMs / total : null;
  for (let i = 1; i < rises.length; i++) res.periods.push(rises[i] - rises[i - 1]);
  if (res.periods.length >= 1) {
    const avg = res.periods.reduce((a, b) => a + b, 0) / res.periods.length;
    res.frequencyHz = avg > 0 ? 1000 / avg : null;
  }
  return res;
}

export interface BlinkValidation { ok: boolean; reason: string; intervals: number[]; edges: number; maxDeviation: number }
/** Validate a captured Blink: alternating levels, >= minEdges, each half period within tolerance. */
export function validateBlink(edges: Edge[], pin: string, halfPeriodMs: number, tolerance = 0.02, minIntervals = 4): BlinkValidation {
  const ev = edges.filter((e) => e.pin === pin).sort((a, b) => a.t - b.t);
  const fail = (reason: string, intervals: number[] = [], dev = 0): BlinkValidation => ({ ok: false, reason, intervals, edges: ev.length, maxDeviation: dev });
  if (ev.length < minIntervals + 1) return fail(`Need at least ${minIntervals + 1} edges on ${pin}, got ${ev.length}`);
  for (let i = 1; i < ev.length; i++) {
    if (ev[i].value === ev[i - 1].value) return fail(`Repeated level at ${ev[i].t} ms`);
    if (ev[i].t === ev[i - 1].t) return fail(`Zero-width pulse at ${ev[i].t} ms`);
  }
  // skip first interval (setup -> first toggle)
  const intervals: number[] = [];
  for (let i = 2; i < ev.length; i++) intervals.push(ev[i].t - ev[i - 1].t);
  if (intervals.length < minIntervals) return fail(`Need ${minIntervals} full half-periods, got ${intervals.length}`, intervals);
  const dev = Math.max(...intervals.map((d) => Math.abs(d - halfPeriodMs) / halfPeriodMs));
  if (dev > tolerance) return fail(`Half-period deviation ${(dev * 100).toFixed(2)}% exceeds ${(tolerance * 100).toFixed(1)}%`, intervals, dev);
  return { ok: true, reason: 'Blink timing verified', intervals, edges: ev.length, maxDeviation: dev };
}
