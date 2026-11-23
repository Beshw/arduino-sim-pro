/**
 * Real hardware: board discovery, firmware upload (avrdude, after explicit user
 * confirmation) and a serial monitor backed by the `serialport` package.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveTool, getResourcesRoot } from './toolchain';
import { compileSketch } from './compiler';

const PORT_RE = process.platform === 'win32' ? /^COM\d{1,3}$/ : /^\/dev\/(ttyACM|ttyUSB|cu\.usbmodem|cu\.usbserial|tty\.usbmodem)[\w.-]*$/;
const BAUDS = [300, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 57600, 74880, 115200, 230400, 250000];
const KNOWN_VID_PID: Record<string, string> = {
  '2341:0043': 'Arduino Uno', '2341:0001': 'Arduino Uno', '2a03:0043': 'Arduino Uno', '2341:0243': 'Arduino Uno',
  '1a86:7523': 'CH340 (Uno clone)', '0403:6001': 'FTDI (Uno/Nano)', '10c4:ea60': 'CP210x',
};

let SerialPortMod: any = null;
async function sp() {
  if (!SerialPortMod) SerialPortMod = await import('serialport');
  return SerialPortMod;
}

export async function listBoards() {
  try {
    const { SerialPort } = await sp();
    const ports = await SerialPort.list();
    return {
      ok: true,
      ports: ports.map((p: any) => {
        const key = p.vendorId && p.productId ? `${p.vendorId.toLowerCase()}:${p.productId.toLowerCase()}` : '';
        return { path: p.path, manufacturer: p.manufacturer ?? null, serialNumber: p.serialNumber ?? null, vendorId: p.vendorId ?? null, productId: p.productId ?? null, board: KNOWN_VID_PID[key] ?? null };
      }),
    };
  } catch (e: any) {
    return { ok: false, ports: [], message: 'Serial port enumeration unavailable: ' + e.message };
  }
}

let port: any = null;
let rx = '';
let lock = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> { const p = lock.then(fn, fn); lock = p.then(() => undefined, () => undefined); return p; }

export function serialOpen(body: any) {
  return withLock(async () => {
    const p = String(body?.port ?? ''); const baud = Number(body?.baud ?? 9600);
    if (!PORT_RE.test(p)) return { ok: false, message: 'Invalid serial port name' };
    if (!BAUDS.includes(baud)) return { ok: false, message: 'Invalid baud rate' };
    if (port?.isOpen) await new Promise((r) => port.close(r));
    const { SerialPort } = await sp();
    rx = '';
    port = await new Promise((resolve, reject) => {
      const s = new SerialPort({ path: p, baudRate: baud, autoOpen: false });
      s.open((err: any) => (err ? reject(err) : resolve(s)));
    }).catch((e) => { throw new Error('Cannot open ' + p + ': ' + e.message); });
    port.on('data', (d: Buffer) => { rx += d.toString('utf8'); if (rx.length > 200000) rx = rx.slice(-100000); });
    port.on('close', () => { port = null; });
    return { ok: true, message: 'Connected to ' + p, port: p, baud };
  });
}
export function serialRead() { const data = rx; rx = ''; return { ok: !!port?.isOpen, data, message: port?.isOpen ? undefined : 'Serial port not open' }; }
export function serialWrite(body: any) {
  return withLock(async () => {
    const data = body?.data;
    if (typeof data !== 'string' || data.length > 4096) throw new Error('Invalid serial data');
    if (!port?.isOpen) return { ok: false, message: 'Open serial first' };
    await new Promise((r, j) => port.write(data, (e: any) => (e ? j(e) : r(null))));
    return { ok: true, message: 'Sent' };
  });
}
export function serialClose() {
  return withLock(async () => { if (port?.isOpen) await new Promise((r) => port.close(r)); port = null; return { ok: true, message: 'Serial closed' }; });
}

/** Upload: compile -> avrdude (arduino bootloader @115200). Caller must have obtained user confirmation. */
export async function upload(body: any, confirmed: boolean) {
  if (!confirmed) return { ok: false, stage: 'confirm', message: 'Upload requires explicit user confirmation' };
  const p = String(body?.port ?? '');
  if (!PORT_RE.test(p)) return { ok: false, stage: 'validate', message: 'Select a valid serial port' };
  const avrdude = resolveTool('avrdude');
  const cli = resolveTool('arduino-cli');
  if (!avrdude.path && !cli.path) return { ok: false, stage: 'tools', message: 'avrdude/arduino-cli not available' };
  await serialClose();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asp-upload-'));
  try {
    const build = await compileSketch(String(body?.code ?? ''), { outDir: dir });
    if (!build.ok || !build.hexPath) return { ok: false, stage: 'compile', message: build.message, log: build.log, diagnostics: build.diagnostics };
    const conf = [path.join(path.dirname(avrdude.path ?? ''), 'avrdude.conf'), path.join(getResourcesRoot(), 'tools', 'avrdude', 'avrdude.conf')].find((c) => fs.existsSync(c));
    const args = [...(conf ? ['-C', conf] : []), '-v', '-p', 'atmega328p', '-c', 'arduino', '-P', p, '-b', '115200', '-D', '-U', `flash:w:${build.hexPath}:i`];
    const out = await new Promise<{ code: number | null; out: string }>((resolve) => {
      const c = spawn(avrdude.path!, args, { shell: false, windowsHide: true });
      let o = ''; const t = setTimeout(() => c.kill('SIGKILL'), 90_000);
      c.stdout.on('data', (d) => (o += d)); c.stderr.on('data', (d) => (o += d));
      c.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: o + e.message }); });
      c.on('close', (code) => { clearTimeout(t); resolve({ code, out: o }); });
    });
    const verified = /bytes of flash verified|flash verified/i.test(out.out);
    return { ok: out.code === 0 && verified, stage: 'upload', message: out.code === 0 ? (verified ? 'Upload complete and verified' : 'avrdude finished without verification message') : 'Upload failed', log: out.out.slice(-12000), size: build.size, sha256: build.sha256 };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
