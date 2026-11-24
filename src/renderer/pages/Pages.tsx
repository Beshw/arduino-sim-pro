/** Secondary pages reached from the navigation rail. */
import React, { useEffect, useMemo, useState } from 'react';
import { useStore, setState, getState } from '../store';
import * as A from '../actions';
import { api, upload, hasDesktop } from '../bridge';
import { Icon } from '../components/Icons';
import { PaletteItem, useT, SerialMonitor } from '../components/Panels';
import { PARTS, PART_MAP } from '../../shared/parts/catalog';
import { EXAMPLES } from '../../shared/examples';
import { buildCircuit, setMcuPin } from '../../shared/circuit/models';
import { buildNetlist } from '../../shared/circuit/netlist';
import Timeline from '../views/Timeline';
import { fmtV } from '../views/CircuitCanvas';

const CATS: Record<string, { ar: string; en: string }> = {
  board: { ar: 'اللوحات', en: 'Boards' }, basic: { ar: 'أساسيات', en: 'Basic' }, input: { ar: 'إدخال', en: 'Input' }, output: { ar: 'إخراج', en: 'Output' },
  sensor: { ar: 'حساسات', en: 'Sensors' }, display: { ar: 'شاشات', en: 'Displays' }, actuator: { ar: 'محركات', en: 'Actuators' }, power: { ar: 'تغذية', en: 'Power' }, semiconductor: { ar: 'أشباه موصلات', en: 'Semiconductors' },
};

