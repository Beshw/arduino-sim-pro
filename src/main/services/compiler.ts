/**
 * Real Arduino Uno build pipeline.
 * Backend "bundled": .ino preprocessing (Arduino.h + prototypes + #line), avr-gcc/avr-g++
 * with the official Arduino AVR core flags, cached core archive, library discovery,
 * LTO link, objcopy to Intel HEX, avr-size report, diagnostics mapped to sketch lines.
 * Backend "arduino-cli": delegates to `arduino-cli compile --fqbn arduino:avr:uno`.
 * Every build validates the Intel HEX and records SHA-256 of HEX/ELF and source.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { arduinoCoreDir, bundledLibrariesDir, requireTool, resolveTool } from './toolchain';
import { parseIntelHex } from '../../shared/hex';

export interface Diagnostic { file: string; line: number; column: number; severity: 'error' | 'warning' | 'note'; message: string }
export interface CompileResult {
  ok: boolean;
  backend: 'bundled' | 'arduino-cli';
  stage: 'validate' | 'preprocess' | 'core' | 'compile' | 'link' | 'hex' | 'done' | 'tools';
  message: string;
  log: string;
  diagnostics: Diagnostic[];
  hex?: string;
  elfPath?: string;
  hexPath?: string;
  size?: { flash: number; ram: number; flashMax: number; ramMax: number };
  hexCheck?: { ok: boolean; bytes: number; records: number; errors: string[] };
  sha256?: { source: string; hex: string; elf?: string };
  durationMs: number;
  toolVersions?: Record<string, string>;
}

const MAX_SOURCE = 200_000;
const FLASH_MAX = 32256; // 32 KB minus Optiboot bootloader (0.5 KB), as reported by Arduino
const RAM_MAX = 2048;

const COMMON = ['-mmcu=atmega328p', '-DF_CPU=16000000L', '-DARDUINO=10819', '-DARDUINO_AVR_UNO', '-DARDUINO_ARCH_AVR', '-Os', '-g', '-ffunction-sections', '-fdata-sections', '-flto', '-fno-fat-lto-objects', '-MMD'];
const CFLAGS = ['-std=gnu11', '-fno-fat-lto-objects'];
const CXXFLAGS = ['-std=gnu++11', '-fpermissive', '-fno-exceptions', '-fno-threadsafe-statics', '-Wno-error=narrowing', '-fno-rtti'];

function run(exe: string, args: string[], opts: { cwd?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<{ code: number | null; out: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd: opts.cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    const t = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, opts.timeoutMs ?? 120_000);
    const abort = () => child.kill('SIGKILL');
    opts.signal?.addEventListener('abort', abort);
    child.stdout.on('data', (d) => { out += d; if (out.length > 400_000) out = out.slice(-200_000); });
    child.stderr.on('data', (d) => { out += d; if (out.length > 400_000) out = out.slice(-200_000); });
    child.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: out + '\n' + e.message, timedOut }); });
    child.on('close', (code) => { clearTimeout(t); opts.signal?.removeEventListener('abort', abort); resolve({ code, out, timedOut }); });
  });
}

/** Arduino-style .ino -> .cpp: include Arduino.h, auto-generate prototypes, keep line numbers. */
export function preprocessSketch(src: string, fileName = 'sketch.ino'): { cpp: string; prototypes: string[]; includes: string[] } {
  const includes = [...src.matchAll(/^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)].map((m) => m[1]);
  // strip comments & strings for scanning (preserve offsets with spaces)
  const scrub = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/"(?:\\.|[^"\\\n])*"/g, (m) => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"')
    .replace(/'(?:\\.|[^'\\\n])*'/g, (m) => "'" + ' '.repeat(Math.max(0, m.length - 2)) + "'");
  const protos: { proto: string; offset: number }[] = [];
  let depth = 0; let paren = 0; let stmtStart = 0;
  for (let i = 0; i < scrub.length; i++) {
    const ch = scrub[i];
    if (ch === '(') paren++;
    else if (ch === ')') paren--;
    else if (ch === '{') {
      if (depth === 0 && paren === 0) {
        const head = scrub.slice(stmtStart, i).trim();
        const m = /^((?:[A-Za-z_][\w:<>,\s\*&]*?[\s\*&]))([A-Za-z_]\w*)\s*\(([^()]*)\)\s*(const)?$/s.exec(head.replace(/^\s*#.*$/gm, '').trim());
        if (m && !/^(if|for|while|switch|else|do|return|struct|class|enum|union|namespace|typedef)\b/.test(m[1].trim()) && !/\b(struct|class|enum|union|namespace)\b/.test(m[1]) && !/=/.test(head)) {
          const ret = m[1].replace(/\s+/g, ' ').trim();
          const name = m[2];
          const args = m[3].replace(/\s+/g, ' ').trim();
          let start = stmtStart;
          while (start < i && /\s/.test(scrub[start])) start++;
          protos.push({ proto: `${ret} ${name}(${args});`, offset: start });
        }
      }
      depth++;
    } else if (ch === '}') { depth--; if (depth === 0) stmtStart = i + 1; }
    else if ((ch === ';') && depth === 0 && paren === 0) stmtStart = i + 1;
    else if (ch === '\n' && depth === 0 && paren === 0 && /^\s*#/.test(scrub.slice(stmtStart, i).split('\n').pop() ?? '')) stmtStart = i + 1;
  }
  // de-duplicate; drop prototypes whose arguments include default values (cannot repeat)
  const seen = new Set<string>();
  const prototypes = protos.filter((p) => { if (seen.has(p.proto) || /=/.test(p.proto)) return false; seen.add(p.proto); return true; });
  const firstOffset = prototypes.length ? Math.min(...prototypes.map((p) => p.offset)) : src.length;
  // insertion at the start of the line containing the first function
  const insertAt = src.lastIndexOf('\n', Math.max(0, firstOffset - 1)) + 1;
  const lineOfInsert = src.slice(0, insertAt).split('\n').length; // 1-based line number of insertion
  const esc = fileName.replace(/\\/g, '/');
  const cpp = `#include <Arduino.h>\n#line 1 "${esc}"\n` + src.slice(0, insertAt) +
    (prototypes.length ? prototypes.map((p) => p.proto).join('\n') + `\n#line ${lineOfInsert} "${esc}"\n` : '') + src.slice(insertAt);
  return { cpp, prototypes: prototypes.map((p) => p.proto), includes };
}

export function parseDiagnostics(log: string, sketchName = 'sketch.ino'): Diagnostic[] {
  const out: Diagnostic[] = [];
  const re = /^(.*?):(\d+):(?:(\d+):)?\s*(fatal error|error|warning|note):\s*(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(log))) {
    const file = m[1].trim();
    out.push({ file: file.endsWith(sketchName) ? sketchName : path.basename(file), line: +m[2], column: m[3] ? +m[3] : 1, severity: m[4] === 'warning' ? 'warning' : m[4] === 'note' ? 'note' : 'error', message: m[5] });
  }
  const linkRe = /^.*?(undefined reference to [`']([^'`]+)['`])/gm;
  while ((m = linkRe.exec(log))) out.push({ file: sketchName, line: 1, column: 1, severity: 'error', message: m[1] });
  return out;
}

function sha(data: Buffer | string) { return crypto.createHash('sha256').update(data).digest('hex'); }

function listSources(dir: string, recurse = true): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (recurse && !['examples', 'extras', 'test', 'tests'].includes(e.name)) out.push(...listSources(p)); }
    else if (/\.(c|cpp|S)$/.test(e.name)) out.push(p);
  }
  return out;
}

