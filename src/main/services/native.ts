/**
 * Native engine adapters: ngspice (batch), simavr (cross-check of firmware
 * execution with VCD capture). Subprocesses run without a shell, in private
 * temp folders, with hard timeouts and guaranteed cleanup.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeTempDir } from './tempdir';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolveTool, probeVersion } from './toolchain';
import { parseWrdata, SpiceData } from '../../shared/spice/spice';
import { compileSketch } from './compiler';
import { importVcd, Edge } from '../../shared/signals/signals';
import { unoPinToPort } from '../../shared/parts/catalog';

const children = new Set<ReturnType<typeof spawn>>();
export function killAllChildren() { for (const c of children) { try { c.kill('SIGKILL'); } catch { /* */ } } children.clear(); }

function runProc(exe: string, args: string[], cwd: string, timeoutMs: number, stopSignal?: NodeJS.Signals, stopAfterMs?: number, env?: NodeJS.ProcessEnv): Promise<{ code: number | null; signal: NodeJS.Signals | null; out: string; timedOut: boolean; stoppedOnPurpose: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: env ?? process.env });
    children.add(child);
    let out = ''; let timedOut = false; let stopped = false;
    const hard = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    const soft = stopAfterMs !== undefined ? setTimeout(() => { stopped = true; child.kill(stopSignal ?? 'SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 3000); }, stopAfterMs) : null;
    child.stdout.on('data', (d) => { out += d; if (out.length > 300000) out = out.slice(-150000); });
    child.stderr.on('data', (d) => { out += d; if (out.length > 300000) out = out.slice(-150000); });
    child.on('error', (e) => { clearTimeout(hard); if (soft) clearTimeout(soft); children.delete(child); resolve({ code: -1, signal: null, out: out + e.message, timedOut, stoppedOnPurpose: stopped }); });
    child.on('close', (code, signal) => { clearTimeout(hard); if (soft) clearTimeout(soft); children.delete(child); resolve({ code, signal, out, timedOut, stoppedOnPurpose: stopped }); });
  });
}

export interface SpiceRun { ok: boolean; executed: boolean; message: string; output: string; data?: SpiceData; durationMs: number; ngspice?: string; netlistSha256: string }

export async function runNgspice(netlist: string, opts: { timeoutMs?: number; dataFile?: string } = {}): Promise<SpiceRun> {
  const t0 = Date.now();
  const netlistSha256 = crypto.createHash('sha256').update(netlist).digest('hex');
  if (netlist.length > 2_000_000) return { ok: false, executed: false, message: 'Netlist too large', output: '', durationMs: 0, netlistSha256 };
  if (/^\s*\.(include|lib)\b|\bshell\b|^\s*(sh|shell)\s/im.test(netlist)) return { ok: false, executed: false, message: 'Netlist contains disallowed commands (.include/.lib/shell)', output: '', durationMs: 0, netlistSha256 };
  const tool = resolveTool('ngspice');
  if (!tool.path) return { ok: false, executed: false, message: tool.error ?? 'ngspice not installed — netlist exported only', output: '', durationMs: 0, netlistSha256 };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asp-spice-'));
  try {
    fs.writeFileSync(path.join(dir, 'circuit.cir'), netlist);
    // a bundled ngspice keeps its init scripts next to the binary (../share/ngspice)
    const lib = path.join(path.dirname(tool.path), '..', 'share', 'ngspice');
    const env = fs.existsSync(path.join(lib, 'scripts', 'spinit')) ? { ...process.env, SPICE_LIB_DIR: lib } : process.env;
    const r = await runProc(tool.path, ['-b', 'circuit.cir'], dir, opts.timeoutMs ?? 60_000, undefined, undefined, env);
    const dataPath = path.join(dir, opts.dataFile ?? 'asp_data.txt');
    if (r.timedOut) return { ok: false, executed: true, message: 'ngspice timed out', output: r.out.slice(-8000), durationMs: Date.now() - t0, ngspice: tool.path, netlistSha256 };
    if (r.code !== 0) return { ok: false, executed: true, message: `ngspice failed (exit ${r.code})`, output: r.out.slice(-8000), durationMs: Date.now() - t0, ngspice: tool.path, netlistSha256 };
    let data: SpiceData | undefined;
    if (fs.existsSync(dataPath)) {
      try { data = parseWrdata(fs.readFileSync(dataPath, 'utf8')); }
      catch (e: any) { return { ok: false, executed: true, message: 'ngspice measurement invalid: ' + e.message, output: r.out.slice(-8000), durationMs: Date.now() - t0, ngspice: tool.path, netlistSha256 }; }
    }
    if (/\berror\b/i.test(r.out) && !data) return { ok: false, executed: true, message: 'ngspice reported errors', output: r.out.slice(-8000), durationMs: Date.now() - t0, ngspice: tool.path, netlistSha256 };
    return { ok: true, executed: true, message: 'ngspice simulation completed', output: r.out.slice(-8000), data, durationMs: Date.now() - t0, ngspice: tool.path, netlistSha256 };
  } finally { removeTempDir(dir); }
}

