/**
 * Service facade shared by the Electron IPC bridge, the local HTTP API and the
 * acceptance/CLI tools. Every function validates its input and returns JSON.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { compileSketch } from './compiler';
import { arduinoCoreDir, bundledLibrariesDir, getResourcesRoot, probeVersion, resolveTool, ToolName } from './toolchain';
import { runNgspice, runSimavr } from './native';
import { parseIntelHex } from '../../shared/hex';
import { CoSimulation } from '../../shared/cosim';
import { validateProject, Project, PROJECT_FORMAT } from '../../shared/project';
import { buildCircuit } from '../../shared/circuit/models';
import { Circuit } from '../../shared/circuit/mna';
import { checkTopology } from '../../shared/circuit/netlist';
import { generateSpice } from '../../shared/spice/spice';
import { exportVcd, importVcd, parseGpioCsv, pinMetrics, toGpioCsv, validateBlink, Edge } from '../../shared/signals/signals';

export const APP_VERSION = '1.2.0';
export const APP_ID = 'arduino-simulator-pro';

const sha = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');
const num = (v: unknown, name: string, min: number, max: number, def?: number): number => {
  if (v === undefined && def !== undefined) return def;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number`);
  if (v < min || v > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return v;
};

export function status() {
  return { ok: true, app: APP_ID, version: APP_VERSION, pid: process.pid, platform: process.platform, arch: process.arch, engines: { avr: 'avr8js (instruction-accurate ATmega328P)', circuit: 'MNA Newton-Raphson + backward Euler', spice: resolveTool('ngspice').path ? 'ngspice' : null } };
}

export function preflight() {
  const tools: Record<string, unknown> = {};
  const names: ToolName[] = ['avr-gcc', 'avr-g++', 'avr-objcopy', 'avr-size', 'avrdude', 'arduino-cli', 'ngspice', 'simavr'];
  for (const n of names) {
    const r = resolveTool(n);
    let version: string | null = null;
    if (r.path && ['avr-gcc', 'avrdude', 'arduino-cli', 'ngspice'].includes(n)) {
      const args = n === 'avrdude' ? ['-?'] : n === 'arduino-cli' ? ['version'] : n === 'ngspice' ? ['--version'] : ['-mmcu=atmega328p', '--version'];
      const pv = probeVersion(r.path, args);
      const lines = pv.output.split('\n').map((l) => l.replace(/^[*\s]+/, '').trim()).filter(Boolean);
      version = (lines.find((l) => /version/i.test(l) && /\d+\.\d+/.test(l)) ?? lines.find((l) => /\d+(\.\d+)?/.test(l) && !/error|usage|override/i.test(l)) ?? lines[0] ?? '').slice(0, 160) || null;
    }
    tools[n] = { ...r, version };
  }
  const core = arduinoCoreDir();
  const libs = fs.existsSync(bundledLibrariesDir()) ? fs.readdirSync(bundledLibrariesDir()) : [];
  const coreLibs = core.path && fs.existsSync(path.join(core.path, 'libraries')) ? fs.readdirSync(path.join(core.path, 'libraries')) : [];
  const has = (n: string) => !!(tools[n] as any).path;
  const compileReady = (has('avr-gcc') && has('avr-g++') && has('avr-objcopy') && !!core.path) || has('arduino-cli');
  return {
    ok: true, version: APP_VERSION, resourcesRoot: getResourcesRoot(), tools,
    arduinoCore: core, libraries: [...coreLibs, ...libs],
    ready: { compile: compileReady, simulate: compileReady, spice: has('ngspice'), upload: has('avrdude'), simavrCrossCheck: has('simavr') },
    note: 'Tool availability is a prerequisite only; it does not prove that a simulation succeeded. Run the acceptance suite for evidence.',
  };
}

export async function compile(body: any) {
  const code = body?.code;
  if (typeof code !== 'string') throw new Error('code must be a string');
  const r = await compileSketch(code, { backend: body?.backend ?? 'auto' });
  return r;
}

/** Headless co-simulation run used by API/acceptance: firmware + optional circuit. */
export async function avrRun(body: any) {
  const duration = num(body?.duration, 'duration', 0.001, 60, 2);
  const pins: string[] = Array.isArray(body?.pins) ? body.pins : ['D13'];
  let hex: string;
  let compileInfo: any = null;
  if (typeof body?.hex === 'string') hex = body.hex;
  else {
    const c = await compileSketch(String(body?.code ?? ''));
    compileInfo = { ok: c.ok, message: c.message, size: c.size, sha256: c.sha256, diagnostics: c.diagnostics, backend: c.backend };
    if (!c.ok || !c.hex) return { ok: false, stage: 'compile', message: c.message, compile: compileInfo, log: c.log };
    hex = c.hex;
  }
  const chk = parseIntelHex(hex);
  if (!chk.ok) return { ok: false, stage: 'hex', message: 'Invalid Intel HEX: ' + chk.errors.join('; ') };
  const project: Project = body?.project ? validateProject(body.project) : validateProject({ format: PROJECT_FORMAT, version: 1, name: 'headless', board: 'uno', code: '', parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }], wires: [] });
  const sim = new CoSimulation(project, chk.image, { tracePins: pins, probes: body?.probes });
  const t0 = Date.now();
  if (Array.isArray(body?.serialInput)) for (const s of body.serialInput) sim.serialWrite(String(s));
  sim.run(duration);
  const wall = Date.now() - t0;
  const snap = sim.snapshot();
  const csv = sim.gpioCsv(pins);
  const edges = sim.gpio.filter((e) => pins.includes(e.pin)).map((e) => ({ t: e.t * 1000, pin: e.pin, value: e.value })) as Edge[];
  const transitions = Object.fromEntries(pins.map((p) => [p, Math.max(0, edges.filter((e) => e.pin === p).length - 1)]));
  return {
    ok: true, stage: 'executed', engine: 'avr8js', source: 'avr8js_cosim', native_avr_executed: true,
    message: 'Firmware executed instruction-by-instruction on the virtual ATmega328P',
    simulatedSeconds: snap.timeS, wallMs: wall, realtimeFactor: snap.timeS / Math.max(wall / 1000, 1e-6),
    cycles: snap.cycles, csv, transitions_by_pin: transitions, serial: sim.serialOutput, snapshot: snap,
    probes: Object.fromEntries(sim.probes),
    firmware_sha256: sha(hex), trace_sha256: sha(csv), compile: compileInfo,
  };
}

