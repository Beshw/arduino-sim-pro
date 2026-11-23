/**
 * Rolling buffers for the timeline (logic analyzer + oscilloscope). Kept out of
 * React state: the canvases redraw from here on animation frames.
 */
import type { GpioEvent, ProbeSample } from '../../shared/cosim';

export const MAX_EDGES = 400_000;
export const MAX_SAMPLES = 300_000;
export const traces = {
  edges: [] as GpioEvent[],
  samples: new Map<string, ProbeSample[]>(),
  now: 0,
  version: 0,
  imported: null as null | { name: string; edges: GpioEvent[] },
};
export function resetTraces() { traces.edges = []; traces.samples = new Map(); traces.now = 0; traces.version++; }
export function pushFrame(gpio: GpioEvent[], probes: Record<string, ProbeSample[]>, now: number) {
  if (gpio.length) { traces.edges.push(...gpio); if (traces.edges.length > MAX_EDGES) traces.edges.splice(0, traces.edges.length - MAX_EDGES); }
  for (const [k, arr] of Object.entries(probes)) {
    let b = traces.samples.get(k);
    if (!b) { b = []; traces.samples.set(k, b); }
    for (const s of arr) b.push(s);
    if (b.length > MAX_SAMPLES) b.splice(0, b.length - MAX_SAMPLES);
  }
  traces.now = now; traces.version++;
}
/** first index with t >= t0 (edges are sorted by time) */
export function lowerBound(edges: GpioEvent[], t0: number) {
  let lo = 0, hi = edges.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (edges[m].t < t0) lo = m + 1; else hi = m; }
  return lo;
}
/** level before the window and transitions inside it for one pin */
export function levelsInWindow(edges: GpioEvent[], pin: string, t0: number, t1: number) {
  const start = lowerBound(edges, t0);
  let initial: 0 | 1 | null = null;
  for (let i = start - 1; i >= 0; i--) if (edges[i].pin === pin) { initial = edges[i].value; break; }
  const out: { t: number; v: 0 | 1 }[] = [];
  for (let i = start; i < edges.length; i++) { const e = edges[i]; if (e.t > t1) break; if (e.pin === pin) out.push({ t: e.t, v: e.value }); }
  return { initial, edges: out };
}
/** frequency / duty from the edges of one pin within a window */
export function measure(edges: GpioEvent[], pin: string, t0: number, t1: number) {
  const e: GpioEvent[] = [];
  for (let i = lowerBound(edges, t0); i < edges.length && edges[i].t <= t1; i++) if (edges[i].pin === pin) e.push(edges[i]);
  const rises = e.filter((x) => x.value === 1).map((x) => x.t);
  if (rises.length < 2) {
    let last: GpioEvent | undefined = e[e.length - 1];
    if (!last) for (let i = lowerBound(edges, t0) - 1; i >= 0; i--) if (edges[i].pin === pin) { last = edges[i]; break; }
    return { freq: 0, duty: last ? (last.value ? 100 : 0) : null, period: 0, count: e.length };
  }
  const period = (rises[rises.length - 1] - rises[0]) / (rises.length - 1);
  let high = 0;
  for (let i = 0; i < e.length - 1; i++) if (e[i].value === 1 && e[i].t >= rises[0] && e[i + 1].t <= rises[rises.length - 1]) high += e[i + 1].t - e[i].t;
  const span = rises[rises.length - 1] - rises[0];
  return { freq: 1 / period, duty: span > 0 ? (high / span) * 100 : null, period, count: e.length };
}