export function PartsPage() {
  const lang = useStore((s) => s.lang);
  const [q, setQ] = useState('');
  const list = PARTS.filter((p) => p.type !== 'uno' && (p.name.ar + p.name.en + p.type).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <div className="page-h"><h2><Icon name="cube" /> {lang === 'ar' ? 'مكتبة المكونات' : 'Component library'}</h2><input className="search" placeholder={lang === 'ar' ? 'بحث…' : 'Search…'} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <p className="muted">{lang === 'ar' ? 'انقر لإضافة المكون إلى لوحة الدائرة أو اسحبه إليها. كل مكون له نموذج كهربائي حقيقي في محرك الدوائر.' : 'Click to add or drag onto the circuit. Every part has a real electrical model.'}</p>
      {Object.keys(CATS).map((cat) => {
        const items = list.filter((p) => p.category === cat);
        if (!items.length) return null;
        return (
          <section key={cat} className="cat">
            <h3>{CATS[cat][lang]}</h3>
            <div className="parts-grid">
              {items.map((p) => (
                <div key={p.type} className="part-card">
                  <PaletteItem type={p.type} />
                  <div className="pc-info"><b>{p.name[lang]}</b><small>{p.pins.length > 20 ? `${p.pins.length} ${lang === 'ar' ? 'نقطة' : 'holes'}` : p.pins.map((x) => x.label).join(' · ')}</small>
                    {p.props.length > 0 && <small className="muted">{p.props.map((x) => x.label[lang]).join('، ')}</small>}</div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function LibraryPage() {
  const lang = useStore((s) => s.lang);
  const [libs, setLibs] = useState<string[] | null>(null);
  useEffect(() => { api('preflight').then((r) => setLibs(r?.libraries ?? [])).catch(() => setLibs([])); }, []);
  const insert = (h: string) => { const s = getState(); if (s.project.code.includes(`#include <${h}>`)) return; A.setCode(`#include <${h}>\n` + s.project.code); A.toast(`#include <${h}>`, 'ok'); };
  const HEADERS: Record<string, string> = { Servo: 'Servo.h', LiquidCrystal: 'LiquidCrystal.h', DHT: 'DHT.h', Wire: 'Wire.h', SPI: 'SPI.h', EEPROM: 'EEPROM.h', SoftwareSerial: 'SoftwareSerial.h', HID: 'HID.h' };
  return (
    <div className="page">
      <div className="page-h"><h2><Icon name="layers" /> {lang === 'ar' ? 'المكتبات البرمجية' : 'Libraries'}</h2></div>
      <p className="muted">{lang === 'ar' ? 'المكتبات المضمّنة مع المترجم المدمج (avr-gcc + ArduinoCore-avr). تُكتشف تلقائياً من أوامر #include.' : 'Libraries bundled with the built-in compiler. They are discovered automatically from #include lines.'}</p>
      <div className="lib-grid">
        {libs === null && <div className="muted">…</div>}
        {libs?.map((l) => (
          <div key={l} className="lib-card"><Icon name="book" /><div><b>{l}</b><small>{HEADERS[l] ?? l + '.h'}</small></div><button className="btn sm" onClick={() => insert(HEADERS[l] ?? l + '.h')}><Icon name="plus" size={14} /> #include</button></div>
        ))}
      </div>
    </div>
  );
}

export function LessonsPage() {
  const lang = useStore((s) => s.lang);
  const levels = [1, 2, 3] as const;
  const names = { 1: { ar: 'مبتدئ', en: 'Beginner' }, 2: { ar: 'متوسط', en: 'Intermediate' }, 3: { ar: 'متقدم', en: 'Advanced' } };
  return (
    <div className="page">
      <div className="page-h"><h2><Icon name="cap" /> {lang === 'ar' ? 'الدروس التعليمية' : 'Lessons'}</h2></div>
      {levels.map((lv) => (
        <section key={lv} className="cat">
          <h3>{names[lv][lang]}</h3>
          <div className="lesson-grid">
            {EXAMPLES.filter((e) => e.level === lv).map((ex, i) => (
              <div key={ex.id} className="lesson">
                <div className="lesson-n">{i + 1}</div>
                <div className="lesson-b"><b>{ex.title[lang]}</b><p>{ex.description[lang]}</p></div>
                <div className="lesson-a">
                  <button className="btn sm" onClick={() => { A.loadExample(ex.id); A.go('home'); }}><Icon name="folder" size={14} /> {lang === 'ar' ? 'فتح' : 'Open'}</button>
                  <button className="btn sm run" onClick={() => { A.loadExample(ex.id); A.go('home'); A.runSimulation(); }}><Icon name="play" size={14} /> {lang === 'ar' ? 'تشغيل' : 'Run'}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ProjectsPage() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const project = useStore((s) => s.project);
  const filePath = useStore((s) => s.filePath);
  const [name, setName] = useState(project.name);
  useEffect(() => setName(project.name), [project.name]);
  return (
    <div className="page">
      <div className="page-h"><h2><Icon name="folder" /> {lang === 'ar' ? 'المشاريع والملفات' : 'Projects & files'}</h2></div>
      <div className="proj-current card">
        <label className="insp-field"><span>{lang === 'ar' ? 'اسم المشروع' : 'Project name'}</span><input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== project.name && A.renameProject(name)} /></label>
        <div className="muted">{filePath ?? (lang === 'ar' ? 'لم يُحفظ في ملف بعد (الحفظ التلقائي مفعّل)' : 'Not saved to a file yet (autosave is on)')}</div>
        <div className="muted">{project.parts.length} {lang === 'ar' ? 'مكون' : 'parts'} · {project.wires.length} {lang === 'ar' ? 'سلك' : 'wires'} · {project.code.split('\n').length} {lang === 'ar' ? 'سطر' : 'lines'}</div>
      </div>
      <div className="action-grid">
        <button className="big-act" onClick={() => { A.newProject(); A.go('home'); }}><Icon name="plus" size={26} /><b>{t('newProject')}</b></button>
        <button className="big-act" onClick={() => A.openProject().then(() => A.go('home'))}><Icon name="folder" size={26} /><b>{t('openProject')}</b><small>.asproj</small></button>
        <button className="big-act" onClick={() => A.saveProject()}><Icon name="save" size={26} /><b>{t('saveProject')}</b><small>Ctrl+S</small></button>
        <button className="big-act" onClick={() => A.saveProject(true)}><Icon name="save" size={26} /><b>{t('saveAs')}</b></button>
        <button className="big-act" onClick={A.importIno}><Icon name="upload" size={26} /><b>{t('importIno')}</b><small>.ino</small></button>
        <button className="big-act" onClick={A.exportIno}><Icon name="download" size={26} /><b>{t('exportIno')}</b></button>
        <button className="big-act" onClick={A.exportHex}><Icon name="chip" size={26} /><b>{t('exportHex')}</b><small>Intel HEX</small></button>
        <button className="big-act" onClick={A.exportSpice}><Icon name="schematic" size={26} /><b>{t('exportSpice')}</b><small>.cir</small></button>
        <button className="big-act" onClick={A.importVcdFile}><Icon name="upload" size={26} /><b>{t('importVcd')}</b></button>
        <button className="big-act" onClick={A.exportVcdFile}><Icon name="activity" size={26} /><b>{t('exportVcd')}</b></button>
        <button className="big-act" onClick={A.exportCsvFile}><Icon name="file" size={26} /><b>{t('exportCsv')}</b></button>
        <button className="big-act" onClick={A.exportReport}><Icon name="file" size={26} /><b>{t('exportReport')}</b></button>
      </div>
    </div>
  );
}

export function InstrumentsPage() {
  const lang = useStore((s) => s.lang);
  const snap = useStore((s) => s.snap);
  const project = useStore((s) => s.project);
  const nl = useMemo(() => buildNetlist(project), [project.parts, project.wires]);
  const [a, setA] = useState('5V'); const [b, setB] = useState('GND');
  const nets = nl.nets.filter((n) => !n.pins.every((p) => p.startsWith('bb.'))).map((n) => n.name);
  const va = a === 'GND' ? 0 : snap?.nets[a]; const vb = b === 'GND' ? 0 : snap?.nets[b];
  return (
    <div className="page instruments">
      <div className="page-h"><h2><Icon name="activity" /> {lang === 'ar' ? 'أجهزة القياس' : 'Instruments'}</h2></div>
      <div className="inst-row">
        <div className="card dmm">
          <h3><Icon name="gauge" /> {lang === 'ar' ? 'جهاز قياس متعدد (فولتميتر)' : 'Multimeter (voltmeter)'}</h3>
          <div className="dmm-sel"><label>+ <select value={a} onChange={(e) => setA(e.target.value)}>{nets.map((n) => <option key={n}>{n}</option>)}</select></label><label>− <select value={b} onChange={(e) => setB(e.target.value)}>{nets.map((n) => <option key={n}>{n}</option>)}</select></label></div>
          <div className="dmm-disp" data-testid="dmm">{va !== undefined && vb !== undefined ? (va - vb).toFixed(3) : '----'}<small>V DC</small></div>
          <div className="muted">{lang === 'ar' ? 'القيمة من حل الدائرة الحالي (MNA) أثناء المحاكاة.' : 'Value from the live circuit solution (MNA).'}</div>
        </div>
        <div className="card pins-table">
          <h3><Icon name="chip" /> {lang === 'ar' ? 'حالة المنافذ' : 'Pin states'}</h3>
          <table>
            <thead><tr><th>Pin</th><th>{lang === 'ar' ? 'الوضع' : 'Mode'}</th><th>V</th><th>mA</th><th>PWM</th></tr></thead>
            <tbody>
              {snap ? Object.entries(snap.pins).map(([pin, v]) => (
                <tr key={pin} className={v.mode === 'high' ? 'hi' : ''}><td>{pin}</td><td>{v.mode}</td><td>{v.voltage.toFixed(2)}</td><td>{(v.current * 1000).toFixed(2)}</td><td>{v.pwmDuty !== null && v.pwmDuty > 0.001 && v.pwmDuty < 0.999 ? (v.pwmDuty * 100).toFixed(1) + '%' : ''}</td></tr>
              )) : <tr><td colSpan={5} className="muted">{lang === 'ar' ? 'شغّل المحاكاة' : 'Run the simulation'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card flush inst-tl"><Timeline /></div>
    </div>
  );
}

export function ToolsPage() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const snap = useStore((s) => s.snap);
  const project = useStore((s) => s.project);
  const [pf, setPf] = useState<any>(null);
  const [acc, setAcc] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [spice, setSpice] = useState<any>(null);
  const [st, setSt] = useState<any>(null);
  const load = () => { setPf(null); api('preflight').then(setPf); api('status').then(setSt); };
  useEffect(load, []);
  const runAcc = async () => { setBusy(true); setAcc(null); try { setAcc(await api('acceptance')); } finally { setBusy(false); } };
  const spiceCheck = async () => {
    setSpice({ busy: true });
    const pinStates: Record<string, string> = {};
    if (snap) for (const [pin, v] of Object.entries(snap.pins)) pinStates[pin] = v.mode;
    const built = buildCircuit(project);
    for (const [pin, mode] of Object.entries(pinStates)) { const el = built.mcuPins.get(pin); if (el) setMcuPin(el, mode as any); }
    const internal = built.circuit.solve(0);
    const probes = built.netlist.nets.filter((n) => n.name !== 'GND' && built.netNode[n.id] > 0 && !n.pins.every((p) => p.startsWith('bb.'))).map((n) => n.name).slice(0, 24);
    const r = await api('spice', { project, pinStates, analysis: { type: 'tran', stepS: 1e-5, stopS: 2e-3 }, probes, execute: true });
    if (!r?.ok || !r.data) { setSpice({ error: r?.message ?? 'failed', output: r?.output }); return; }
    const last = r.data.rows[r.data.rows.length - 1];
    const rows = probes.map((name, i) => { const net = built.netlist.nets.find((n) => n.name === name)!; const vi = internal.v[built.netNode[net.id]]; const vs = last[i + 1]; return { name, vi, vs, d: Math.abs(vi - vs) }; });
    setSpice({ rows, ms: r.durationMs, sha: r.netlistSha256 });
  };
  const summary = acc?.summary;
  return (
    <div className="page">
      <div className="page-h"><h2><Icon name="wrench" /> {t('toolsTitle')}</h2><button className="btn sm" onClick={load}><Icon name="refresh" size={14} /> {t('refresh')}</button></div>
      {!hasDesktop() && <div className="warn-box">{lang === 'ar' ? 'هذه الصفحة تتطلب تطبيق سطح المكتب.' : 'This page needs the desktop app.'}</div>}
      <div className="tools-grid">
        <div className="card">
          <h3>{lang === 'ar' ? 'الأدوات المضمّنة' : 'Bundled tools'}</h3>
          <table className="tool-table" data-testid="preflight">
            <tbody>
              {pf ? Object.entries(pf.tools ?? {}).map(([n, v]: any) => (
                <tr key={n}><td><span className={'pill ' + (v.path ? 'ok' : 'bad')}>{v.path ? '✓' : '✗'}</span> {n}</td><td className="muted small">{v.version ?? v.source ?? ''}</td><td className="path small" title={v.path ?? v.error}>{v.path ?? v.error ?? ''}</td></tr>
              )) : <tr><td>…</td></tr>}
              {pf && <tr><td><span className={'pill ' + (pf.arduinoCore?.path ? 'ok' : 'bad')}>{pf.arduinoCore?.path ? '✓' : '✗'}</span> ArduinoCore-avr</td><td /><td className="path small">{pf.arduinoCore?.path}</td></tr>}
            </tbody>
          </table>
          {pf && <div className="ready-row">{Object.entries(pf.ready ?? {}).map(([k, v]) => <span key={k} className={'pill ' + (v ? 'ok' : 'bad')}>{k}</span>)}</div>}
          {st && <div className="muted small">v{st.version} · {st.platform}/{st.arch} · HTTP API {st.httpApiPort ? `127.0.0.1:${st.httpApiPort}` : '—'}</div>}
          <p className="muted small">{pf ? t('tools_note') : null}</p>
        </div>
        <div className="card">
          <h3>{lang === 'ar' ? 'اختبارات القبول (أدلة فعلية)' : 'Acceptance suite (real evidence)'}</h3>
          <p className="muted small">{lang === 'ar' ? 'يبني ويشغّل برامج حقيقية، يقارن avr8js مع simavr، ويقارن محرك الدوائر مع ngspice، ويكتب تقارير JSON.' : 'Builds and runs real sketches, cross-checks avr8js vs simavr and the circuit engine vs ngspice, and writes JSON reports.'}</p>
          <button className="btn primary" onClick={runAcc} disabled={busy} data-testid="run-acceptance"><Icon name={busy ? 'clock' : 'play'} size={16} /> {busy ? '…' : t('runAcceptance')}</button>
          {summary && (
            <div className="acc">
              <div className={'acc-sum ' + summary.status} data-testid="acc-summary">{summary.status === 'pass' ? '✓ PASS' : '✗ FAIL'} · {summary.reports.map((r: any) => `${r.report} ${r.pass}/${r.pass + r.fail + r.skip}`).join(' · ')}</div>
              <ul>{(acc.reports ?? []).flatMap((r: any) => r.checks.map((c: any) => <li key={r.report + c.id} className={c.status}><b>{c.status}</b> [{r.report}] {c.title}<small>{c.detail}</small></li>))}</ul>
              <button className="btn sm" onClick={() => api('openPath', { path: acc.outDir })}><Icon name="folder" size={14} /> {acc.outDir}</button>
            </div>
          )}
        </div>
        <div className="card">
          <h3>{lang === 'ar' ? 'تحقق ngspice للدائرة الحالية' : 'ngspice check of this circuit'}</h3>
          <p className="muted small">{lang === 'ar' ? 'يصدّر الدائرة الحالية بحالة المنافذ الحالية إلى ngspice ويقارن جهود العقد مع المحرك الداخلي.' : 'Exports the current circuit (current pin states) to ngspice and compares node voltages with the internal engine.'}</p>
          <button className="btn" onClick={spiceCheck} data-testid="spice-check"><Icon name="schematic" size={16} /> {lang === 'ar' ? 'تشغيل المقارنة' : 'Run comparison'}</button>
          {spice?.busy && <div className="muted">…</div>}
          {spice?.error && <pre className="build-log">{spice.error}{'\n'}{spice.output}</pre>}
          {spice?.rows && (
            <table className="tool-table" data-testid="spice-table"><thead><tr><th>Net</th><th>MNA</th><th>ngspice</th><th>Δ</th></tr></thead>
              <tbody>{spice.rows.map((r: any) => <tr key={r.name}><td>{r.name}</td><td>{fmtV(r.vi)}</td><td>{fmtV(r.vs)}</td><td className={r.d < 0.01 ? 'okc' : 'badc'}>{(r.d * 1000).toFixed(2)} mV</td></tr>)}</tbody></table>
          )}
        </div>
        <HardwareCard />
      </div>
    </div>
  );
}

function HardwareCard() {
  const lang = useStore((s) => s.lang);
  const [ports, setPorts] = useState<any[] | null>(null);
  const [msg, setMsg] = useState('');
  const scan = async () => { const r = await api('boards'); setPorts(r?.ports ?? []); setMsg(r?.message ?? ''); };
  return (
    <div className="card">
      <h3><Icon name="usb" /> {lang === 'ar' ? 'اللوحات الحقيقية المتصلة' : 'Connected boards'}</h3>
      <button className="btn sm" onClick={scan}><Icon name="refresh" size={14} /> {lang === 'ar' ? 'فحص المنافذ' : 'Scan ports'}</button>
      {ports && (ports.length ? <ul className="ports">{ports.map((p) => <li key={p.path}><b>{p.path}</b> {p.board ?? p.manufacturer ?? ''}</li>)}</ul> : <div className="muted">{lang === 'ar' ? 'لا توجد لوحات متصلة' : 'No boards found'}</div>)}
      {msg && <div className="muted small">{msg}</div>}
      <button className="btn sm" onClick={() => setState({ modal: 'upload' })}><Icon name="upload" size={14} /> {lang === 'ar' ? 'رفع البرنامج…' : 'Upload…'}</button>
    </div>
  );
}

export function UploadModal() {
  const lang = useStore((s) => s.lang);
  const code = useStore((s) => s.project.code);
  const [ports, setPorts] = useState<any[]>([]);
  const [port, setPort] = useState('');
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('boards').then((r) => { setPorts(r?.ports ?? []); setPort(r?.ports?.find((p: any) => p.board)?.path ?? r?.ports?.[0]?.path ?? ''); }); }, []);
  return (
    <div className="modal-bg" onClick={() => setState({ modal: null })}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><b><Icon name="usb" /> {lang === 'ar' ? 'رفع البرنامج إلى لوحة Arduino Uno حقيقية' : 'Upload to a real Arduino Uno'}</b><button className="icon-btn sm" onClick={() => setState({ modal: null })}><Icon name="x" /></button></div>
        <p className="muted">{lang === 'ar' ? 'سيُبنى البرنامج ثم يُرفع عبر avrdude (115200 baud). سيطلب التطبيق تأكيدك قبل الكتابة على اللوحة.' : 'The sketch is built and flashed with avrdude (115200 baud). You will be asked to confirm before anything is written.'}</p>
        <label className="insp-field"><span>{lang === 'ar' ? 'المنفذ' : 'Port'}</span>
          <select value={port} onChange={(e) => setPort(e.target.value)}>{ports.map((p) => <option key={p.path} value={p.path}>{p.path} {p.board ?? p.manufacturer ?? ''}</option>)}{!ports.length && <option value="">—</option>}</select>
        </label>
        <div className="modal-a">
          <button className="btn primary" disabled={!port || busy} onClick={async () => { setBusy(true); setRes(null); try { setRes(await upload({ port, code })); } finally { setBusy(false); } }}><Icon name="upload" size={16} /> {busy ? '…' : lang === 'ar' ? 'رفع' : 'Upload'}</button>
        </div>
        {res && <div className={res.ok ? 'ok' : 'bad'}>{res.message}</div>}
        {res?.log && <pre className="build-log">{res.log.slice(-3000)}</pre>}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const lang = useStore((s) => s.lang);
  const theme = useStore((s) => s.theme);
  const speed = useStore((s) => s.speed);
  const [settings, setSettings] = useState<any>({});
  useEffect(() => { api('getSettings').then((s) => setSettings(s ?? {})); }, []);
  const save = (patch: any) => api('setSettings', patch).then(setSettings);
  return (
    <div className="page">
      <div className="page-h"><h2><Icon name="settings" /> {lang === 'ar' ? 'الإعدادات' : 'Settings'}</h2></div>
      <div className="settings card">
        <label className="insp-field"><span>{lang === 'ar' ? 'اللغة' : 'Language'}</span><select value={lang} onChange={(e) => { localStorage.setItem('asp-lang', e.target.value); setState({ lang: e.target.value as any }); }}><option value="ar">العربية</option><option value="en">English</option></select></label>
        <label className="insp-field"><span>{lang === 'ar' ? 'المظهر' : 'Theme'}</span><select value={theme} onChange={(e) => { localStorage.setItem('asp-theme', e.target.value); setState({ theme: e.target.value as any }); save({ theme: e.target.value }); }}><option value="dark">{lang === 'ar' ? 'داكن' : 'Dark'}</option><option value="light">{lang === 'ar' ? 'فاتح' : 'Light'}</option></select></label>
        <label className="insp-field"><span>{lang === 'ar' ? 'سرعة المحاكاة' : 'Simulation speed'}</span><select value={speed} onChange={(e) => A.setSpeed(Number(e.target.value))}>{[0.1, 0.25, 0.5, 1, 2, 4].map((x) => <option key={x} value={x}>×{x}</option>)}</select></label>
        <label className="insp-field"><span>{lang === 'ar' ? 'واجهة HTTP المحلية (127.0.0.1)' : 'Local HTTP API (127.0.0.1)'}</span><select value={settings.httpApi === false ? 'off' : 'on'} onChange={(e) => save({ httpApi: e.target.value === 'on' })}><option value="on">{lang === 'ar' ? 'مفعّلة' : 'On'}</option><option value="off">{lang === 'ar' ? 'معطّلة (بعد إعادة التشغيل)' : 'Off (after restart)'}</option></select></label>
      </div>
      <div className="card about">
        <h3>Arduino Simulator Pro 1.0</h3>
        <p className="muted">{lang === 'ar' ? 'محرك المعالج: avr8js (تنفيذ تعليمات ATmega328P الحقيقية). محرك الدوائر: تحليل العقد المعدّل (MNA) مع نيوتن-رافسون وأويلر الخلفي. المترجم: avr-gcc 14 + ArduinoCore-avr 1.8.6. التحقق المتقاطع: ngspice وsimavr.' : 'CPU: avr8js (ATmega328P instruction-accurate). Circuit: MNA + Newton-Raphson + backward Euler. Compiler: avr-gcc 14 + ArduinoCore-avr 1.8.6. Cross-checks: ngspice, simavr.'}</p>
        <p className="muted small">{lang === 'ar' ? 'Arduino علامة تجارية لأصحابها؛ هذا البرنامج مستقل وغير تابع لهم.' : 'Arduino is a trademark of its owners; this program is independent and not affiliated.'}</p>
      </div>
    </div>
  );
}

export function HelpModal() {
  const lang = useStore((s) => s.lang);
  const ar = lang === 'ar';
  const keys: [string, string][] = [
    ['Ctrl+R', ar ? 'بناء وتشغيل' : 'Build & run'], ['Ctrl+B', ar ? 'بناء فقط' : 'Build only'], ['Ctrl+S', ar ? 'حفظ المشروع' : 'Save project'],
    ['Ctrl+Z / Ctrl+Y', ar ? 'تراجع / إعادة' : 'Undo / redo'], ['R', ar ? 'تدوير المكون المحدد' : 'Rotate selected part'], ['Del', ar ? 'حذف المحدد' : 'Delete selection'],
    ['Ctrl+D', ar ? 'تكرار المكون' : 'Duplicate part'], ['Esc', ar ? 'إلغاء التوصيل' : 'Cancel wiring'], [ar ? 'عجلة الفأرة' : 'Wheel', ar ? 'تكبير/تصغير، أو تدوير المقاومة المتغيرة' : 'Zoom, or turn a potentiometer'],
  ];
  return (
    <div className="modal-bg" onClick={() => setState({ modal: null })}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><b><Icon name="help" /> {ar ? 'مساعدة سريعة' : 'Quick help'}</b><button className="icon-btn sm" onClick={() => setState({ modal: null })}><Icon name="x" /></button></div>
        <ol className="help-steps">
          <li>{ar ? 'اختر مشروعاً جاهزاً أو اسحب المكونات إلى لوحة التجارب.' : 'Pick a ready project or drag parts onto the breadboard.'}</li>
          <li>{ar ? 'وصّل الأسلاك بالنقر على طرف ثم طرف آخر. الأطراف الموضوعة على ثقوب لوحة التجارب تتصل تلقائياً.' : 'Wire by clicking one pin then another. Pins placed in breadboard holes connect automatically.'}</li>
          <li>{ar ? 'اكتب البرنامج ثم اضغط «تشغيل المحاكاة»: يُبنى بـ avr-gcc ويُنفَّذ على معالج ATmega328P محاكى مرتبط بحل الدائرة الكهربائية.' : 'Write the sketch and press Run: it is built with avr-gcc and executed on a simulated ATmega328P coupled to the circuit solver.'}</li>
          <li>{ar ? 'أثناء التشغيل: اضغط الأزرار، أدر المقاومات المتغيرة، وغيّر قيم الحساسات من لوحة الخصائص.' : 'While running: press buttons, turn pots and change sensor values from the inspector.'}</li>
        </ol>
        <table className="keys"><tbody>{keys.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

export { SerialMonitor, PART_MAP };
