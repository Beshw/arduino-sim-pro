/**
 * Electron main process: window, IPC bridge to services, local HTTP API,
 * file dialogs, hardware upload confirmation, headless self-test mode, clean shutdown.
 */
import { app, BrowserWindow, dialog, ipcMain, shell, Menu, nativeTheme } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import * as api from './services/api';
import * as hw from './services/hardware';
import { setResourcesRoot } from './services/toolchain';
import { startHttpServer } from './services/http';
import { killAllChildren } from './services/native';
import { runAcceptance } from './services/acceptance';
import type http from 'node:http';

const isDev = !app.isPackaged && process.env.ASP_DEV === '1';
setResourcesRoot(app.isPackaged ? path.join(process.resourcesPath) : path.resolve(__dirname, '..', '..', 'build-resources', process.platform === 'win32' ? 'win' : 'linux'));
process.env.ASP_CACHE_DIR = process.env.ASP_CACHE_DIR ?? path.join(app.getPath('userData'), 'build-cache');

let win: BrowserWindow | null = null;
let server: http.Server | null = null;
let apiPort: number | null = null;

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings(): Record<string, unknown> { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } }
function saveSettings(s: Record<string, unknown>) { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); }

async function startApi() {
  const s = loadSettings();
  if (s.httpApi === false) return;
  try { const r = await startHttpServer(8765); server = r.server; apiPort = r.port; }
  catch { try { const r = await startHttpServer(0); server = r.server; apiPort = r.port; } catch { apiPort = null; } }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 940, minWidth: 1100, minHeight: 700,
    backgroundColor: '#0b1220', show: false,
    title: 'Arduino Simulator Pro',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: '#0d1526', symbolColor: '#cfd8ea', height: 44 },
    icon: path.join(__dirname, '..', 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (isDev && process.env.ASP_DEV_URL) win.loadURL(process.env.ASP_DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

// ---------------- IPC ----------------
const API: Record<string, (body: any) => unknown> = {
  status: () => ({ ...api.status(), httpApiPort: apiPort, userData: app.getPath('userData') }),
  preflight: api.preflight,
  compile: api.compile,
  avrRun: api.avrRun,
  simavr: api.simavr,
  circuitCheck: api.circuitCheck,
  dcSolve: api.dcSolve,
  rcTransient: api.rcTransient,
  spice: api.spice,
  avrToSpice: api.avrToSpice,
  gpioMetrics: api.gpioMetrics,
  vcdImport: api.vcdImport,
  vcdExport: api.vcdExport,
  blinkCheck: api.blinkCheck,
  boards: hw.listBoards,
  serialOpen: hw.serialOpen,
  serialRead: hw.serialRead,
  serialWrite: hw.serialWrite,
  serialClose: hw.serialClose,
  getSettings: () => loadSettings(),
  setSettings: (b) => { const s = { ...loadSettings(), ...(b ?? {}) }; saveSettings(s); if (typeof s.theme === 'string') nativeTheme.themeSource = s.theme as any; return s; },
  acceptance: async () => {
    const out = path.join(app.getPath('userData'), 'reports', new Date().toISOString().replace(/[:.]/g, '-'));
    const r = await runAcceptance(out, { build: buildInfo() });
    return { ...r, outDir: out };
  },
  openPath: (b) => { const p = String(b?.path ?? ''); if (p && fs.existsSync(p)) shell.openPath(p); return { ok: true }; },
};

function buildInfo() {
  return { packaged: app.isPackaged, exe: process.execPath, electron: process.versions.electron, chrome: process.versions.chrome, resources: process.resourcesPath, version: app.getVersion() };
}

ipcMain.handle('api', async (_e, method: string, body: unknown) => {
  const fn = API[method];
  if (!fn) return { ok: false, message: 'Unknown method ' + method };
  try { return await fn(body); } catch (err: any) { return { ok: false, message: String(err?.message ?? err) }; }
});

ipcMain.handle('upload', async (_e, body: any) => {
  if (!win) return { ok: false, message: 'No window' };
  const r = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['رفع البرنامج / Upload', 'إلغاء / Cancel'], defaultId: 1, cancelId: 1,
    title: 'تأكيد الرفع إلى لوحة حقيقية',
    message: `سيتم استبدال البرنامج الموجود على اللوحة المتصلة بالمنفذ ${String(body?.port)}.`,
    detail: 'تأكد من صحة التوصيلات قبل الرفع. This will overwrite the firmware on the connected board.',
  });
  if (r.response !== 0) return { ok: false, stage: 'confirm', message: 'Upload cancelled by user' };
  return hw.upload(body, true);
});