// ------------------------------- simavr -------------------------------
function traceSource(pins: string[]): string {
  const lines = [
    '#include <avr/io.h>', '#include <stdint.h>',
    'struct asp_str { uint8_t tag; uint8_t len; char s[64]; } __attribute__((__packed__));',
    'struct asp_long { uint8_t tag; uint8_t len; uint32_t v; } __attribute__((__packed__));',
    'struct asp_trace { uint8_t tag; uint8_t len; uint8_t mask; void *what; char name[32]; } __attribute__((__packed__));',
    // tag numbers from simavr's documented .mmcu section format (VCD_FILENAME=12, VCD_PERIOD=13, VCD_TRACE=14)
    'const struct asp_str asp_vcd_file __attribute__((section(".mmcu"), used)) = { 12, sizeof(struct asp_str) - 2, "gpio.vcd" };',
    'const struct asp_long asp_vcd_period __attribute__((section(".mmcu"), used)) = { 13, sizeof(struct asp_long) - 2, 1 };',
  ];
  pins.forEach((pin, i) => {
    const pp = unoPinToPort(pin)!;
    lines.push(`const struct asp_trace asp_tr${i} __attribute__((section(".mmcu"), used)) = { 14, sizeof(struct asp_trace) - 2, ${1 << pp.bit}, (void *)&PORT${pp.port}, "${pin}" };`);
  });
  return lines.join('\n') + '\n';
}

export interface SimavrResult {
  ok: boolean; stage: string; message: string; edges?: Edge[]; output?: string; firmwareSha256?: string;
  simavr?: string; native: boolean; durationWallMs?: number; vcdBytes?: number;
}

/** Execute firmware in simavr (independent native emulator) and capture GPIO pins via VCD. */
export async function runSimavr(code: string, pins: string[], durationS: number): Promise<SimavrResult> {
  if (!Number.isFinite(durationS) || durationS <= 0 || durationS > 30) return { ok: false, stage: 'validate', message: 'duration must be 0 < d <= 30 s', native: false };
  for (const p of pins) if (!unoPinToPort(p)) return { ok: false, stage: 'validate', message: 'Unsupported pin ' + p, native: false };
  const sim = resolveTool('simavr');
  if (!sim.path) return { ok: false, stage: 'dependencies', message: sim.error ?? 'simavr not installed', native: false };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asp-simavr-'));
  try {
    const build = await compileSketch(code, { backend: 'bundled', outDir: dir, extraSources: [{ name: 'asp_trace.c', content: traceSource(pins) }], extraLdFlags: ['-Wl,--undefined=asp_vcd_file', '-Wl,--section-start=.mmcu=0x910000'] });
    if (!build.ok || !build.elfPath) return { ok: false, stage: 'compile', message: build.message, output: build.log, native: false };
    const t0 = Date.now();
    const r = await runProc(sim.path, ['-m', 'atmega328p', '-f', '16000000', build.elfPath], dir, (durationS * 4 + 20) * 1000, 'SIGINT', durationS * 1000);
    const vcdPath = path.join(dir, 'gpio.vcd');
    if (!r.stoppedOnPurpose && r.code !== 0) return { ok: false, stage: 'avr', message: 'simavr terminated unexpectedly', output: r.out, native: false };
    if (!fs.existsSync(vcdPath)) return { ok: false, stage: 'trace', message: 'simavr did not produce a VCD trace', output: r.out, native: false };
    const vcd = fs.readFileSync(vcdPath, 'utf8');
    // simavr names traced signals by the name we gave; it can emit multi-bit values for masked registers
    const norm = vcd.replace(/^[xXzZ]\S+\s*$/gm, '').replace(/^b[xXzZ]+\s+\S+\s*$/gm, '').replace(/^b([01]+)\s+(\S+)$/gm, (_m, bits: string, id: string) => `${/1/.test(bits) ? 1 : 0}${id}`).replace(/\$var\s+wire\s+\d+\s+/g, '$var wire 1 ');
    const mapping = Object.fromEntries(pins.map((p) => [p, p]));
    let edges: Edge[];
    try { edges = importVcd(norm, mapping); } catch (e: any) { return { ok: false, stage: 'trace', message: 'VCD parse failed: ' + e.message, output: r.out, native: false }; }
    const transitions = edges.length;
    if (transitions < 2) return { ok: false, stage: 'trace', message: 'simavr trace contains no GPIO transitions', output: r.out, native: false, edges };
    return { ok: true, stage: 'native_gpio', message: 'simavr executed the firmware and produced a GPIO trace', edges, output: r.out.slice(-4000), firmwareSha256: build.sha256?.hex, simavr: sim.path, native: true, durationWallMs: Date.now() - t0, vcdBytes: vcd.length };
  } finally { removeTempDir(dir); }
}

export function ngspiceVersion() {
  const t = resolveTool('ngspice');
  return t.path ? probeVersion(t.path, ['--version']) : null;
}
