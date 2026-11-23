/**
 * Optional local HTTP API (127.0.0.1 only) keeping the original endpoint contracts.
 * Host header must be loopback (anti DNS-rebinding), Origin must be absent or local,
 * bodies are limited to 100 kB. Upload to hardware is NOT exposed over HTTP.
 */
import http from 'node:http';
import * as api from './api';
import * as hw from './hardware';

export const MAX_BODY = 100_000;
export function isLoopbackHost(host: unknown): boolean {
  if (typeof host !== 'string' || !host || /[\/\\@,\s]/.test(host)) return false;
  const m = /^(127\.0\.0\.1|localhost)(?::(\d{1,5}))?$/i.exec(host);
  return !!m && (m[2] === undefined || (+m[2] >= 1 && +m[2] <= 65535));
}

type Handler = (body: any) => unknown | Promise<unknown>;
const POST: Record<string, Handler> = {
  '/api/compile': api.compile,
  '/api/avr/compile-check': () => api.compile({ code: 'void setup(){pinMode(13,OUTPUT);}\nvoid loop(){digitalWrite(13,HIGH);delay(1000);digitalWrite(13,LOW);delay(1000);}\n' }),
  '/api/avr/run': api.avrRun,
  '/api/avr/gpio-native': api.avrRun,
  '/api/avr/simavr': api.simavr,
  '/api/avr/spice-native': api.avrToSpice,
  '/api/circuit/check': api.circuitCheck,
  '/api/netlist/check': api.circuitCheck,
  '/api/dc/solve': api.dcSolve,
  '/api/rc/transient': api.rcTransient,
  '/api/spice/run': api.spice,
  '/api/gpio/trace': api.gpioTrace,
  '/api/gpio/metrics': api.gpioMetrics,
  '/api/gpio/vcd-import': api.vcdImport,
  '/api/gpio/vcd-export': api.vcdExport,
  '/api/gpio/blink-check': api.blinkCheck,
  '/api/serial/open': hw.serialOpen,
  '/api/serial/write': hw.serialWrite,
  '/api/serial/close': hw.serialClose,
};
const GET: Record<string, () => unknown | Promise<unknown>> = {
  '/api/status': api.status,
  '/api/native/preflight': api.preflight,
  '/api/diagnostics': api.preflight,
  '/api/boards': hw.listBoards,
  '/api/serial/read': hw.serialRead,
};

export function startHttpServer(port = 8765, host = '127.0.0.1'): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(async (req, res) => {
    const send = (status: number, obj: unknown) => {
      const b = Buffer.from(JSON.stringify(obj));
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      res.end(b);
    };
    try {
      if (!isLoopbackHost(req.headers.host)) return send(403, { ok: false, message: 'Only loopback Host headers are allowed' });
      const origin = req.headers.origin;
      const actualPort = (server.address() as any)?.port;
      const allowed = new Set([`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`]);
      if (origin && !allowed.has(origin)) return send(403, { ok: false, message: 'Origin not allowed' });
      const url = (req.url ?? '/').split('?')[0];
      if (req.method === 'GET') {
        const h = GET[url];
        if (!h) return send(404, { ok: false, message: 'Unknown API' });
        return send(200, await h());
      }
      if (req.method !== 'POST') return send(405, { ok: false, message: 'Method not allowed' });
      const h = POST[url];
      if (!h) return send(404, { ok: false, message: 'Unknown API' });
      const len = Number(req.headers['content-length'] ?? -1);
      if (!(len >= 0) || len > MAX_BODY) return send(413, { ok: false, message: 'Invalid payload size' });
      const chunks: Buffer[] = []; let total = 0;
      for await (const c of req) { total += c.length; if (total > MAX_BODY) return send(413, { ok: false, message: 'Invalid payload size' }); chunks.push(c as Buffer); }
      let body: any;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { ok: false, message: 'Invalid JSON' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, { ok: false, message: 'Expected JSON object' });
      return send(200, await h(body));
    } catch (e: any) {
      return send(400, { ok: false, message: String(e?.message ?? e) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve({ server, port: (server.address() as any).port }));
  });
}