export async function simavr(body: any) {
  const pins: string[] = Array.isArray(body?.pins) ? body.pins : ['D13'];
  return runSimavr(String(body?.code ?? ''), pins, num(body?.duration, 'duration', 0.01, 30, 2));
}

export function circuitCheck(body: any) {
  const project = validateProject(body?.project ?? body);
  const built = buildCircuit(project);
  const issues = checkTopology(project, built.netlist);
  const op = built.circuit.solve(0);
  const nets = Object.fromEntries(built.netlist.nets.filter((n) => built.netNode[n.id] >= 0).map((n) => [n.name, op.v[built.netNode[n.id]]]));
  const parts = Object.fromEntries(built.runtimes.map((rt) => [rt.part.id, rt.read(op, (k) => op.v[k])]));
  return { ok: true, converged: op.converged, issues, nets, parts, netlist: built.netlist.nets.map((n) => ({ name: n.name, pins: n.pins })) };
}

/** Legacy v0.11 contract: {fixed:{node:V}, resistors:[{a,b,ohms}]} */
export function dcSolve(body: any) {
  const fixed = body?.fixed ?? {};
  const resistors = body?.resistors;
  if (!Array.isArray(resistors) || !resistors.length || resistors.length > 500) throw new Error('resistors must be a non-empty list');
  const names = new Set<string>(Object.keys(fixed));
  for (const r of resistors) { if (typeof r.a !== 'string' || typeof r.b !== 'string') throw new Error('resistor nodes must be strings'); names.add(r.a); names.add(r.b); num(r.ohms, 'ohms', 1e-6, 1e12); }
  const gndName = Object.keys(fixed).find((k) => fixed[k] === 0) ?? 'GND';
  const idx = new Map<string, number>(); idx.set(gndName, 0);
  let n = 1; for (const nm of names) if (!idx.has(nm)) idx.set(nm, n++);
  const c = new Circuit(n);
  for (const [k, v] of Object.entries(fixed)) { if (k === gndName) continue; c.add({ kind: 'V', name: 'V_' + k, p: idx.get(k)!, n: 0, v: num(v, 'fixed ' + k, -1000, 1000) }); }
  resistors.forEach((r: any, i: number) => c.add({ kind: 'R', name: `R${i}`, a: idx.get(r.a)!, b: idx.get(r.b)!, r: r.ohms }));
  // floating check: every node must connect to a fixed node through resistors
  const adj = new Map<string, Set<string>>();
  for (const r of resistors) { (adj.get(r.a) ?? adj.set(r.a, new Set()).get(r.a)!).add(r.b); (adj.get(r.b) ?? adj.set(r.b, new Set()).get(r.b)!).add(r.a); }
  const seen = new Set<string>(Object.keys(fixed)); const q = [...seen];
  while (q.length) { const x = q.pop()!; for (const y of adj.get(x) ?? []) if (!seen.has(y)) { seen.add(y); q.push(y); } }
  const floating = [...names].filter((x) => !seen.has(x));
  if (floating.length) return { ok: false, message: 'Floating nodes: ' + floating.join(', ') };
  const r = c.solve(0);
  const voltages = Object.fromEntries([...idx].map(([k, i]) => [k, +r.v[i].toFixed(9)]));
  const currents = resistors.map((res: any, i: number) => { const I = r.current.get(`R${i}`)!; return { a: res.a, b: res.b, ohms: res.ohms, current_mA: +(I * 1000).toFixed(6), power_mW: +(I * I * res.ohms * 1000).toFixed(6) }; });
  return { ok: true, engine: 'mna-dc', voltages, resistors: currents };
}

