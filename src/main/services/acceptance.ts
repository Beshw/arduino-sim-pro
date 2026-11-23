/**
 * Fail-closed acceptance suite. Produces separate JSON reports for readiness,
 * compilation, execution, measurements, file I/O and build. A check passes only
 * on real evidence produced during this run; missing tools are "skipped", never "passed".
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as api from './api';
import { compileSketch } from './compiler';
import { runNgspice, runSimavr } from './native';
import { parseIntelHex } from '../../shared/hex';
import { CoSimulation } from '../../shared/cosim';
import { validateProject, PROJECT_FORMAT } from '../../shared/project';
import { buildCircuit, setMcuPin } from '../../shared/circuit/models';
import { generateSpice } from '../../shared/spice/spice';
import { exportVcd, importVcd, parseGpioCsv, toGpioCsv, validateBlink, Edge } from '../../shared/signals/signals';
import { resolveTool } from './toolchain';

type Status = 'pass' | 'fail' | 'skip';
interface Check { id: string; title: string; status: Status; detail: string; evidence?: unknown; durationMs: number }
interface Report { report: string; generatedAt: string; runId: string; checks: Check[]; status: Status }

const BLINK = `// Acceptance Blink: 1 s HIGH / 1 s LOW on D13
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("BLINK-START");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}
`;

export const LED_PROJECT = {
  format: PROJECT_FORMAT, version: 1, name: 'Acceptance LED', board: 'uno', code: BLINK,
  parts: [
    { id: 'uno', type: 'uno', x: 0, y: 0, props: {} },
    { id: 'R1', type: 'resistor', x: 400, y: 100, props: { ohms: 220 } },
    { id: 'LED1', type: 'led', x: 460, y: 100, props: { color: 'red' } },
  ],
  wires: [{ id: 'w1', from: 'uno.D13', to: 'R1.a' }, { id: 'w2', from: 'R1.b', to: 'LED1.anode' }, { id: 'w3', from: 'LED1.cathode', to: 'uno.GND.1' }],
};

const sha = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');

async function check(list: Check[], id: string, title: string, fn: () => Promise<{ status: Status; detail: string; evidence?: unknown }>) {
  const t0 = Date.now();
  try { const r = await fn(); list.push({ id, title, ...r, durationMs: Date.now() - t0 }); }
  catch (e: any) { list.push({ id, title, status: 'fail', detail: 'Exception: ' + (e?.message ?? e), durationMs: Date.now() - t0 }); }
}
const overall = (c: Check[]): Status => (c.some((x) => x.status === 'fail') ? 'fail' : c.every((x) => x.status === 'skip') ? 'skip' : 'pass');

export async function runAcceptance(outDir: string, opts: { build?: Record<string, unknown> } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const runId = crypto.randomUUID();
  const reports: Report[] = [];
  const mk = (name: string, checks: Check[]): Report => ({ report: name, generatedAt: new Date().toISOString(), runId, checks, status: overall(checks) });

  // 1. readiness
  const readiness: Check[] = [];
  const pf = api.preflight();
  for (const t of ['avr-gcc', 'avr-g++', 'avr-objcopy', 'avrdude', 'ngspice', 'arduino-cli', 'simavr']) {
    const info: any = (pf.tools as any)[t];
    const optional = ['arduino-cli', 'simavr'].includes(t);
    readiness.push({ id: 'tool:' + t, title: `Tool ${t}`, status: info.path ? 'pass' : optional ? 'skip' : 'fail', detail: info.path ? `${info.source}: ${info.path}${info.version ? ' (' + info.version + ')' : ''}` : (info.error ?? 'not found') + (optional ? ' (optional)' : ''), durationMs: 0 });
  }
  readiness.push({ id: 'core', title: 'Arduino AVR core', status: pf.arduinoCore.path ? 'pass' : 'fail', detail: String(pf.arduinoCore.path ?? 'missing'), durationMs: 0 });
  await check(readiness, 'override', 'Invalid explicit tool path is rejected (no silent fallback)', async () => {
    const old = process.env.ARDUINO_NGSPICE_PATH;
    process.env.ARDUINO_NGSPICE_PATH = path.join(outDir, 'does-not-exist', 'ngspice.exe');
    try { const r = resolveTool('ngspice'); return { status: r.path === null && r.source === 'invalid-override' ? 'pass' : 'fail', detail: JSON.stringify(r) }; }
    finally { if (old === undefined) delete process.env.ARDUINO_NGSPICE_PATH; else process.env.ARDUINO_NGSPICE_PATH = old; }
  });
  reports.push(mk('readiness', readiness));

  // 2. compile
  const compileChecks: Check[] = [];
  let hex: string | null = null; let firmwareSha = '';
  await check(compileChecks, 'compile-blink', 'Real avr-gcc build of Blink for ATmega328P', async () => {
    const r = await compileSketch(BLINK);
    if (!r.ok || !r.hex) return { status: 'fail', detail: r.message + '\n' + r.log.slice(-2000) };
    hex = r.hex; firmwareSha = r.sha256!.hex;
    return { status: 'pass', detail: `${r.backend}: ${r.size?.flash} bytes flash, ${r.size?.ram} bytes RAM in ${r.durationMs} ms`, evidence: { size: r.size, sha256: r.sha256, toolVersions: r.toolVersions } };
  });
  await check(compileChecks, 'hex-validate', 'Intel HEX structure, checksums, flash bounds', async () => {
    if (!hex) return { status: 'skip', detail: 'no HEX (compile failed)' };
    const v = parseIntelHex(hex);
    return { status: v.ok && v.bytes > 100 ? 'pass' : 'fail', detail: `${v.records} records, ${v.bytes} bytes, range 0x${v.firstAddress?.toString(16)}-0x${v.lastAddress?.toString(16)}; errors: ${v.errors.join('; ') || 'none'}` };
  });
  await check(compileChecks, 'hex-tamper', 'Corrupted HEX checksum is rejected', async () => {
    if (!hex) return { status: 'skip', detail: 'no HEX' };
    const lines = (hex as string).split(/\r?\n/).map((l) => l.trim()); lines[3] = lines[3].slice(0, -2) + (lines[3].endsWith('00') ? '01' : '00');
    const v = parseIntelHex(lines.join('\n'));
    return { status: !v.ok && v.errors.some((e) => /checksum/.test(e)) ? 'pass' : 'fail', detail: v.errors.join('; ') };
  });
  await check(compileChecks, 'compile-error-diagnostics', 'Compiler errors are mapped to sketch lines', async () => {
    const r = await compileSketch('void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {\n  undefinedCall();\n}\n');
    const lines = r.diagnostics.filter((d) => d.file === 'sketch.ino' && d.severity === 'error').map((d) => d.line);
    return { status: !r.ok && lines.includes(2) || lines.includes(3) ? 'pass' : 'fail', detail: JSON.stringify(r.diagnostics.slice(0, 4)) };
  });
  await check(compileChecks, 'compile-libraries', 'Bundled libraries (Servo, LiquidCrystal, DHT) are found and linked', async () => {
    const code = '#include <Servo.h>\n#include <LiquidCrystal.h>\n#include <DHT.h>\nServo s; LiquidCrystal lcd(12, 11, 5, 4, 3, 2); DHT dht(7, DHT11);\nvoid setup(){ s.attach(9); lcd.begin(16, 2); lcd.print("ok"); dht.begin(); }\nvoid loop(){ s.write((int)dht.readTemperature()); delay(100); }\n';
    const r = await compileSketch(code);
    return { status: r.ok && !!r.hex ? 'pass' : 'fail', detail: r.ok ? `flash ${r.size?.flash} B, libraries linked` : `${r.message}: ${(r.diagnostics[0]?.message ?? r.log ?? '').slice(0, 300)}` };
  });
  reports.push(mk('compile', compileChecks));

  // 3. execution
  const execChecks: Check[] = [];
  let edges: Edge[] = []; let ledAvg: any = null; let traceCsv = '';
  await check(execChecks, 'avr-execute', 'Firmware executes on the virtual ATmega328P with LED circuit (co-simulation)', async () => {
    if (!hex) return { status: 'skip', detail: 'no firmware' };
    const project = validateProject(LED_PROJECT);
    const img = parseIntelHex(hex).image;
    const sim = new CoSimulation(project, img, { tracePins: ['D13'] });
    const t0 = Date.now();
    sim.run(0.5); const sOn = sim.snapshot();
    sim.run(1.0); const sOff = sim.snapshot();
    sim.run(4.0);
    const wall = Date.now() - t0;
    traceCsv = sim.gpioCsv(['D13']);
    edges = parseGpioCsv(traceCsv);
    ledAvg = { on_mA: Number(sOn.parts.LED1.current) * 1000, off_mA: Number(sOff.parts.LED1.current) * 1000, d13_on_V: sOn.pins.D13.voltage };
    const serialOk = sim.serialOutput.includes('BLINK-START');
    const ok = edges.length >= 5 && serialOk && ledAvg.on_mA > 10 && ledAvg.on_mA < 16 && ledAvg.off_mA < 0.01;
    return { status: ok ? 'pass' : 'fail', detail: `${edges.length} D13 edges in 5.5 s simulated (${wall} ms wall); serial=${JSON.stringify(sim.serialOutput.slice(0, 40))}; LED on ${ledAvg.on_mA.toFixed(2)} mA, off ${ledAvg.off_mA.toFixed(4)} mA, D13 ${ledAvg.d13_on_V.toFixed(3)} V`, evidence: { firmware_sha256: firmwareSha, trace_sha256: sha(traceCsv), runId, cycles: sim.mcu.cycles, solves: sim.solves } };
  });
  await check(execChecks, 'blink-timing', 'D13 half-periods are 1000 ms ± 0.5 %', async () => {
    if (!edges.length) return { status: 'fail', detail: 'empty trace rejected' };
    const v = validateBlink(edges, 'D13', 1000, 0.005, 4);
    return { status: v.ok ? 'pass' : 'fail', detail: `${v.reason}; intervals ms: ${v.intervals.map((x) => x.toFixed(3)).join(', ')}`, evidence: v };
  });
  await check(execChecks, 'trace-rejects-synthetic', 'Validator rejects empty / repeated-level / zero-width traces', async () => {
    const empty = validateBlink([], 'D13', 1000);
    const repeated = validateBlink([0, 1000, 2000, 3000, 4000, 5000].map((t) => ({ t, pin: 'D13', value: 1 as const })), 'D13', 1000);
    const zero = validateBlink([{ t: 0, pin: 'D13', value: 0 }, { t: 5, pin: 'D13', value: 1 }, { t: 5, pin: 'D13', value: 0 }, { t: 1005, pin: 'D13', value: 1 }, { t: 2005, pin: 'D13', value: 0 }, { t: 3005, pin: 'D13', value: 1 }], 'D13', 1000);
    return { status: !empty.ok && !repeated.ok && !zero.ok ? 'pass' : 'fail', detail: [empty.reason, repeated.reason, zero.reason].join(' | ') };
  });
  await check(execChecks, 'simavr-crosscheck', 'Independent simavr run of the same firmware agrees with avr8js', async () => {
    if (!resolveTool('simavr').path) return { status: 'skip', detail: 'simavr not installed (optional cross-check)' };
    const r = await runSimavr(BLINK, ['D13'], 5.5);
    if (!r.ok || !r.edges) return { status: 'fail', detail: r.message + ' ' + (r.output ?? '').slice(-500) };
    const v = validateBlink(r.edges, 'D13', 1000, 0.005, 4);
    const diffs = r.edges.slice(1, Math.min(r.edges.length, edges.length)).map((e, i) => Math.abs(e.t - edges[i + 1].t));
    const maxDiff = Math.max(...diffs);
    return { status: v.ok && maxDiff < 1.0 ? 'pass' : 'fail', detail: `simavr ${r.edges.length} edges; ${v.reason}; max |simavr-avr8js| = ${maxDiff.toFixed(4)} ms`, evidence: { simavr: r.simavr, firmwareSha256: r.firmwareSha256 } };
  });
  await check(execChecks, 'button-feedback', 'Circuit -> MCU feedback: button with INPUT_PULLUP toggles LED', async () => {
    const code = `void setup(){ pinMode(2, INPUT_PULLUP); pinMode(13, OUTPUT);} void loop(){ digitalWrite(13, digitalRead(2) == LOW ? HIGH : LOW); }`;
    const c = await compileSketch(code);
    if (!c.ok || !c.hex) return { status: 'fail', detail: c.message };
    const project = validateProject({ ...LED_PROJECT, code, parts: [...LED_PROJECT.parts, { id: 'BTN', type: 'button', x: 0, y: 0, props: {} }], wires: [...LED_PROJECT.wires, { id: 'w4', from: 'BTN.1a', to: 'uno.D2' }, { id: 'w5', from: 'BTN.2a', to: 'uno.GND.2' }] });
    const sim = new CoSimulation(project, parseIntelHex(c.hex).image);
    sim.run(0.05); const a = sim.snapshot();
    sim.setProp('BTN', 'pressed', 1); sim.run(0.05); const b = sim.snapshot();
    sim.setProp('BTN', 'pressed', 0); sim.run(0.05); const d = sim.snapshot();
    const ia = Number(a.parts.LED1.current), ib = Number(b.parts.LED1.current), id = Number(d.parts.LED1.current);
    return { status: ia < 1e-4 && ib > 0.01 && id < 1e-4 ? 'pass' : 'fail', detail: `LED current released ${(ia * 1000).toFixed(3)} mA, pressed ${(ib * 1000).toFixed(2)} mA, released ${(id * 1000).toFixed(3)} mA; D2 pressed ${b.pins.D2.voltage.toFixed(3)} V` };
  });
  await check(execChecks, 'adc-feedback', 'Circuit -> ADC: potentiometer read by analogRead and echoed on Serial', async () => {
    const code = `void setup(){ Serial.begin(115200);} void loop(){ Serial.println(analogRead(A0)); delay(20);} `;
    const c = await compileSketch(code);
    if (!c.ok || !c.hex) return { status: 'fail', detail: c.message };
    const project = validateProject({ format: PROJECT_FORMAT, version: 1, name: 'pot', board: 'uno', code, parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }, { id: 'POT', type: 'potentiometer', x: 0, y: 0, props: { position: 0.25 } }], wires: [{ from: 'POT.gnd', to: 'uno.GND.1' }, { from: 'POT.vcc', to: 'uno.5V' }, { from: 'POT.wiper', to: 'uno.A0' }] });
    const sim = new CoSimulation(project, parseIntelHex(c.hex).image);
    sim.run(0.1); const s1 = sim.serialOutput;
    sim.setProp('POT', 'position', 0.75); sim.run(0.1); const s2 = sim.serialOutput.slice(s1.length);
    const last = (s: string) => Number(s.trim().split(/\r?\n/).pop());
    const v1 = last(s1), v2 = last(s2);
    return { status: Math.abs(v1 - 256) <= 3 && Math.abs(v2 - 767) <= 3 ? 'pass' : 'fail', detail: `analogRead at 25 % = ${v1} (expected ≈256), at 75 % = ${v2} (expected ≈767)` };
  });
  reports.push(mk('execution', execChecks));

  // 4. measurements (SPICE)
  const meas: Check[] = [];
  const project = validateProject(LED_PROJECT);
  await check(meas, 'spice-led-dc', 'ngspice LED circuit (D13 HIGH, 220 Ω, red LED) vs internal MNA', async () => {
    if (!resolveTool('ngspice').path) return { status: 'fail', detail: 'ngspice missing' };
    const b = buildCircuit(project); setMcuPin(b.mcuPins.get('D13')!, 'high');
    const internal = b.circuit.solve(0);
    const n27 = b.netlist.nets.find((n) => n.pins.includes('R1.b'))!;
    const gen = generateSpice(b, { analysis: { type: 'tran', stepS: 1e-5, stopS: 1e-3, uic: false }, probes: ['D13', n27.name] });
    const r = await runNgspice(gen.netlist);
    if (!r.ok || !r.data) return { status: 'fail', detail: r.message + ' ' + r.output.slice(-800) };
    const last = r.data.rows[r.data.rows.length - 1];
    const vD13 = last[1], vA = last[2];
    const iSpice = (vD13 - vA) / 220; const iInt = internal.current.get('R1')!;
    const hand = (4.632 - 1.94) / 220;
    const err = Math.abs(iSpice - iInt) / iInt;
    return { status: err < 0.01 && iSpice > 0.010 && iSpice < 0.016 ? 'pass' : 'fail', detail: `I_LED ngspice ${(iSpice * 1000).toFixed(3)} mA, internal ${(iInt * 1000).toFixed(3)} mA (Δ ${(err * 100).toFixed(3)} %), hand calc ≈ ${(hand * 1000).toFixed(2)} mA; V(D13) ${vD13.toFixed(4)} V, V(anode) ${vA.toFixed(4)} V; P_R = ${(iSpice * iSpice * 220 * 1000).toFixed(2)} mW`, evidence: { netlist_sha256: r.netlistSha256, ngspice: r.ngspice } };
  });
  await check(meas, 'spice-rc', 'ngspice RC step (1 kΩ, 1 µF): V(τ) = 63.2 % and matches analytic + MNA', async () => {
    if (!resolveTool('ngspice').path) return { status: 'fail', detail: 'ngspice missing' };
    const net = '* RC\nV1 in 0 PULSE(0 5 0 1n 1n 1 2)\nR1 in out 1k\nC1 out 0 1u IC=0\n.tran 1u 5m UIC\n.control\nset wr_singlescale\nset wr_vecnames\nrun\nwrdata asp_data.txt v(out)\n.endc\n.end\n';
    const r = await runNgspice(net);
    if (!r.ok || !r.data) return { status: 'fail', detail: r.message };
    const at = (t: number) => { let best = r.data!.rows[0]; for (const row of r.data!.rows) if (Math.abs(row[0] - t) < Math.abs(best[0] - t)) best = row; return best[1]; };
    const vt = at(1e-3), v5 = at(5e-3);
    const ana = 5 * (1 - Math.exp(-1));
    const mna = api.rcTransient({ ohms: 1000, farads: 1e-6, volts: 5, duration: 5e-3, steps: 500 });
    const mnaAtTau = mna.samples.find((s) => Math.abs(s.t - 1e-3) < 1e-9)!.v_mna;
    const ok = Math.abs(vt - ana) < 0.02 && Math.abs(mnaAtTau - ana) < 0.02 && v5 > 4.95;
    return { status: ok ? 'pass' : 'fail', detail: `V(1 ms): ngspice ${vt.toFixed(4)} V, analytic ${ana.toFixed(4)} V, MNA ${mnaAtTau.toFixed(4)} V; V(5τ) ngspice ${v5.toFixed(4)} V`, evidence: { netlist_sha256: r.netlistSha256 } };
  });
  await check(meas, 'avr-gpio-spice', 'AVR -> GPIO -> SPICE (sequential) from the same firmware', async () => {
    if (!hex) return { status: 'skip', detail: 'no firmware' };
    if (!resolveTool('ngspice').path) return { status: 'fail', detail: 'ngspice missing' };
    if (!edges.length) return { status: 'fail', detail: 'no trace' };
    const tr = [{ t: 0, pin: 'D13', value: 0 as 0 | 1 }, ...edges.filter((e) => e.t <= 4500)];
    const b = buildCircuit(project);
    const anode = b.netlist.nets.find((n) => n.pins.includes('R1.b'))!.name;
    const gen = generateSpice(b, { analysis: { type: 'tran', stepS: 1e-3, stopS: 4.5 }, probes: ['D13', anode], pwl: [{ pin: 'D13', edges: tr }] });
    const r = await runNgspice(gen.netlist, { timeoutMs: 120000 });
    if (!r.ok || !r.data) return { status: 'fail', detail: r.message + r.output.slice(-600) };
    const sample = (t: number) => { let best = r.data!.rows[0]; for (const row of r.data!.rows) if (Math.abs(row[0] - t) < Math.abs(best[0] - t)) best = row; return best; };
    const on = sample(0.5), off = sample(1.5);
    const iOn = (on[1] - on[2]) / 220, iOff = (off[1] - off[2]) / 220;
    const cosimOn = ledAvg?.on_mA / 1000;
    const ok = iOn > 0.01 && Math.abs(iOff) < 1e-5 && Math.abs(iOn - cosimOn) / cosimOn < 0.01;
    return { status: ok ? 'pass' : 'fail', detail: `LED current from replayed firmware trace: t=0.5 s ${(iOn * 1000).toFixed(3)} mA (co-sim ${(cosimOn * 1000).toFixed(3)} mA), t=1.5 s ${(iOff * 1000).toFixed(5)} mA. Pipeline is sequential (trace then SPICE); live bidirectional coupling is verified separately by the co-simulation checks.`, evidence: { firmware_sha256: firmwareSha, trace_sha256: sha(traceCsv), netlist_sha256: r.netlistSha256 } };
  });
  await check(meas, 'spice-timeout', 'ngspice timeout is reported as failure, not success', async () => {
    if (!resolveTool('ngspice').path) return { status: 'skip', detail: 'ngspice missing' };
    const net = '* long\nV1 a 0 SIN(0 1 1meg)\nR1 a b 1k\nC1 b 0 1n\n.tran 1n 1\n.control\nrun\n.endc\n.end\n';
    const r = await runNgspice(net, { timeoutMs: 1500 });
    return { status: !r.ok && /timed out/.test(r.message) ? 'pass' : 'fail', detail: r.message };
  });
  reports.push(mk('measurements', meas));

  // 5. file I/O
  const io: Check[] = [];
  await check(io, 'vcd-roundtrip', 'GPIO CSV -> VCD -> CSV round trip', async () => {
    if (!edges.length) return { status: 'skip', detail: 'no trace' };
    const vcd = exportVcd(edges);
    const back = importVcd(vcd, { D13: 'D13' });
    const same = back.length === edges.length && back.every((e, i) => Math.abs(e.t - Math.round(edges[i].t * 1000) / 1000) < 1e-6 && e.value === edges[i].value);
    return { status: same ? 'pass' : 'fail', detail: `${edges.length} edges -> ${vcd.length} bytes VCD -> ${back.length} edges` };
  });
  await check(io, 'vcd-malformed', 'Malformed VCD inputs are rejected', async () => {
    const bad = [
      '$timescale 1 us $end $var wire 1 ! led $end $enddefinitions $end #0 x!',
      '$timescale 1 us $end $var wire 1 ! led $end $enddefinitions $end #10 1! #5 0!',
      '$timescale 7 us $end $var wire 1 ! led $end $enddefinitions $end #0 1!',
      '$var wire 1 ! led $end #0 1!',
    ];
    const results = bad.map((v) => { try { importVcd(v, { led: 'D13' }); return 'accepted'; } catch (e: any) { return 'rejected: ' + e.message; } });
    return { status: results.every((r) => r.startsWith('rejected')) ? 'pass' : 'fail', detail: results.join(' | ') };
  });
  await check(io, 'project-roundtrip', 'Project JSON save -> reopen keeps parts, wires and code', async () => {
    const p = validateProject(LED_PROJECT);
    const file = path.join(outDir, 'roundtrip.asproj');
    fs.writeFileSync(file, JSON.stringify(p, null, 2));
    const q = validateProject(JSON.parse(fs.readFileSync(file, 'utf8')));
    fs.rmSync(file);
    return { status: JSON.stringify(p) === JSON.stringify(q) ? 'pass' : 'fail', detail: `${q.parts.length} parts, ${q.wires.length} wires, ${q.code.length} chars` };
  });
  await check(io, 'project-malformed', 'Invalid project files are rejected with a reason', async () => {
    const cases: unknown[] = [null, { format: 'x' }, { ...LED_PROJECT, parts: [{ id: 'uno', type: 'uno', x: 0, y: 0 }, { id: 'R1', type: 'resistor', x: 0, y: 0, props: { ohms: Infinity } }] }, { ...LED_PROJECT, wires: [{ from: 'uno.D99', to: 'R1.a' }] }];
    const res = cases.map((c) => { try { validateProject(c); return 'accepted'; } catch (e: any) { return 'rejected: ' + e.message; } });
    return { status: res.every((r) => r.startsWith('rejected')) ? 'pass' : 'fail', detail: res.join(' | ') };
  });
  await check(io, 'spice-export', 'SPICE netlist export is deterministic and self-contained', async () => {
    const b1 = generateSpice(buildCircuit(project), { analysis: { type: 'op' }, probes: ['D13'] }).netlist;
    const b2 = generateSpice(buildCircuit(project), { analysis: { type: 'op' }, probes: ['D13'] }).netlist;
    return { status: b1 === b2 && !/\.include|\.lib/i.test(b1) && /\.model/.test(b1) ? 'pass' : 'fail', detail: `${b1.split('\n').length} lines, sha256 ${sha(b1).slice(0, 16)}…` };
  });
  await check(io, 'csv-malformed', 'Malformed GPIO CSV is rejected', async () => {
    const bad = ['', 'time,pin\n0,D13', 'time_ms,pin,value\n5,D13,1\n1,D13,0', 'time_ms,pin,value\n0,D99,1', 'time_ms,pin,value\n0,D13,2'];
    const res = bad.map((c) => { try { parseGpioCsv(c); return 'accepted'; } catch (e: any) { return 'rejected'; } });
    return { status: res.every((r) => r === 'rejected') ? 'pass' : 'fail', detail: res.join(', ') };
  });
  await check(io, 'csv-roundtrip', 'CSV export/import keeps edges', async () => {
    if (!edges.length) return { status: 'skip', detail: 'no trace' };
    const back = parseGpioCsv(toGpioCsv(edges));
    return { status: back.length === edges.length ? 'pass' : 'fail', detail: `${back.length} edges` };
  });
  reports.push(mk('io', io));

  // 6. build
  const build: Check[] = [];
  build.push({ id: 'runtime', title: 'Runtime identity', status: 'pass', detail: `${process.platform}/${process.arch} node ${process.versions.node}${process.versions.electron ? ' electron ' + process.versions.electron : ''}`, evidence: { ...api.status(), ...opts.build }, durationMs: 0 });
  reports.push(mk('build', build));

  const summary = {
    report: 'summary', runId, generatedAt: new Date().toISOString(), version: api.APP_VERSION,
    status: reports.some((r) => r.status === 'fail') ? 'fail' : 'pass',
    reports: reports.map((r) => ({ report: r.report, status: r.status, pass: r.checks.filter((c) => c.status === 'pass').length, fail: r.checks.filter((c) => c.status === 'fail').length, skip: r.checks.filter((c) => c.status === 'skip').length })),
    note: 'Skipped checks are not counted as passed. AVR->SPICE in ngspice is sequential; the internal engine provides live bidirectional co-simulation.',
  };
  for (const r of reports) fs.writeFileSync(path.join(outDir, `${r.report}-report.json`), JSON.stringify(r, null, 2));
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  return { summary, reports };
}