const FILTERS: Record<string, Electron.FileFilter[]> = {
  project: [{ name: 'Arduino Simulator Pro project', extensions: ['asproj', 'json'] }],
  ino: [{ name: 'Arduino sketch', extensions: ['ino', 'cpp', 'txt'] }],
  vcd: [{ name: 'Value Change Dump', extensions: ['vcd'] }],
  csv: [{ name: 'CSV', extensions: ['csv'] }],
  spice: [{ name: 'SPICE netlist', extensions: ['cir', 'sp', 'spice', 'net'] }],
  hex: [{ name: 'Intel HEX', extensions: ['hex'] }],
  json: [{ name: 'JSON', extensions: ['json'] }],
};
ipcMain.handle('file:open', async (_e, kind: string) => {
  if (!win) return null;
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: FILTERS[kind] ?? [] });
  if (r.canceled || !r.filePaths[0]) return null;
  const st = fs.statSync(r.filePaths[0]);
  if (st.size > 20_000_000) return { error: 'File too large' };
  return { path: r.filePaths[0], name: path.basename(r.filePaths[0]), content: fs.readFileSync(r.filePaths[0], 'utf8') };
});
ipcMain.handle('file:save', async (_e, kind: string, suggested: string, content: string, existingPath?: string) => {
  if (!win || typeof content !== 'string') return null;
  let target = existingPath && fs.existsSync(path.dirname(existingPath)) ? existingPath : null;
  if (!target) {
    const r = await dialog.showSaveDialog(win, { defaultPath: suggested, filters: FILTERS[kind] ?? [] });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  fs.writeFileSync(target, content, 'utf8');
  return { path: target, name: path.basename(target) };
});
ipcMain.handle('backup', async (_e, content: string) => {
  const dir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `autosave-${new Date().toISOString().replace(/[:.]/g, '-')}.asproj`);
  fs.writeFileSync(f, content);
  const files = fs.readdirSync(dir).filter((x) => x.startsWith('autosave-')).sort();
  for (const old of files.slice(0, Math.max(0, files.length - 20))) fs.rmSync(path.join(dir, old), { force: true });
  return { path: f };
});

// ---------------- lifecycle ----------------
async function selfTest(outDir: string) {
  await startApi();
  const status = await fetch(`http://127.0.0.1:${apiPort}/api/status`).then((r) => r.json()).catch((e) => ({ ok: false, message: String(e) }));
  const r = await runAcceptance(outDir, { build: { ...buildInfo(), httpApiPort: apiPort, httpStatus: status } });
  fs.writeFileSync(path.join(outDir, 'http-status.json'), JSON.stringify(status, null, 2));
  console.log(JSON.stringify(r.summary, null, 2));
  shutdown();
  app.exit(r.summary.status === 'pass' && status?.ok ? 0 : 1);
}

function shutdown() {
  killAllChildren();
  hw.serialClose().catch(() => undefined);
  server?.close();
  server = null;
}

const selfTestIdx = process.argv.indexOf('--self-test');
if (selfTestIdx >= 0) {
  const out = path.resolve(process.argv[selfTestIdx + 1] && !process.argv[selfTestIdx + 1].startsWith('--') ? process.argv[selfTestIdx + 1] : path.join(process.cwd(), 'asp-reports'));
  app.whenReady().then(() => selfTest(out));
} else {
  if (!app.requestSingleInstanceLock()) app.quit();
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    const s = loadSettings();
    if (typeof s.theme === 'string') nativeTheme.themeSource = s.theme as any;
    await startApi();
    createWindow();
  });
  app.on('window-all-closed', () => { shutdown(); app.quit(); });
  app.on('before-quit', shutdown);
}