/** RC transient: analytic solution + MNA numeric solution side-by-side. */
export function rcTransient(body: any) {
  const R = num(body?.ohms ?? body?.r, 'ohms', 1, 1e9), C = num(body?.farads ?? body?.c, 'farads', 1e-12, 10), V = num(body?.volts ?? body?.v, 'volts', -1000, 1000);
  const v0 = num(body?.v0, 'v0', -1000, 1000, 0);
  const tau = R * C;
  const duration = num(body?.duration, 'duration', tau / 1000, 1e4, 5 * tau);
  const steps = Math.round(num(body?.steps, 'steps', 10, 20000, 500));
  const dt = duration / steps;
  const c = new Circuit(3);
  c.add({ kind: 'V', name: 'V1', p: 1, n: 0, v: V });
  c.add({ kind: 'R', name: 'R1', a: 1, b: 2, r: R });
  c.add({ kind: 'C', name: 'C1', a: 2, b: 0, c: C, v0 });
  c.resetState();
  const sub = 10; // sub-steps per sample for accuracy of backward Euler
  const samples: { t: number; v_analytic: number; v_mna: number; i_mA: number }[] = [{ t: 0, v_analytic: v0, v_mna: v0, i_mA: ((V - v0) / R) * 1000 }];
  let maxErr = 0;
  for (let k = 1; k <= steps; k++) {
    let res; for (let s = 0; s < sub; s++) res = c.solve(dt / sub);
    const t = k * dt;
    const va = V + (v0 - V) * Math.exp(-t / tau);
    const vm = res!.v[2];
    maxErr = Math.max(maxErr, Math.abs(va - vm));
    samples.push({ t, v_analytic: va, v_mna: vm, i_mA: ((V - vm) / R) * 1000 });
  }
  return { ok: true, tau_s: tau, final_v: samples[samples.length - 1].v_analytic, max_abs_error_v: maxErr, samples };
}

