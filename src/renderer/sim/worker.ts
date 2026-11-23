/// <reference lib="webworker" />
/**
 * Simulation worker: runs the real co-simulation (avr8js CPU executing the
 * compiled HEX + MNA circuit solver) off the UI thread, paced to wall-clock
 * time, and streams snapshots, GPIO edges and probe samples ~30 times/s.
 */
import { CoSimulation } from '../../shared/cosim';
import { parseIntelHex } from '../../shared/hex';
import type { ToWorker, FromWorker } from './protocol';

let sim: CoSimulation | null = null;
let running = false;
let speed = 1;
let timer: ReturnType<typeof setInterval> | null = null;
let lastWall = 0;
let gpioIdx = 0;
const probeIdx = new Map<string, number>();
let rtFactor = 0;
let last: { project: any; hex: string | null; probes: string[] } | null = null;

const post = (m: FromWorker) => (self as any).postMessage(m);

function build(project: any, hex: string | null, probes: string[]) {
  let image: Uint8Array | null = null;
  if (hex) {
    const h = parseIntelHex(hex);
    if (!h.ok) throw new Error('HEX: ' + h.errors.join('; '));
    image = h.image;
  }
  sim = new CoSimulation(project, image, { probes, probeIntervalS: 100e-6, maxProbeSamples: 2_000_000, maxGpioEvents: 2_000_000 });
  gpioIdx = 0; probeIdx.clear();
  last = { project, hex, probes };
  post({ type: 'loaded', ok: true, nodes: sim.built.circuit.nodeCount, elements: sim.built.circuit.elements.length });
  frame();
}

function frame() {
  if (!sim) return;
  const snap = sim.snapshot();
  const gpio = sim.gpio.slice(gpioIdx);
  gpioIdx = sim.gpio.length;
  const probes: Record<string, any[]> = {};
  for (const [ep, arr] of sim.probes) { const i = probeIdx.get(ep) ?? 0; probes[ep] = arr.slice(i); probeIdx.set(ep, arr.length); }
  // keep memory bounded on long runs
  if (sim.gpio.length > 500_000) { sim.gpio.splice(0, sim.gpio.length); gpioIdx = 0; }
  for (const [ep, arr] of sim.probes) if (arr.length > 500_000) { arr.splice(0, arr.length); probeIdx.set(ep, 0); }
  post({ type: 'frame', snap, gpio, probes, rt: rtFactor, running });
}

function tick() {
  if (!sim || !running) return;
  const now = performance.now();
  const wall = Math.min(0.1, (now - lastWall) / 1000);
  lastWall = now;
  const target = wall * speed;
  const t0 = performance.now();
  let simulated = 0;
  try {
    // run in slices so a slow circuit cannot block the worker for long
    while (simulated < target && performance.now() - t0 < 45) {
      const dt = Math.min(0.005, target - simulated);
      sim.run(dt);
      simulated += dt;
    }
  } catch (e: any) {
    running = false; stopTimer();
    post({ type: 'error', message: String(e?.message ?? e) });
  }
  rtFactor = wall > 0 ? simulated / wall : 0;
  frame();
}

function startTimer() { if (!timer) { lastWall = performance.now(); timer = setInterval(tick, 33); } }
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    switch (m.type) {
      case 'load': stopTimer(); running = false; build(m.project, m.hex, m.probes); if (m.autorun) { running = true; startTimer(); } post({ type: 'state', running }); break;
      case 'run': if (!sim && last) build(last.project, last.hex, last.probes); running = true; startTimer(); post({ type: 'state', running }); break;
      case 'pause': running = false; stopTimer(); frame(); post({ type: 'state', running }); break;
      case 'stop': running = false; stopTimer(); sim = null; post({ type: 'state', running }); break;
      case 'step': if (sim) { sim.run(m.seconds); frame(); } break;
      case 'setProp': if (sim) { sim.setProp(m.part, m.key, m.value); if (!running) frame(); } break;
      case 'serial': sim?.serialWrite(m.text); break;
      case 'speed': speed = Math.max(0.01, Math.min(10, m.value)); break;
      case 'probes': if (last) { last.probes = m.probes; } break;
    }
  } catch (e: any) {
    post({ type: 'error', message: String(e?.message ?? e) });
  }
};