interface LibInfo { name: string; root: string; srcDirs: string[]; includeDirs: string[] }
function libraryRoots(core: string): string[] {
  const roots = [path.join(core, 'libraries'), bundledLibrariesDir()];
  const user = process.env.ARDUINO_LIBRARIES_DIR;
  if (user) roots.push(user);
  const home = os.homedir();
  for (const d of [path.join(home, 'Documents', 'Arduino', 'libraries'), path.join(home, 'Arduino', 'libraries')]) roots.push(d);
  return roots.filter((r) => fs.existsSync(r));
}
function findLibraries(includes: string[], core: string): LibInfo[] {
  const libs: LibInfo[] = [];
  const roots = libraryRoots(core);
  const queue = [...includes];
  const done = new Set<string>();
  while (queue.length) {
    const inc = queue.shift()!;
    if (done.has(inc)) continue;
    done.add(inc);
    for (const r of roots) {
      let found: LibInfo | null = null;
      for (const lib of fs.readdirSync(r)) {
        const root = path.join(r, lib);
        const src = fs.existsSync(path.join(root, 'src')) ? path.join(root, 'src') : root;
        if (fs.existsSync(path.join(src, inc))) { found = { name: lib, root, srcDirs: [src], includeDirs: [src] }; break; }
      }
      if (found) {
        if (!libs.some((l) => l.root === found!.root)) {
          libs.push(found);
          // transitive includes
          for (const f of listSources(found.srcDirs[0]).concat(fs.readdirSync(found.srcDirs[0]).filter((x) => x.endsWith('.h')).map((x) => path.join(found!.srcDirs[0], x)))) {
            try { for (const m of fs.readFileSync(f, 'utf8').matchAll(/^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)) queue.push(m[1]); } catch { /* ignore */ }
          }
        }
        break;
      }
    }
  }
  return libs;
}

