/**
 * Unified native tool discovery for every code path.
 * Order: explicit environment variable -> bundled tools next to the app -> PATH.
 * An explicit but invalid override is an error; we never silently fall back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type ToolName = 'avr-gcc' | 'avr-g++' | 'avr-objcopy' | 'avr-size' | 'avr-gcc-ar' | 'avrdude' | 'arduino-cli' | 'ngspice' | 'simavr';

const EXE = process.platform === 'win32' ? '.exe' : '';

export const ENV_KEYS: Record<string, string> = {
  'arduino-cli': 'ARDUINO_CLI_PATH',
  simavr: 'ARDUINO_SIMAVR_PATH',
  ngspice: 'ARDUINO_NGSPICE_PATH',
  avrdude: 'ARDUINO_AVRDUDE_PATH',
  'avr-gcc': 'ARDUINO_AVR_GCC_PATH', // path to avr-gcc executable; siblings resolved from its folder
};

let resourcesRoot: string | null = null;
/** set by Electron main (process.resourcesPath) or tests */
export function setResourcesRoot(p: string) { resourcesRoot = p; }
export function getResourcesRoot(): string {
  if (process.env.ASP_RESOURCES_DIR) return path.resolve(process.env.ASP_RESOURCES_DIR);
  if (resourcesRoot) return resourcesRoot;
  return path.resolve(__dirname, '..', '..', 'resources');
}

function bundledRelative(name: ToolName): string[] {
  switch (name) {
    case 'avr-gcc': case 'avr-g++': case 'avr-objcopy': case 'avr-size': case 'avr-gcc-ar':
      return [`tools/avr-gcc/bin/${name}${EXE}`];
    case 'avrdude': return [`tools/avrdude/avrdude${EXE}`, `tools/avr-gcc/bin/avrdude${EXE}`];
    case 'arduino-cli': return [`tools/arduino-cli/arduino-cli${EXE}`];
    case 'ngspice': return [`tools/ngspice/bin/ngspice${EXE}`];
    case 'simavr': return [`tools/simavr/simavr${EXE}`, `tools/simavr/bin/simavr${EXE}`];
  }
}

function isExecutable(p: string): boolean {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    if (process.platform === 'win32') return true;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch { return false; }
}

function which(name: string): string | null {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    const c = path.join(d, name + EXE);
    if (isExecutable(c)) return c;
  }
  return null;
}

export interface ToolResolution {
  name: ToolName;
  path: string | null;
  source: 'env' | 'bundled' | 'path' | 'missing' | 'invalid-override';
  envKey?: string;
  error?: string;
}

export function resolveTool(name: ToolName): ToolResolution {
  const gccFamily = name.startsWith('avr-') && name !== 'avrdude';
  const envKey = gccFamily ? ENV_KEYS['avr-gcc'] : ENV_KEYS[name];
  const override = envKey ? (process.env[envKey] ?? '').trim().replace(/^"|"$/g, '') : '';
  if (override) {
    let candidate = override;
    if (gccFamily && name !== 'avr-gcc') candidate = path.join(path.dirname(override), name + EXE);
    if (isExecutable(candidate)) return { name, path: path.resolve(candidate), source: 'env', envKey };
    return { name, path: null, source: 'invalid-override', envKey, error: `${envKey} points to a missing or non-executable file: ${candidate}` };
  }
  for (const rel of bundledRelative(name)) {
    const p = path.join(getResourcesRoot(), rel);
    if (isExecutable(p)) return { name, path: p, source: 'bundled', envKey };
  }
  const w = which(name);
  if (w) return { name, path: w, source: 'path', envKey };
  return { name, path: null, source: 'missing', envKey };
}

export function requireTool(name: ToolName): string {
  const r = resolveTool(name);
  if (!r.path) throw new ToolError(r.error ?? `${name} not found (bundled tools missing and not on PATH)`, name);
  return r.path;
}

export class ToolError extends Error { constructor(msg: string, public tool: string) { super(msg); } }

export function probeVersion(exe: string, args: string[], timeoutMs = 8000): { ok: boolean; output: string; error?: string } {
  try {
    const p = spawnSync(exe, args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, shell: false, input: '' });
    if (p.error) return { ok: false, output: '', error: p.error.message };
    const out = ((p.stdout ?? '') + '\n' + (p.stderr ?? '')).trim();
    return { ok: p.status === 0 || out.length > 0, output: out.slice(0, 2000) };
  } catch (e) { return { ok: false, output: '', error: String(e) }; }
}

/** Arduino AVR core (cores/arduino + variants/standard) location */
export function arduinoCoreDir(): { path: string | null; source: string } {
  const env = process.env.ARDUINO_CORE_AVR_PATH;
  if (env) return fs.existsSync(path.join(env, 'cores', 'arduino', 'Arduino.h')) ? { path: env, source: 'env' } : { path: null, source: 'invalid-override' };
  const bundled = path.join(getResourcesRoot(), 'arduino-core', 'avr');
  if (fs.existsSync(path.join(bundled, 'cores', 'arduino', 'Arduino.h'))) return { path: bundled, source: 'bundled' };
  for (const p of ['/usr/share/arduino/hardware/arduino/avr']) if (fs.existsSync(path.join(p, 'cores', 'arduino', 'Arduino.h'))) return { path: p, source: 'system' };
  return { path: null, source: 'missing' };
}

export function bundledLibrariesDir(): string {
  return path.join(getResourcesRoot(), 'libraries');
}
