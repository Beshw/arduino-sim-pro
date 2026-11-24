/** Application actions: project editing with undo/redo, build & simulation control, files. */
import { getState, setState, Page, Selection } from './store';
import type { Project, PartInstance, Wire } from '../shared/project';
import { validateProject, emptyProject, PROJECT_FORMAT } from '../shared/project';
import { PART_MAP, defaultProps } from '../shared/parts/catalog';
import { EXAMPLES } from '../shared/examples';
import { api, openFile, saveFile, backup } from './bridge';
import type { ToWorker, FromWorker } from './sim/protocol';
import { pushFrame, resetTraces, traces } from './lib/traces';
import { buildCircuit } from '../shared/circuit/models';
import { generateSpice } from '../shared/spice/spice';
import { exportVcd, importVcd, toGpioCsv } from '../shared/signals/signals';
import { tr } from './i18n';

// ------------------------------------------------------------------ toast
let toastTimer: any;
export function toast(text: string, kind: 'info' | 'error' | 'ok' = 'info') {
  setState({ toast: { text, kind } });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setState({ toast: null }), kind === 'error' ? 6000 : 3000);
}
const T = (k: Parameters<typeof tr>[1]) => tr(getState().lang, k);

// ------------------------------------------------------------------ project editing
const MAX_HISTORY = 100;
function commit(next: Project, opts: { circuit?: boolean } = { circuit: true }) {
  const s = getState();
  const past = [...s.past, JSON.stringify(s.project)].slice(-MAX_HISTORY);
  setState({ project: { ...next, updatedAt: new Date().toISOString() }, past, future: [], dirty: true });
  if (opts.circuit) onCircuitChanged();
  scheduleAutosave();
}
export function undo() {
  const s = getState();
  if (!s.past.length) return;
  const prev = JSON.parse(s.past[s.past.length - 1]);
  setState({ project: prev, past: s.past.slice(0, -1), future: [JSON.stringify(s.project), ...s.future], dirty: true, selection: null });
  onCircuitChanged();
}
export function redo() {
  const s = getState();
  if (!s.future.length) return;
  const next = JSON.parse(s.future[0]);
  setState({ project: next, future: s.future.slice(1), past: [...s.past, JSON.stringify(s.project)], dirty: true, selection: null });
  onCircuitChanged();
}

export function setCode(code: string) {
  const s = getState();
  // code edits are not pushed to the circuit history on every keystroke
  setState({ project: { ...s.project, code }, dirty: true });
  scheduleAutosave();
}
export function renameProject(name: string) { commit({ ...getState().project, name: name.slice(0, 120) || 'project' }, { circuit: false }); }