export async function spice(body: any) {
  const project = validateProject(body?.project);
  const built = buildCircuit(project);
  // optionally freeze MCU pin states (static digital levels)
  const states: Record<string, string> = body?.pinStates ?? {};
  for (const [pin, st] of Object.entries(states)) {
    const el = built.mcuPins.get(pin);
    if (!el) throw new Error('Unknown pin ' + pin);
    const { setMcuPin } = await import('../../shared/circuit/models');
    setMcuPin(el, st as any);
  }
  const analysis = body?.analysis?.type === 'tran'
    ? { type: 'tran' as const, stepS: num(body.analysis.stepS, 'stepS', 1e-9, 1), stopS: num(body.analysis.stopS, 'stopS', 1e-8, 100), uic: true }
    : { type: 'op' as const };
  let pwl: any;
  if (body?.pwl) pwl = [{ pin: String(body.pwl.pin), edges: parseGpioCsv(String(body.pwl.csv)).filter((e) => e.pin === body.pwl.pin) }];
  const gen = generateSpice(built, { analysis, probes: body?.probes ?? built.netlist.nets.filter((n) => n.name !== 'GND' && built.netNode[n.id] > 0).map((n) => n.name), pwl, title: project.name });
  if (!body?.execute) return { ok: true, executed: false, netlist: gen.netlist, probeColumns: gen.probeColumns };
  const run = await runNgspice(gen.netlist);
  return { ...run, netlist: gen.netlist, probeColumns: gen.probeColumns };
}

/** AVR -> GPIO -> SPICE: execute firmware, capture pin, replay as PWL in ngspice, compare with co-sim. */
export async function avrToSpice(body: any) {
  const project = validateProject(body?.project);
  const pin = String(body?.pin ?? 'D13');
  const duration = num(body?.duration, 'duration', 0.01, 20, 2.5);
  const run: any = await avrRun({ code: body?.code ?? project.code, duration, pins: [pin], project, probes: body?.probes });
  if (!run.ok) return { ...run, ok: false, stage: 'avr' };
  const edges = parseGpioCsv(run.csv).filter((e) => e.pin === pin);
  if (edges.length < 2) return { ok: false, stage: 'trace', message: 'Firmware produced no transitions on ' + pin, avr: run };
  if (edges[0].t > 0) edges.unshift({ t: 0, pin, value: 0 }); // pin is LOW (input/Hi-Z) before firmware configures it
  const built = buildCircuit(project);
  const stepS = num(body?.stepS, 'stepS', 1e-7, 0.01, 1e-4);
  const ledId = project.parts.find((p) => p.type === 'led')?.id;
  const probes = body?.probes ?? built.netlist.nets.filter((n) => n.name !== 'GND' && built.netNode[n.id] > 0).map((n) => n.name);
  const gen = generateSpice(built, { analysis: { type: 'tran', stepS, stopS: duration, uic: true }, probes, pwl: [{ pin, edges }], title: `${project.name} (AVR->SPICE, sequential)` });
  const res = body?.execute === false ? null : await runNgspice(gen.netlist, { timeoutMs: 120_000 });
  return {
    ok: !!res?.ok, stage: res ? 'spice' : 'export', sequential: true,
    note: 'Sequential pipeline: firmware trace is captured first, then replayed in ngspice. Live bidirectional co-simulation is provided by the internal engine.',
    avr: { firmware_sha256: run.firmware_sha256, trace_sha256: run.trace_sha256, transitions: run.transitions_by_pin, snapshot_led: ledId ? run.snapshot.parts[ledId] : null },
    netlist: gen.netlist, probeColumns: gen.probeColumns, spice: res,
  };
}

export function gpioTrace(body: any) { const edges = parseGpioCsv(String(body?.csv ?? '')); return { ok: true, edges, pins: [...new Set(edges.map((e) => e.pin))] }; }
export function gpioMetrics(body: any) {
  const edges = parseGpioCsv(String(body?.csv ?? ''));
  const pins = [...new Set(edges.map((e) => e.pin))];
  return { ok: true, metrics: pins.map((p) => pinMetrics(edges, p, body?.endMs)) };
}
export function vcdImport(body: any) { const edges = importVcd(String(body?.vcd ?? ''), body?.mapping ?? {}); return { ok: true, csv: toGpioCsv(edges), edges: edges.length }; }
export function vcdExport(body: any) { const edges = parseGpioCsv(String(body?.csv ?? '')); return { ok: true, vcd: exportVcd(edges, { strictResolution: !!body?.strict }) }; }
export function blinkCheck(body: any) {
  const edges = parseGpioCsv(String(body?.csv ?? ''));
  return validateBlink(edges, String(body?.pin ?? 'D13'), num(body?.halfPeriodMs, 'halfPeriodMs', 0.01, 1e6, 1000), num(body?.tolerance, 'tolerance', 0, 1, 0.02));
}