export function cacheDir(): string {
  const base = process.env.ASP_CACHE_DIR ?? path.join(os.tmpdir(), 'arduino-sim-pro-cache');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

async function buildCore(core: string, gcc: string, gxx: string, ar: string, log: string[], signal?: AbortSignal): Promise<string> {
  const key = sha([core, gcc, COMMON.join(' '), CXXFLAGS.join(' '), '3'].join('|')).slice(0, 16);
  const dir = path.join(cacheDir(), 'core-' + key);
  const archive = path.join(dir, 'core.a');
  if (fs.existsSync(archive)) return archive;
  fs.mkdirSync(dir, { recursive: true });
  const inc = ['-I' + path.join(core, 'cores', 'arduino'), '-I' + path.join(core, 'variants', 'standard')];
  const objs: string[] = [];
  const srcs = listSources(path.join(core, 'cores', 'arduino'), false);
  await Promise.all(srcs.map(async (s) => {
    const o = path.join(dir, path.basename(s) + '.o');
    const isCpp = s.endsWith('.cpp');
    const args = s.endsWith('.S') ? [...COMMON, '-x', 'assembler-with-cpp', ...inc, '-c', s, '-o', o]
      : [...COMMON, ...(isCpp ? CXXFLAGS : CFLAGS), '-w', ...inc, '-c', s, '-o', o];
    const r = await run(isCpp ? gxx : gcc, args, { signal });
    if (r.code !== 0) throw new Error('Core build failed for ' + path.basename(s) + '\n' + r.out);
    objs.push(o);
  }));
  const tmpArchive = archive + '.tmp';
  const r = await run(ar, ['rcs', tmpArchive, ...objs.sort()], { signal });
  if (r.code !== 0) throw new Error('Core archive failed\n' + r.out);
  fs.renameSync(tmpArchive, archive);
  log.push(`core: built ${objs.length} objects -> ${archive}`);
  return archive;
}

export interface CompileOptions { backend?: 'auto' | 'bundled' | 'arduino-cli'; outDir?: string; signal?: AbortSignal; timeoutMs?: number; extraSources?: { name: string; content: string }[]; extraLdFlags?: string[] }
export async function compileSketch(code: string, opts: CompileOptions = {}): Promise<CompileResult> {
  const t0 = Date.now();
  const base = { diagnostics: [] as Diagnostic[], log: '', durationMs: 0 };
  if (typeof code !== 'string' || code.length === 0) return { ...base, ok: false, backend: 'bundled', stage: 'validate', message: 'Empty sketch', durationMs: 0 };
  if (code.length > MAX_SOURCE) return { ...base, ok: false, backend: 'bundled', stage: 'validate', message: `Sketch too large (> ${MAX_SOURCE} chars)`, durationMs: 0 };
  if (!/\bvoid\s+setup\s*\(/.test(code) || !/\bvoid\s+loop\s*\(/.test(code)) {
    return { ...base, ok: false, backend: 'bundled', stage: 'validate', message: 'Sketch must define void setup() and void loop()', diagnostics: [{ file: 'sketch.ino', line: 1, column: 1, severity: 'error', message: 'الدالتان setup() وloop() مطلوبتان / setup() and loop() are required' }], durationMs: 0 };
  }
  const want = opts.backend ?? 'auto';
  const haveBundled = !!resolveTool('avr-gcc').path && !!arduinoCoreDir().path;
  const backend = want === 'auto' ? (haveBundled ? 'bundled' : 'arduino-cli') : want;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'asp-build-'));
  try {
    const res = backend === 'bundled' ? await compileBundled(code, work, opts.signal, opts.extraSources, opts.extraLdFlags) : await compileCli(code, work, opts.signal, opts.timeoutMs);
    res.durationMs = Date.now() - t0;
    if (res.ok && res.hexPath) {
      const hex = fs.readFileSync(res.hexPath, 'utf8');
      const chk = parseIntelHex(hex);
      res.hexCheck = { ok: chk.ok, bytes: chk.bytes, records: chk.records, errors: chk.errors };
      res.hex = hex;
      res.sha256 = { source: sha(code), hex: sha(hex), elf: res.elfPath && fs.existsSync(res.elfPath) ? sha(fs.readFileSync(res.elfPath)) : undefined };
      if (!chk.ok) { res.ok = false; res.stage = 'hex'; res.message = 'Produced Intel HEX failed validation: ' + chk.errors.join('; '); }
      if (res.size && res.size.flash > FLASH_MAX) { res.ok = false; res.stage = 'link'; res.message = `Sketch uses ${res.size.flash} bytes; maximum is ${FLASH_MAX}`; }
      if (opts.outDir) {
        fs.mkdirSync(opts.outDir, { recursive: true });
        const hp = path.join(opts.outDir, 'sketch.ino.hex'); fs.copyFileSync(res.hexPath, hp); res.hexPath = hp;
        if (res.elfPath) { const ep = path.join(opts.outDir, 'sketch.ino.elf'); fs.copyFileSync(res.elfPath, ep); res.elfPath = ep; }
      } else { res.hexPath = undefined; res.elfPath = undefined; }
    }
    return res;
  } catch (e: any) {
    return { ...base, ok: false, backend, stage: 'tools', message: String(e?.message ?? e), durationMs: Date.now() - t0 };
  } finally {
    if (!opts.outDir) fs.rmSync(work, { recursive: true, force: true });
  }
}

async function compileBundled(code: string, work: string, signal?: AbortSignal, extra: { name: string; content: string }[] = [], extraLd: string[] = []): Promise<CompileResult> {
  const log: string[] = [];
  const gcc = requireTool('avr-gcc'), gxx = requireTool('avr-g++'), objcopy = requireTool('avr-objcopy'), size = requireTool('avr-size'), ar = requireTool('avr-gcc-ar');
  const core = arduinoCoreDir().path;
  if (!core) throw new Error('Arduino AVR core not found');
  const ver = await run(gcc, ['-dumpversion']);
  const toolVersions = { 'avr-gcc': ver.out.trim() };
  const pre = preprocessSketch(code, 'sketch.ino');
  const sketchDir = path.join(work, 'sketch');
  fs.mkdirSync(sketchDir);
  fs.writeFileSync(path.join(sketchDir, 'sketch.ino.cpp'), pre.cpp);
  log.push(`preprocess: ${pre.prototypes.length} prototypes, includes: ${pre.includes.join(', ') || '-'}`);
  let coreA: string;
  try { coreA = await buildCore(core, gcc, gxx, ar, log, signal); }
  catch (e: any) { return { ok: false, backend: 'bundled', stage: 'core', message: 'Core build failed', log: String(e.message), diagnostics: [], durationMs: 0, toolVersions }; }
  const libs = findLibraries(pre.includes.filter((i) => i !== 'Arduino.h'), core);
  const inc = ['-I' + path.join(core, 'cores', 'arduino'), '-I' + path.join(core, 'variants', 'standard'), ...libs.flatMap((l) => l.includeDirs.map((d) => '-I' + d))];
  const objs: string[] = [];
  const sketchObj = path.join(work, 'sketch.ino.cpp.o');
  const r = await run(gxx, [...COMMON, ...CXXFLAGS, '-Wall', '-Wextra', '-Wno-unused-parameter', ...inc, '-c', path.join(sketchDir, 'sketch.ino.cpp'), '-o', sketchObj], { signal });
  let fullLog = log.join('\n') + '\n' + r.out;
  const diagnostics = parseDiagnostics(r.out);
  if (r.code !== 0) return { ok: false, backend: 'bundled', stage: 'compile', message: r.timedOut ? 'Compiler timed out' : 'Compilation failed', log: fullLog, diagnostics, durationMs: 0, toolVersions };
  objs.push(sketchObj);
  for (const lib of libs) {
    for (const s of lib.srcDirs.flatMap((d) => listSources(d))) {
      const o = path.join(work, `lib-${lib.name}-${path.basename(s)}.o`);
      const isCpp = s.endsWith('.cpp');
      const lr = await run(isCpp ? gxx : gcc, [...COMMON, ...(s.endsWith('.S') ? ['-x', 'assembler-with-cpp'] : isCpp ? CXXFLAGS : CFLAGS), '-w', ...inc, '-c', s, '-o', o], { signal });
      fullLog += lr.out;
      if (lr.code !== 0) return { ok: false, backend: 'bundled', stage: 'compile', message: `Library ${lib.name} failed to compile`, log: fullLog, diagnostics: diagnostics.concat(parseDiagnostics(lr.out)), durationMs: 0, toolVersions };
      objs.push(o);
    }
  }
  for (const x of extra) {
    const src = path.join(work, x.name);
    fs.writeFileSync(src, x.content);
    const o = src + '.o';
    const xr = await run(gcc, ['-mmcu=atmega328p', '-Os', '-g', '-c', src, '-o', o], { signal });
    if (xr.code !== 0) return { ok: false, backend: 'bundled', stage: 'compile', message: 'Extra source failed', log: fullLog + xr.out, diagnostics, durationMs: 0, toolVersions };
    objs.push(o);
  }
  const elf = path.join(work, 'sketch.ino.elf');
  const lk = await run(gcc, ['-w', '-Os', '-g', '-flto', '-fuse-linker-plugin', '-Wl,--gc-sections', '-mmcu=atmega328p', ...extraLd, '-o', elf, ...objs, coreA, '-L' + work, '-lm'], { signal });
  fullLog += lk.out;
  if (lk.code !== 0) return { ok: false, backend: 'bundled', stage: 'link', message: 'Link failed', log: fullLog, diagnostics: diagnostics.concat(parseDiagnostics(lk.out)), durationMs: 0, toolVersions };
  const hexPath = path.join(work, 'sketch.ino.hex');
  const oc = await run(objcopy, ['-O', 'ihex', '-R', '.eeprom', '-R', '.mmcu', elf, hexPath], { signal });
  if (oc.code !== 0) return { ok: false, backend: 'bundled', stage: 'hex', message: 'objcopy failed', log: fullLog + oc.out, diagnostics, durationMs: 0, toolVersions };
  const sz = await run(size, ['-A', elf], { signal });
  const sec = (name: string) => { const m = new RegExp(`^\\${name}\\s+(\\d+)`, 'm').exec(sz.out); return m ? +m[1] : 0; };
  const flash = sec('.text') + sec('.data');
  const ram = sec('.data') + sec('.bss') + sec('.noinit');
  fullLog += `\nSketch uses ${flash} bytes (${Math.round((flash / FLASH_MAX) * 100)}%) of program storage space. Maximum is ${FLASH_MAX} bytes.\nGlobal variables use ${ram} bytes (${Math.round((ram / RAM_MAX) * 100)}%) of dynamic memory, leaving ${RAM_MAX - ram} bytes for local variables. Maximum is ${RAM_MAX} bytes.\n`;
  return { ok: true, backend: 'bundled', stage: 'done', message: 'Build succeeded', log: fullLog, diagnostics, hexPath, elfPath: elf, size: { flash, ram, flashMax: FLASH_MAX, ramMax: RAM_MAX }, durationMs: 0, toolVersions };
}

async function compileCli(code: string, work: string, signal?: AbortSignal, timeoutMs = 180_000): Promise<CompileResult> {
  const cli = requireTool('arduino-cli');
  const sketchDir = path.join(work, 'sketch');
  fs.mkdirSync(sketchDir);
  fs.writeFileSync(path.join(sketchDir, 'sketch.ino'), code);
  const out = path.join(work, 'out');
  const r = await run(cli, ['compile', '--fqbn', 'arduino:avr:uno', '--output-dir', out, sketchDir], { signal, timeoutMs });
  const diagnostics = parseDiagnostics(r.out);
  if (r.code !== 0) return { ok: false, backend: 'arduino-cli', stage: r.timedOut ? 'tools' : 'compile', message: r.timedOut ? 'arduino-cli timed out' : 'Compilation failed', log: r.out, diagnostics, durationMs: 0 };
  const flashM = /Sketch uses (\d+) bytes/.exec(r.out); const ramM = /Global variables use (\d+) bytes/.exec(r.out);
  return {
    ok: true, backend: 'arduino-cli', stage: 'done', message: 'Build succeeded', log: r.out, diagnostics,
    hexPath: path.join(out, 'sketch.ino.hex'), elfPath: path.join(out, 'sketch.ino.elf'),
    size: { flash: flashM ? +flashM[1] : 0, ram: ramM ? +ramM[1] : 0, flashMax: FLASH_MAX, ramMax: RAM_MAX }, durationMs: 0,
  };
}