function uniqueId(prefix: string, p: Project) {
  const ids = new Set(p.parts.map((x) => x.id));
  let i = 1;
  while (ids.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}
const PREFIX: Record<string, string> = { resistor: 'R', led: 'LED', rgb_led: 'RGB', button: 'BTN', switch: 'SW', potentiometer: 'POT', ldr: 'LDR', ntc: 'NTC', tmp36: 'TMP', dht11: 'DHT', hcsr04: 'US', buzzer: 'BZ', servo: 'SERVO', dc_motor: 'M', lcd1602: 'LCD', lcd1602_i2c: 'LCD', hc595: 'U', seven_segment: 'SEG', capacitor: 'C', inductor: 'L', diode: 'D', npn: 'Q', dc_supply: 'V', breadboard: 'bb', uno: 'uno' };

export function addPart(type: string, x: number, y: number): string | null {
  const p = getState().project;
  if (!PART_MAP[type]) return null;
  if (type === 'uno' && p.parts.some((q) => q.type === 'uno')) { toast(getState().lang === 'ar' ? 'اللوحة موجودة مسبقاً' : 'Board already placed', 'info'); return null; }
  const id = uniqueId(PREFIX[type] ?? 'P', p);
  const part: PartInstance = { id, type, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10, rotation: 0, props: defaultProps(type) };
  commit({ ...p, parts: [...p.parts, part] });
  setState({ selection: { kind: 'part', id } });
  return id;
}
export function movePart(id: string, x: number, y: number, record = true) {
  const p = getState().project;
  const parts = p.parts.map((q) => (q.id === id ? { ...q, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 } : q));
  if (record) commit({ ...p, parts });
  else setState({ project: { ...p, parts } });
}
/** begin a drag: remember the state for a single undo entry */
let dragOrigin: string | null = null;
export function beginDrag() { dragOrigin = JSON.stringify(getState().project); }
export function endDrag(moved: boolean) {
  if (dragOrigin && moved) {
    const s = getState();
    setState({ past: [...s.past, dragOrigin].slice(-MAX_HISTORY), future: [], dirty: true });
    onCircuitChanged(); scheduleAutosave();
  }
  dragOrigin = null;
}
export function rotateSelected() {
  const s = getState();
  if (s.selection?.kind !== 'part') return;
  const p = s.project;
  commit({ ...p, parts: p.parts.map((q) => (q.id === s.selection!.id && q.type !== 'uno' && q.type !== 'breadboard' ? { ...q, rotation: (((q.rotation ?? 0) + 90) % 360) } : q)) });
}
export function deleteSelected() {
  const s = getState();
  if (!s.selection) return;
  const p = s.project;
  if (s.selection.kind === 'wire') commit({ ...p, wires: p.wires.filter((w) => w.id !== s.selection!.id) });
  else {
    const id = s.selection.id;
    commit({ ...p, parts: p.parts.filter((q) => q.id !== id), wires: p.wires.filter((w) => !w.from.startsWith(id + '.') && !w.to.startsWith(id + '.')) });
  }
  setState({ selection: null });
}
export function duplicateSelected() {
  const s = getState();
  if (s.selection?.kind !== 'part') return;
  const src = s.project.parts.find((q) => q.id === s.selection!.id);
  if (!src || src.type === 'uno' || src.type === 'breadboard') return;
  const id = uniqueId(PREFIX[src.type] ?? 'P', s.project);
  commit({ ...s.project, parts: [...s.project.parts, { ...src, id, x: src.x + 30, y: src.y + 30, props: { ...src.props } }] });
  setState({ selection: { kind: 'part', id } });
}
export function addWire(from: string, to: string) {
  const p = getState().project;
  if (from === to) return;
  if (p.wires.some((w) => (w.from === from && w.to === to) || (w.from === to && w.to === from))) return;
  let n = p.wires.length + 1;
  const ids = new Set(p.wires.map((w) => w.id));
  while (ids.has('w' + n)) n++;
  const wire: Wire = { id: 'w' + n, from, to, color: getState().wireColor };
  commit({ ...p, wires: [...p.wires, wire] });
}
export function setWireColor(id: string, color: string) {
  const p = getState().project;
  commit({ ...p, wires: p.wires.map((w) => (w.id === id ? { ...w, color } : w)) }, { circuit: false });
}
export function select(sel: Selection) { setState({ selection: sel }); }

/** property change from the inspector or from interacting with a part */
export function setPartProp(partId: string, key: string, value: number | string, opts: { record?: boolean } = {}) {
  const s = getState();
  const part = s.project.parts.find((q) => q.id === partId);
  if (!part) return;
  const def = PART_MAP[part.type]?.props.find((d) => d.key === key);
  const project = { ...s.project, parts: s.project.parts.map((q) => (q.id === partId ? { ...q, props: { ...q.props, [key]: value } } : q)) };
  const live = !!def?.live;
  if (opts.record === false) setState({ project, dirty: true });
  else commit(project, { circuit: !live });
  if (live && (s.simState === 'running' || s.simState === 'paused')) send({ type: 'setProp', part: partId, key, value });
}

// ------------------------------------------------------------------ worker
let worker: Worker | null = null;
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<FromWorker>) => onWorker(ev.data);
  worker.onerror = (e) => { setState({ simState: 'error', simError: e.message }); toast(e.message, 'error'); };
  return worker;
}
const send = (m: ToWorker) => ensureWorker().postMessage(m);

