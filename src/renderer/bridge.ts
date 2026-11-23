/**
 * Bridge to the Electron main process (window.asp, exposed by the preload).
 * When the UI is opened in a plain browser (development), calls fall back to
 * the local HTTP API of a running app instance.
 */
export interface FileResult { path: string; name: string; content: string; error?: string }
interface AspBridge {
  api(method: string, body?: unknown): Promise<any>;
  upload(body: unknown): Promise<any>;
  openFile(kind: string): Promise<FileResult | null>;
  saveFile(kind: string, suggested: string, content: string, existingPath?: string): Promise<{ path: string; name: string } | null>;
  backup(content: string): Promise<{ path: string }>;
  platform: string;
}
declare global { interface Window { asp?: AspBridge } }

const HTTP_MAP: Record<string, [string, string]> = {
  status: ['GET', '/api/status'], preflight: ['GET', '/api/native/preflight'], compile: ['POST', '/api/compile'],
  avrRun: ['POST', '/api/avr/run'], circuitCheck: ['POST', '/api/circuit/check'], spice: ['POST', '/api/spice/run'],
};

export const hasDesktop = () => !!window.asp;

export async function api<T = any>(method: string, body?: unknown): Promise<T> {
  if (window.asp) return window.asp.api(method, body);
  const m = HTTP_MAP[method];
  if (!m) return { ok: false, message: 'Not available outside the desktop app' } as any;
  const r = await fetch('http://127.0.0.1:8765' + m[1], { method: m[0], headers: { 'content-type': 'application/json' }, body: m[0] === 'POST' ? JSON.stringify(body ?? {}) : undefined });
  return r.json();
}

export async function openFile(kind: string): Promise<FileResult | null> {
  if (window.asp) return window.asp.openFile(kind);
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return resolve(null); resolve({ path: f.name, name: f.name, content: await f.text() }); };
    inp.click();
  });
}

export async function saveFile(kind: string, suggested: string, content: string, existingPath?: string) {
  if (window.asp) return window.asp.saveFile(kind, suggested, content, existingPath);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = suggested; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return { path: suggested, name: suggested };
}

export async function backup(content: string) { if (window.asp) return window.asp.backup(content); try { localStorage.setItem('asp-autosave', content); } catch { /* ignore */ } return null; }
export async function upload(body: unknown) { if (!window.asp) return { ok: false, message: 'Upload needs the desktop app' }; return window.asp.upload(body); }