function stamp() {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
function appendSerial(text: string) {
  if (!text) return;
  const s = getState();
  const buf = s.serialPartial + text;
  const parts = buf.split(/\r?\n/);
  const partial = parts.pop() ?? '';
  const t = stamp();
  const lines = parts.map((x) => ({ t, text: x.replace(/\r/g, ''), dir: 'rx' as const }));
  const serial = lines.length ? [...s.serial, ...lines].slice(-3000) : s.serial;
  setState({ serial, serialPartial: partial.length > 2000 ? '' : partial });
  if (partial.length > 2000) setState({ serial: [...serial, { t, text: partial, dir: 'rx' }] });
}

let frames = 0;
function onWorker(m: FromWorker) {
  switch (m.type) {
    case 'frame':
      if (getState().simState === 'idle' || getState().simState === 'error') break; // late frame after stop
      pushFrame(m.gpio, m.probes, m.snap.timeS);
      if (getState().serialSource === 'sim') appendSerial(m.snap.serial);
      frames++;
      setState({ snap: m.snap, rt: m.rt });
      break;
    case 'state': {
      const s = getState();
      if (s.simState === 'compiling' || s.simState === 'idle' || s.simState === 'error') break;
      setState({ simState: m.running ? 'running' : (s.snap ? 'paused' : 'idle') });
      break;
    }
    case 'error': setState({ simState: 'error', simError: m.message }); toast(m.message, 'error'); break;
    case 'loaded': setState({ circuitStale: false }); break;
  }
}

function probesFor(p: Project) {
  if (p.probes?.length) return p.probes;
  // default: probe pins that drive parts (first 4 digital/analog pins used by wires)
  const used: string[] = [];
  for (const w of p.wires) for (const ep of [w.from, w.to]) { const m = /^uno\.((D|A)\d+)$/.exec(ep); if (m && !used.includes(m[1])) used.push(m[1]); }
  return used.slice(0, 4);
}

// ------------------------------------------------------------------ build & run
let compileSeq = 0;
export async function build(): Promise<boolean> {
  const s = getState();
  const code = s.project.code;
  const seq = ++compileSeq;
  setState({ simState: 'compiling', simError: null });
  const t0 = performance.now();
  let r: any;
  try { r = await api('compile', { code }); } catch (e: any) { r = { ok: false, message: String(e?.message ?? e), diagnostics: [] }; }
  if (seq !== compileSeq) return false;
  const info = { ok: !!r?.ok && !!r?.hex, message: r?.message, hex: r?.hex, code, diagnostics: r?.diagnostics ?? [], size: r?.size, log: r?.log, ms: Math.round(performance.now() - t0), sha256: r?.sha256 };
  setState({ compile: info, simState: info.ok ? 'idle' : 'error', simError: info.ok ? null : (r?.message ?? T('buildFail')) });
  if (!info.ok) toast(`${T('buildFail')}: ${info.diagnostics.find((d: any) => d.severity === 'error')?.message ?? r?.message ?? ''}`, 'error');
  return info.ok;
}

export async function runSimulation() {
  const s = getState();
  if (s.simState === 'paused' && !s.circuitStale && s.compile?.ok && s.compile.code === s.project.code) { send({ type: 'run' }); return; }
  if (s.simState === 'compiling') return;
  if (!s.compile?.ok || s.compile.code !== s.project.code) { if (!(await build())) return; }
  startWorker(true);
}
function startWorker(autorun: boolean) {
  const s = getState();
  resetTraces();
  setState({ serial: [], serialPartial: '', snap: null, simState: autorun ? 'running' : 'paused', simError: null });
  send({ type: 'speed', value: s.speed });
  send({ type: 'load', project: JSON.parse(JSON.stringify(s.project)), hex: s.compile?.hex ?? null, probes: probesFor(s.project), autorun });
}
export function pauseSimulation() { if (getState().simState === 'running') send({ type: 'pause' }); else if (getState().simState === 'paused') runSimulation(); }
export function stopSimulation() { send({ type: 'stop' }); setState({ simState: 'idle', snap: null, rt: 0 }); }
export function setSpeed(v: number) { setState({ speed: v }); send({ type: 'speed', value: v }); }
// ---------- real hardware serial monitor ----------
let hwTimer: ReturnType<typeof setInterval> | null = null;
export async function connectHardwareSerial(port: string | null) {
  if (hwTimer) { clearInterval(hwTimer); hwTimer = null; }
  const ar = getState().lang === 'ar';
  if (!port || port === 'sim') { await api('serialClose').catch(() => undefined); setState({ serialSource: 'sim', serial: [], serialPartial: '' }); return; }
  const r: any = await api('serialOpen', { port, baud: getState().baud }).catch((e: any) => ({ ok: false, message: String(e?.message ?? e) }));
  if (!r?.ok) { toast((ar ? 'تعذر فتح المنفذ: ' : 'Cannot open port: ') + (r?.message ?? port), 'error'); setState({ serialSource: 'sim' }); return; }
  setState({ serialSource: port, serial: [{ t: stamp(), text: (ar ? '— متصل بـ ' : '— connected to ') + `${port} @ ${getState().baud} baud`, dir: 'tx' }], serialPartial: '' });
  let busy = false;
  hwTimer = setInterval(async () => {
    if (busy) return; busy = true;
    try {
      const d: any = await api('serialRead');
      if (d?.data) appendSerial(d.data);
      if (!d?.ok) { if (hwTimer) clearInterval(hwTimer); hwTimer = null; setState({ serialSource: 'sim' }); toast(ar ? 'انقطع الاتصال بالمنفذ التسلسلي' : 'Serial port disconnected', 'info'); }
    } finally { busy = false; }
  }, 100);
}
export function serialSend(text: string, ending = '\n') {
  const s = getState();
  if (s.serialSource !== 'sim') {
    api('serialWrite', { data: text + ending }).then((r: any) => { if (!r?.ok) toast(r?.message ?? 'write failed', 'error'); }).catch((e: any) => toast(String(e?.message ?? e), 'error'));
    setState({ serial: [...s.serial, { t: stamp(), text, dir: 'tx' as const }].slice(-3000) });
    return;
  }
  if (s.simState !== 'running' && s.simState !== 'paused') { toast(s.lang === 'ar' ? 'شغّل المحاكاة أولاً' : 'Start the simulation first'); return; }
  send({ type: 'serial', text: text + ending });
  setState({ serial: [...s.serial, { t: stamp(), text, dir: 'tx' as const }].slice(-3000) });
}
export function clearSerial() { setState({ serial: [], serialPartial: '' }); }

let reloadTimer: any;
function onCircuitChanged() {
  const s = getState();
  if (s.simState === 'running' || s.simState === 'paused') {
    setState({ circuitStale: true });
    clearTimeout(reloadTimer);
    // hot-reload the circuit with the same firmware (restarts the MCU)
    reloadTimer = setTimeout(() => {
      const st = getState();
      if ((st.simState === 'running' || st.simState === 'paused') && st.compile?.ok) startWorker(st.simState === 'running');
    }, 400);
  }
}

// ------------------------------------------------------------------ files
let autosaveTimer: any;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const json = JSON.stringify(getState().project);
    try { localStorage.setItem('asp-autosave', json); } catch { /* ignore */ }
  }, 800);
}
setInterval(() => { const s = getState(); if (s.dirty) backup(JSON.stringify(s.project, null, 2)).catch(() => undefined); }, 5 * 60 * 1000);

export function loadProject(p: Project, filePath: string | null = null) {
  stopSimulation();
  resetTraces();
  setState({ project: p, filePath, dirty: false, past: [], future: [], selection: null, compile: null, serial: [], snap: null, simState: 'idle', simError: null, savedAt: filePath ? Date.now() : null });
  scheduleAutosave();
}
export function loadExample(id: string, run = false) {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) return;
  loadProject(ex.project());
  if (getState().page !== 'home' && getState().page !== 'editor' && getState().page !== 'circuit') setState({ page: 'home' });
  if (run) runSimulation();
}
export function newProject() { loadProject({ ...emptyProject(getState().lang === 'ar' ? 'مشروع جديد' : 'New project'), parts: [{ id: 'uno', type: 'uno', x: 20, y: 60, props: {} }, { id: 'bb', type: 'breadboard', x: 360, y: 40, props: {} }] }); }
export async function openProject() {
  const f = await openFile('project');
  if (!f) return;
  if (f.error) return toast(f.error, 'error');
  try { loadProject(validateProject(JSON.parse(f.content)), f.path); toast(`${T('open')}: ${f.name}`, 'ok'); }
  catch (e: any) { toast(String(e?.message ?? e), 'error'); }
}
export async function saveProject(as = false) {
  const s = getState();
  const content = JSON.stringify({ ...s.project, format: PROJECT_FORMAT }, null, 2);
  const r = await saveFile('project', (s.project.name || 'project').replace(/[^\w؀-ۿ -]+/g, '_') + '.asproj', content, as ? undefined : s.filePath ?? undefined);
  if (r) { setState({ filePath: r.path, dirty: false, savedAt: Date.now() }); toast(`${T('saved')}: ${r.name}`, 'ok'); }
}
export async function importIno() {
  const f = await openFile('ino');
  if (!f) return;
  if (f.content.length > 200000) return toast('File too large', 'error');
  commit({ ...getState().project, code: f.content }, { circuit: false });
  toast(`${T('importIno')}: ${f.name}`, 'ok');
}
export async function exportIno() { const s = getState(); await saveFile('ino', (s.project.name || 'sketch').replace(/\W+/g, '_') + '.ino', s.project.code); }
export async function exportHex() {
  const s = getState();
  if (!s.compile?.ok || s.compile.code !== s.project.code) { if (!(await build())) return; }
  await saveFile('hex', (s.project.name || 'sketch').replace(/\W+/g, '_') + '.hex', getState().compile!.hex!);
  setState({ simState: getState().snap ? getState().simState : 'idle' });
}
export function spiceNetlist(): string {
  const built = buildCircuit(getState().project);
  const probes = built.netlist.nets.filter((n) => n.name !== 'GND' && built.netNode[n.id] > 0).map((n) => n.name);
  return generateSpice(built, { analysis: { type: 'op' }, probes }).netlist;
}
export async function exportSpice() { try { await saveFile('spice', (getState().project.name || 'circuit').replace(/\W+/g, '_') + '.cir', spiceNetlist()); } catch (e: any) { toast(String(e?.message ?? e), 'error'); } }
export async function exportVcdFile() {
  if (!traces.edges.length) return toast(getState().lang === 'ar' ? 'لا توجد إشارات مسجلة بعد' : 'No recorded signals yet', 'info');
  await saveFile('vcd', 'signals.vcd', exportVcd(traces.edges.map((e) => ({ t: e.t * 1000, pin: e.pin, value: e.value })) as any));
}
export async function exportCsvFile() {
  if (!traces.edges.length) return toast(getState().lang === 'ar' ? 'لا توجد إشارات مسجلة بعد' : 'No recorded signals yet', 'info');
  await saveFile('csv', 'gpio-trace.csv', toGpioCsv(traces.edges.map((e) => ({ t: e.t * 1000, pin: e.pin, value: e.value })) as any));
}
export async function importVcdFile() {
  const f = await openFile('vcd');
  if (!f) return;
  try {
    const edges = importVcd(f.content, {});
    traces.imported = { name: f.name, edges: edges.map((e: any) => ({ t: e.t / 1000, pin: e.pin, value: e.value })) };
    traces.version++;
    setState({ centerTab: 'timeline' });
    toast(`${T('importVcd')}: ${f.name} (${edges.length})`, 'ok');
  } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
}
export async function exportReport() {
  const s = getState();
  const report = {
    format: 'arduino-simulator-pro/run-report', version: 1, generatedAt: new Date().toISOString(), project: s.project.name,
    compile: s.compile ? { ok: s.compile.ok, size: s.compile.size, sha256: s.compile.sha256, diagnostics: s.compile.diagnostics } : null,
    simulation: s.snap ? { timeS: s.snap.timeS, cycles: s.snap.cycles, pins: s.snap.pins, nets: s.snap.nets, parts: s.snap.parts, issues: s.snap.issues, supplyCurrentA: s.snap.supplyCurrent } : null,
    serialTail: s.serial.slice(-200),
  };
  await saveFile('json', 'simulation-report.json', JSON.stringify(report, null, 2));
}
export const go = (page: Page) => setState({ page });
