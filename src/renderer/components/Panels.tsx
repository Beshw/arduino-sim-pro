/** Workspace panels following the reference design (top bar, rails, editor, serial, results…). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, setState, getState, Page } from '../store';
import * as A from '../actions';
import { tr, Key } from '../i18n';
import { Icon, Logo } from './Icons';
import { PartIcon } from './PartGraphics';
import { EXAMPLES } from '../../shared/examples';
import { PART_MAP, PWM_PINS } from '../../shared/parts/catalog';
import { checkTopology } from '../../shared/circuit/netlist';
import CodeEditor, { revealLine } from './CodeEditor';
import { valueText } from '../views/Schematic';

export const useT = () => { const lang = useStore((s) => s.lang); return (k: Key) => tr(lang, k); };

// ------------------------------------------------------------------ top bar
export function TopBar() {
  const t = useT();
  const simState = useStore((s) => s.simState);
  const theme = useStore((s) => s.theme);
  const lang = useStore((s) => s.lang);
  const rt = useStore((s) => s.rt);
  const stale = useStore((s) => s.circuitStale);
  const running = simState === 'running', paused = simState === 'paused';
  const stLabel: Record<string, Key> = { idle: 'st_ready', running: 'st_running', paused: 'st_paused', compiling: 'st_compiling', error: 'st_error' };
  return (
    <header className="topbar">
      <div className="tb-brand">
        <button className="icon-btn ghost" onClick={() => setState((s) => ({ page: s.page === 'home' ? 'projects' : 'home' }))} title="Menu"><Icon name="menu" size={22} /></button>
        <Logo size={34} />
        <div className="tb-title">
          <div className="tb-name">Arduino Simulator Pro <span className="ver">v1.2</span></div>
          <div className="tb-sub">{t('appSub')}</div>
        </div>
      </div>
      <div className="tb-actions">
        <button className="btn run" data-testid="btn-run" onClick={() => A.runSimulation()} disabled={simState === 'compiling' || running}>
          <Icon name="play" /> {simState === 'compiling' ? t('compiling') : t('run')}
        </button>
        <button className="btn dark" data-testid="btn-pause" onClick={A.pauseSimulation} disabled={!running && !paused}><Icon name={paused ? 'play' : 'pause'} /> {paused ? t('resume') : t('pause')}</button>
        <button className="btn dark" data-testid="btn-stop" onClick={A.stopSimulation} disabled={!running && !paused}><Icon name="stop" /> {t('stop')}</button>
        <div className={'sim-status ' + simState} data-testid="sim-status">
          <span className="led" />
          <span>{t('status')}: <b>{t(stLabel[simState])}</b>{running && rt ? <span className="rt"> · ×{rt.toFixed(2)}</span> : null}{stale ? ' ⟳' : ''}</span>
        </div>
      </div>
      <div className="tb-tools">
        <button className="icon-btn" title={t('theme')} onClick={() => { const th = theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('asp-theme', th); setState({ theme: th }); }}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <button className="icon-btn" title={t('language')} onClick={() => { const l = lang === 'ar' ? 'en' : 'ar'; localStorage.setItem('asp-lang', l); setState({ lang: l }); }}><span className="lang-chip">{lang === 'ar' ? 'EN' : 'ع'}</span></button>
        <button className="icon-btn" title={t('help')} onClick={() => setState({ modal: 'help' })}><Icon name="help" /></button>
        <button className="icon-btn" title={t('settings')} onClick={() => A.go('settings')}><Icon name="settings" /></button>
      </div>
      <div className="tb-drag-spacer" />
    </header>
  );
}

// ------------------------------------------------------------------ nav rail
const NAV: [Page, string, Key][] = [
  ['home', 'home', 'nav_home'], ['editor', 'code', 'nav_editor'], ['circuit', 'chip', 'nav_circuit'], ['parts', 'cube', 'nav_parts'],
  ['library', 'layers', 'nav_library'], ['lessons', 'cap', 'nav_lessons'], ['projects', 'folder', 'nav_projects'],
  ['instruments', 'activity', 'nav_instruments'], ['tools', 'wrench', 'nav_tools'], ['settings', 'settings', 'nav_settings'],
];
export function NavRail() {
  const t = useT();
  const page = useStore((s) => s.page);
  return (
    <nav className="navrail">
      {NAV.map(([p, ic, k]) => (
        <button key={p} className={'nav-item' + (page === p ? ' on' : '')} onClick={() => A.go(p)} data-testid={'nav-' + p}>
          <Icon name={ic} size={22} /><span>{t(k)}</span>
        </button>
      ))}
    </nav>
  );
}

// ------------------------------------------------------------------ left sidebar
export const QUICK = ['led', 'resistor', 'button', 'buzzer', 'dht11', 'lcd1602', 'servo', 'dc_motor', 'potentiometer'];
export function PaletteItem({ type, label }: { type: string; label?: string }) {
  const lang = useStore((s) => s.lang);
  const def = PART_MAP[type];
  return (
    <button className="pal-item" draggable title={def.description?.[lang] ?? def.name[lang]}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-asp-part', type); e.dataTransfer.effectAllowed = 'copy'; }}
      onClick={() => { const id = A.addPart(type, 380 + Math.random() * 200, -40 + Math.random() * 30); if (id) A.toast(`${def.name[lang]} ✓`, 'ok'); }}
      data-testid={'pal-' + type}>
      <PartIcon type={type} size={36} />
      <span>{label ?? def.name[lang]}</span>
    </button>
  );
}
export function Sidebar() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const name = useStore((s) => s.project.name);
  return (
    <aside className="sidebar">
      <section className="card">
        <h3>{t('chooseBoard')}</h3>
        <div className="board-pick">
          <div className="board-badge"><span>UNO</span></div>
          <div><b>Arduino Uno</b><small>ATmega328P · 16 MHz</small></div>
        </div>
      </section>
      <section className="card">
        <h3>{t('quickParts')}</h3>
        <div className="pal-grid">
          {QUICK.slice(0, 8).map((q) => <PaletteItem key={q} type={q} />)}
          <button className="pal-item more" onClick={() => A.go('parts')}><span className="dots">···</span><span>{t('more')}</span></button>
        </div>
      </section>
      <section className="card grow">
        <h3>{t('readyProjects')}</h3>
        <div className="proj-list">
          {EXAMPLES.map((ex) => (
            <button key={ex.id} className={'proj-item' + (ex.project().name === name ? ' on' : '')} onClick={() => A.loadExample(ex.id)} title={ex.description[lang]} data-testid={'ex-' + ex.id}>
              <Icon name="folder" size={16} /><span>{ex.title[lang]}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

// ------------------------------------------------------------------ editor panel
export function EditorPanel({ wide = false }: { wide?: boolean }) {
  const t = useT();
  const compile = useStore((s) => s.compile);
  const code = useStore((s) => s.project.code);
  const dirty = useStore((s) => s.dirty);
  const filePath = useStore((s) => s.filePath);
  const name = useStore((s) => s.project.name);
  const [showLog, setShowLog] = useState(false);
  const fresh = compile && compile.code === code;
  const pct = compile?.size ? Math.round((compile.size.flash / compile.size.flashMax) * 100) : 0;
  const errs = fresh ? compile!.diagnostics : [];
  return (
    <section className={'editor-panel card flush' + (wide ? ' wide' : '')}>
      <div className="panel-head">
        <span className="file-tab" title={name}><Icon name="file" size={14} /> <bdi className="fname">{(name || 'sketch').replace(/\s+/g, '_').slice(0, 28)}.ino</bdi></span>
        <span className="grow" />
        <span className={'save-state' + (dirty ? ' dirty' : '')}><span className="led" />{dirty ? t('unsaved') : t('saved')}</span>
        <button className="icon-btn sm" title={t('saveProject')} onClick={() => A.saveProject()}><Icon name="save" size={15} /></button>
        <button className="icon-btn sm" title="Build (Ctrl+B)" onClick={() => A.build()}><Icon name="check" size={15} /></button>
      </div>
      <div className="editor-body"><CodeEditor /></div>
      {errs.length > 0 && (
        <div className="diag-list" data-testid="diagnostics">
          {errs.slice(0, 30).map((d, i) => (
            <button key={i} className={'diag ' + d.severity} onClick={() => revealLine(d.line)}>
              <Icon name={d.severity === 'error' ? 'x' : 'alert'} size={13} /> <b>{d.line}:{d.column}</b> {d.message}
            </button>
          ))}
        </div>
      )}
      {wide && showLog && compile?.log && <pre className="build-log">{compile.log.slice(-6000)}</pre>}
      <div className="panel-foot">
        {fresh ? (
          compile!.ok ? <span className="ok" data-testid="build-ok"><Icon name="checkCircle" size={16} /> {t('buildOk')}</span>
            : <span className="bad" data-testid="build-fail"><Icon name="x" size={16} /> {t('buildFail')}</span>
        ) : <span className="muted">{t('notBuilt')}</span>}
        <span className="grow" />
        {fresh && compile!.size && <span className="muted" title={`RAM ${compile!.size.ram}/${compile!.size.ramMax}`}>{t('programSize')}: {compile!.size.flash.toLocaleString()} B ({pct}% {t('ofMemory')})</span>}
        {wide && <button className="btn sm" onClick={() => setShowLog(!showLog)}>log</button>}
      </div>
      {filePath && <div className="file-path" title={filePath}>{filePath}</div>}
    </section>
  );
}

// ------------------------------------------------------------------ metric cards
interface Card { icon: string; title: string; value: string; unit?: string; sub: string; pct?: number; color: string; testid?: string }
export function useCards(): Card[] {
  const lang = useStore((s) => s.lang);
  const project = useStore((s) => s.project);
  const snap = useStore((s) => s.snap);
  const ar = lang === 'ar';
  const cards: Card[] = [];
  const pinOf = (partId: string, pins: string[]) => {
    for (const w of project.wires) for (const pin of pins) {
      const a = `${partId}.${pin}`;
      if (w.from === a && w.to.startsWith('uno.')) return w.to.slice(4);
      if (w.to === a && w.from.startsWith('uno.')) return w.from.slice(4);
    }
    return null;
  };
  for (const part of project.parts) {
    const live: any = snap?.parts[part.id];
    switch (part.type) {
      case 'led': {
        const i = Number(live?.avg?.current_anode ?? live?.current_anode ?? 0);
        const pct = Math.max(0, Math.min(100, (i / 0.0123) * 100));
        cards.push({ icon: 'bulb', title: ar ? `سطوع ${part.id}` : `${part.id} brightness`, value: snap ? Math.round(pct * 2.55).toString() : '—', unit: '/255', sub: snap ? `${(i * 1000).toFixed(1)} mA` : '—', pct, color: '#ffb000', testid: 'card-' + part.id });
        break;
      }
      case 'button': {
        const pr = Number(part.props.pressed) > 0.5;
        cards.push({ icon: 'hand', title: ar ? 'حالة الزر' : 'Button state', value: pr ? (ar ? 'مضغوط' : 'Pressed') : (ar ? 'محرر' : 'Released'), sub: pr ? '(PRESSED)' : '(RELEASED)', color: '#2f9bff', testid: 'card-' + part.id });
        break;
      }
      case 'potentiometer': {
        const pin = pinOf(part.id, ['wiper']);
        const v = pin && snap ? snap.pins[pin]?.voltage ?? 0 : Number(live?.wiperVoltage ?? 0);
        const adc = Math.round(Math.max(0, Math.min(1023, (v / 5) * 1023)));
        cards.push({ icon: 'gauge', title: ar ? 'قراءة المقاومة المتغيرة' : 'Potentiometer', value: snap ? String(adc) : '—', unit: '/1023', sub: snap ? `${v.toFixed(2)} V · ${pin ?? ''}` : `${Math.round(Number(part.props.position) * 100)}%`, pct: snap ? (adc / 1023) * 100 : Number(part.props.position) * 100, color: '#2fd36b', testid: 'card-' + part.id });
        break;
      }
      case 'buzzer': {
        const f = Number(live?.frequency ?? 0);
        cards.push({ icon: 'music', title: ar ? 'تردد الطنان' : 'Buzzer frequency', value: snap ? Math.round(f).toString() : '—', unit: 'Hz', sub: f > 0 ? (ar ? 'قيد التشغيل' : 'Playing') : (ar ? 'صامت' : 'Silent'), pct: Math.min(100, f / 25), color: '#a46bff', testid: 'card-' + part.id });
        break;
      }
      case 'servo': cards.push({ icon: 'rotate', title: ar ? `زاوية ${part.id}` : `${part.id} angle`, value: live ? Math.round(Number(live.angle)).toString() : '—', unit: '°', sub: live?.pulseUs ? `${Math.round(live.pulseUs)} µs` : '—', pct: live ? Number(live.angle) / 1.8 : 0, color: '#17c3d6' }); break;
      case 'dht11': cards.push({ icon: 'thermo', title: 'DHT11', value: `${part.props.temperature}°C`, sub: `${part.props.humidity}% RH · ${live?.responses ?? 0} ${ar ? 'قراءة' : 'reads'}`, color: '#ff7a00' }); break;
      case 'hcsr04': cards.push({ icon: 'wave', title: ar ? 'المسافة' : 'Distance', value: String(part.props.distance), unit: 'cm', sub: `${live?.pings ?? 0} ping`, color: '#17c3d6' }); break;
      case 'dc_motor': cards.push({ icon: 'refresh', title: ar ? 'سرعة المحرك' : 'Motor speed', value: live ? Math.round(Number(live.rpm)).toString() : '—', unit: 'rpm', sub: live ? `${Number(live.voltage).toFixed(2)} V` : '—', pct: live ? Math.min(100, Math.abs(Number(live.rpm)) / 60) : 0, color: '#ff7a00' }); break;
      case 'lcd1602': case 'lcd1602_i2c': cards.push({ icon: 'grid', title: 'LCD 16x2', value: live?.displayOn ? (live.lines?.[0] ?? '').trim().slice(0, 10) || '…' : (ar ? 'مطفأة' : 'Off'), sub: live?.displayOn ? (live.lines?.[1] ?? '').trim().slice(0, 16) : '', color: '#2fd36b' }); break;
      case 'stepper': cards.push({ icon: 'refresh', title: ar ? 'زاوية المحرك الخطوي' : 'Stepper angle', value: live ? (((Number(live.angle) % 360) + 360) % 360).toFixed(1) : '—', unit: '°', sub: live ? `${Math.round(Number(live.steps))} ${ar ? 'خطوة' : 'steps'}` : '—', pct: live ? ((((Number(live.angle) % 360) + 360) % 360) / 360) * 100 : 0, color: '#ffb000' }); break;
      case 'ldr': case 'ntc': case 'tmp36': case 'fsr': {
        const pin = pinOf(part.id, ['a', 'b', 'vout']);
        const v = pin && snap ? snap.pins[pin]?.voltage ?? 0 : 0;
        cards.push({ icon: part.type === 'ldr' ? 'sun' : 'thermo', title: PART_MAP[part.type].name[lang], value: snap && pin ? String(Math.round((v / 5) * 1023)) : '—', unit: '/1023', sub: part.type === 'ldr' ? `${part.props.lux} lux` : part.type === 'fsr' ? `${part.props.force} g` : `${part.props.temperature} °C`, pct: (v / 5) * 100, color: '#ffd21f' });
        break;
      }
    }
  }
  if (cards.length < 4 && snap) {
    cards.push({ icon: 'bolt', title: ar ? 'تيار التغذية 5V' : '5V supply current', value: (snap.supplyCurrent * 1000).toFixed(1), unit: 'mA', sub: 'USB ≤ 500 mA', pct: Math.min(100, (snap.supplyCurrent / 0.5) * 100), color: '#ff5a5a' });
  }
  return cards.slice(0, 4);
}
export function MetricCards() {
  const cards = useCards();
  if (!cards.length) return null;
  return (
    <div className="metrics">
      {cards.map((c, i) => (
        <div key={i} className="metric" style={{ ['--c' as any]: c.color }} data-testid={c.testid}>
          <div className="m-head"><Icon name={c.icon} size={20} /><span>{c.title}</span></div>
          <div className={'m-val' + (typeof c.value === 'string' && !/^[-\d.]/.test(c.value) ? ' txt' : '')} title={String(c.value)}><b>{c.value}</b>{c.unit && <small>{c.unit}</small>}</div>
          {c.pct !== undefined && <div className="m-bar"><i style={{ width: `${Math.max(0, Math.min(100, c.pct))}%` }} /></div>}
          <div className="m-sub">{c.pct !== undefined && c.sub === '' ? `${c.pct.toFixed(1)}%` : c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ serial monitor
export function SerialMonitor({ tall = false }: { tall?: boolean }) {
  const t = useT();
  const serial = useStore((s) => s.serial);
  const partial = useStore((s) => s.serialPartial);
  const baud = useStore((s) => s.baud);
  const ts = useStore((s) => s.showTimestamps);
  const source = useStore((s) => s.serialSource);
  const lang = useStore((s) => s.lang);
  const [ports, setPorts] = useState<{ path: string; board: string | null }[]>([]);
  const refreshPorts = () => { import('../bridge').then(({ api }) => api('boards')).then((r: any) => setPorts((r?.ports ?? []).map((p: any) => ({ path: p.path, board: p.board })))).catch(() => setPorts([])); };
  const [auto, setAuto] = useState(true);
  const [input, setInput] = useState('');
  const [ending, setEnding] = useState('\n');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (auto && box.current) box.current.scrollTop = box.current.scrollHeight; }, [serial, partial, auto]);
  return (
    <section className={'card flush serial' + (tall ? ' tall' : '')}>
      <div className="panel-head">
        <Icon name="serial" size={16} className="accent" /><b>{t('serial')}</b>
        <span className="grow" />
        <select value={source} onFocus={refreshPorts} onMouseDown={refreshPorts} onChange={(e) => A.connectHardwareSerial(e.target.value)} title={lang === 'ar' ? 'المصدر' : 'Source'} data-testid="serial-source" className={source !== 'sim' ? 'live-src' : ''}>
          <option value="sim">{lang === 'ar' ? 'اللوحة الافتراضية' : 'Virtual board'}</option>
          {ports.map((p) => <option key={p.path} value={p.path}>{p.path}{p.board ? ` (${p.board})` : ''}</option>)}
          {source !== 'sim' && !ports.some((p) => p.path === source) && <option value={source}>{source}</option>}
        </select>
        <select value={baud} onChange={(e) => { setState({ baud: Number(e.target.value) }); if (getState().serialSource !== 'sim') A.connectHardwareSerial(getState().serialSource); }} title="baud">
          {[300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => <option key={b} value={b}>{b} baud</option>)}
        </select>
        <button className="btn sm icon-only" onClick={A.clearSerial} title={t('clear')} aria-label={t('clear')}><Icon name="trash" size={14} /></button>
      </div>
      <div className="serial-out" ref={box} data-testid="serial-out">
        {serial.map((l, i) => (
          <div key={i} className={'sl ' + l.dir}>{ts && <span className="ts">{l.t}</span>}<span className="tx">{l.dir === 'tx' ? '→ ' : ''}{colorize(l.text)}</span></div>
        ))}
        {partial && <div className="sl rx">{ts && <span className="ts">…</span>}<span className="tx">{partial}</span></div>}
      </div>
      <div className="serial-in">
        <label className="chk"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {t('autoscroll')}</label>
        <label className="chk"><input type="checkbox" checked={ts} onChange={(e) => setState({ showTimestamps: e.target.checked })} /> {t('timestamps')}</label>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { A.serialSend(input, ending); setInput(''); } }} placeholder="…" data-testid="serial-input" />
        <select value={ending} onChange={(e) => setEnding(e.target.value)} title="line ending"><option value={'\n'}>LF</option><option value={'\r\n'}>CRLF</option><option value="">—</option></select>
        <button className="btn sm primary" onClick={() => { A.serialSend(input, ending); setInput(''); }}><Icon name="send" size={14} /> {t('send')}</button>
      </div>
    </section>
  );
}
function colorize(s: string) {
  // highlight KEY:VALUE pairs like the reference design
  const parts = s.split(/([A-Za-z_]+:)(-?[\d.]+|[A-Z]+)/g);
  if (parts.length < 3) return s;
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 1) out.push(<span key={i} className="k">{parts[i]}</span>);
    else if (i % 3 === 2) out.push(<span key={i} className="v">{parts[i]}</span>);
    else if (parts[i]) out.push(parts[i]);
  }
  return out;
}

// ------------------------------------------------------------------ results summary
export function ResultsPanel() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const ar = lang === 'ar';
  const project = useStore((s) => s.project);
  const snap = useStore((s) => s.snap);
  const compile = useStore((s) => s.compile);
  const rt = useStore((s) => s.rt);
  const simState = useStore((s) => s.simState);
  const serial = useStore((s) => s.serial.length);
  const topo = useMemo(() => { try { return checkTopology(project); } catch { return []; } }, [project.parts, project.wires]);
  const issues = snap ? snap.issues : topo;
  const fresh = compile && compile.code === project.code;
  type Row = { ok: boolean | null; text: string; level?: 'error' | 'warning' | 'info' };
  const rows: Row[] = [];
  rows.push({ ok: fresh ? compile!.ok : null, text: fresh ? (compile!.ok ? (ar ? `تم بناء البرنامج بنجاح (${compile!.size?.flash ?? 0} بايت)` : `Sketch built (${compile!.size?.flash ?? 0} bytes)`) : (ar ? 'فشل بناء البرنامج — راجع رسائل المترجم' : 'Build failed — see compiler messages')) : (ar ? 'البرنامج لم يُبنَ بعد' : 'Sketch not built yet') });
  const errs = issues.filter((i) => i.severity === 'error');
  rows.push({ ok: errs.length === 0, text: errs.length === 0 ? (ar ? 'الدائرة سليمة: لا قصر ولا تعارض في المصادر' : 'Circuit is sound: no shorts or source conflicts') : (ar ? `توجد ${errs.length} مشكلة في الدائرة` : `${errs.length} circuit problem(s)`) });
  if (simState === 'running' || simState === 'paused') rows.push({ ok: rt >= 0.9 || simState === 'paused', text: ar ? `المحاكاة تعمل (×${rt.toFixed(2)} من الزمن الحقيقي، ${snap?.timeS.toFixed(1) ?? 0} ث)` : `Simulating at ×${rt.toFixed(2)} real time (${snap?.timeS.toFixed(1) ?? 0} s)` });
  if (snap) {
    for (const p of project.parts) {
      const o: any = snap.parts[p.id];
      if (p.type === 'led' && o) { const i = Number(o.avg?.current_anode ?? o.current_anode ?? 0); rows.push({ ok: i <= 0.03, text: ar ? `${p.id}: تيار ${(i * 1000).toFixed(1)}mA ${i > 0.0005 ? (i <= 0.03 ? 'ضمن الحد الآمن' : 'مرتفع!') : '(مطفأ)'}` : `${p.id}: ${(i * 1000).toFixed(1)} mA ${i > 0.0005 ? (i <= 0.03 ? 'within safe limit' : 'too high!') : '(off)'}` }); }
      if (p.type === 'buzzer' && o && Number(o.frequency) > 0) rows.push({ ok: true, text: ar ? `${p.id}: توليد نغمة ${Math.round(o.frequency)} Hz` : `${p.id}: tone ${Math.round(o.frequency)} Hz` });
      if ((p.type === 'lcd1602' || p.type === 'lcd1602_i2c') && o) rows.push({ ok: !!o.displayOn, text: o.displayOn ? (ar ? `الشاشة تعرض: "${(o.lines?.[0] ?? '').trim()}"` : `LCD shows "${(o.lines?.[0] ?? '').trim()}"`) : (ar ? 'الشاشة غير مهيأة بعد' : 'LCD not initialised yet') });
      if (p.type === 'lcd1602_i2c' && o && !o.connected) rows.push({ ok: false, text: ar ? `${p.id}: صِل SDA بالمنفذ A4 وSCL بالمنفذ A5، وإلا لن ترد الشاشة على ناقل I2C` : `${p.id}: wire SDA to A4 and SCL to A5, otherwise the LCD will not answer on the I2C bus` });
      if (p.type === 'hc595' && o?.powered) rows.push({ ok: true, text: ar ? `${p.id}: المخارج Q7..Q0 = ${o.hex}${o.spiBytes ? ` (استقبل ${o.spiBytes} بايت SPI)` : ''}` : `${p.id}: outputs Q7..Q0 = ${o.hex}${o.spiBytes ? ` (${o.spiBytes} SPI bytes)` : ''}` });
      if (p.type === 'servo' && o?.active) rows.push({ ok: true, text: ar ? `${p.id}: الزاوية ${Math.round(o.angle)}°` : `${p.id}: ${Math.round(o.angle)}°` });
      if (p.type === 'dht11' && o) rows.push({ ok: Number(o.responses) > 0, text: ar ? `DHT11 استجاب ${o.responses} مرة` : `DHT11 answered ${o.responses} times` });
    }
    const pwm = Object.entries(snap.pins).filter(([pin, v]) => PWM_PINS.includes(pin) && v.pwmDuty !== null && v.pwmDuty > 0.001 && v.pwmDuty < 0.999);
    for (const [pin, v] of pwm.slice(0, 2)) rows.push({ ok: true, text: ar ? `PWM على ${pin}: دورة عمل ${(v.pwmDuty! * 100).toFixed(1)}%` : `PWM on ${pin}: ${(v.pwmDuty! * 100).toFixed(1)}% duty` });
    if (serial) rows.push({ ok: true, text: ar ? `استقبال بيانات Serial (${serial} سطر)` : `Serial data received (${serial} lines)` });
  }
  return (
    <section className="card results" data-testid="results">
      <div className="panel-head plain"><Icon name="trophy" size={18} className="gold" /><b>{t('results')}</b></div>
      <ul className="checks">
        {rows.map((r, i) => <li key={i} className={r.ok === null ? 'na' : r.ok ? 'ok' : 'bad'}><Icon name={r.ok === null ? 'clock' : r.ok ? 'checkCircle' : 'x'} size={16} />{r.text}</li>)}
        {issues.map((is, i) => (
          <li key={'i' + i} className={is.severity === 'error' ? 'bad' : is.severity === 'warning' ? 'warn' : 'na'} data-testid="issue">
            <Icon name={is.severity === 'info' ? 'info' : 'alert'} size={16} />{is.message[lang]}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ export panel (replaces social share links)
export function ExportPanel() {
  const t = useT();
  const compile = useStore((s) => s.compile);
  return (
    <section className="card exportp">
      <div className="panel-head plain"><Icon name="share" size={18} className="accent" /><b>{t('exportShare')}</b><span className="grow" /><span className="ok small"><Icon name="checkCircle" size={14} /> {t('exportReady')}</span></div>
      <div className="exp-grid">
        <button className="btn exp blue" onClick={() => A.saveProject()}><Icon name="save" size={16} /> .asproj</button>
        <button className="btn exp" onClick={A.exportIno}><Icon name="code" size={16} /> .ino</button>
        <button className="btn exp" onClick={A.exportHex}><Icon name="chip" size={16} /> .hex</button>
        <button className="btn exp" onClick={A.exportSpice}><Icon name="schematic" size={16} /> SPICE</button>
        <button className="btn exp" onClick={A.exportVcdFile}><Icon name="activity" size={16} /> VCD</button>
        <button className="btn exp orange" onClick={A.exportReport}><Icon name="file" size={16} /> JSON</button>
      </div>
      <button className="btn exp wide" onClick={() => setState({ modal: 'upload' })} disabled={!compile}><Icon name="usb" size={16} /> {t('upload')}</button>
    </section>
  );
}

// ------------------------------------------------------------------ status bar
export function StatusBar() {
  const t = useT();
  const snap = useStore((s) => s.snap);
  const speed = useStore((s) => s.speed);
  const project = useStore((s) => s.project);
  const analogPin = useMemo(() => { for (const w of project.wires) for (const ep of [w.from, w.to]) { const m = /^uno\.(A\d)$/.exec(ep); if (m) return m[1]; } return 'A0'; }, [project.wires]);
  const v = snap?.pins[analogPin]?.voltage ?? 0;
  const tm = snap?.timeS ?? 0;
  const hh = Math.floor(tm / 3600), mm = Math.floor((tm % 3600) / 60), ss = Math.floor(tm % 60), ms = Math.floor((tm % 1) * 1000);
  return (
    <footer className="statusbar" data-testid="statusbar">
      <span><Icon name="chip" size={16} /> {t('board')}: <b>Arduino Uno</b></span>
      <span><Icon name="usb" size={16} /> {t('port')}: <b>{t('noPort')}</b></span>
      <span><Icon name="activity" size={16} /> {t('analog')} ({analogPin}): <b data-testid="status-analog">{snap ? Math.round((v / 5) * 1023) : '—'}</b></span>
      <span className="grow" />
      <span><Icon name="speed" size={16} /> {t('speed')}:
        <select value={speed} onChange={(e) => A.setSpeed(Number(e.target.value))}>{[0.1, 0.25, 0.5, 1, 2, 4].map((x) => <option key={x} value={x}>×{x}</option>)}</select>
      </span>
      <span><Icon name="clock" size={16} /> {t('time')}: <b data-testid="status-time">{`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`}</b></span>
      <span><Icon name="refresh" size={16} /> {t('cycles')}: <b data-testid="status-cycles">{snap ? snap.cycles.toLocaleString('en') : 0}</b></span>
    </footer>
  );
}

// ------------------------------------------------------------------ inspector
export function Inspector() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const sel = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const snap = useStore((s) => s.snap);
  if (!sel) return null;
  if (sel.kind === 'wire') {
    const w = project.wires.find((x) => x.id === sel.id);
    if (!w) return null;
    return (
      <div className="inspector" data-testid="inspector">
        <div className="insp-h"><b>{lang === 'ar' ? 'سلك' : 'Wire'} {w.id}</b><button className="icon-btn sm" onClick={() => A.select(null)}><Icon name="x" size={14} /></button></div>
        <div className="insp-row"><span>{w.from}</span><span>→</span><span>{w.to}</span></div>
        <button className="btn sm danger" onClick={A.deleteSelected}><Icon name="trash" size={14} /> {t('delete')}</button>
      </div>
    );
  }
  const part = project.parts.find((p) => p.id === sel.id);
  if (!part) return null;
  const def = PART_MAP[part.type];
  const live: any = snap?.parts[part.id];
  const readings = live ? Object.entries(live).filter(([k, v]) => k !== 'avg' && typeof v === 'number' && !k.startsWith('voltage_') && !k.startsWith('current_')).slice(0, 8) : [];
  return (
    <div className="inspector" data-testid="inspector">
      <div className="insp-h"><PartIcon type={part.type} size={28} /><b>{part.id}</b><small>{def.name[lang]}</small><span className="grow" /><button className="icon-btn sm" onClick={() => A.select(null)}><Icon name="x" size={14} /></button></div>
      {def.props.map((pd) => (
        <label key={pd.key} className="insp-field">
          <span>{pd.label[lang]}{pd.live ? <i className="live-tag" title={t('live')}>●</i> : null}</span>
          {pd.type === 'select' ? (
            <select value={String(part.props[pd.key])} onChange={(e) => A.setPartProp(part.id, pd.key, e.target.value)}>{pd.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          ) : pd.live && pd.min !== undefined && pd.max !== undefined ? (
            <div className="range"><input type="range" min={pd.min} max={pd.max} step={pd.step ?? (pd.max - pd.min > 100 ? 1 : 0.01)} value={Number(part.props[pd.key])} onChange={(e) => A.setPartProp(part.id, pd.key, Number(e.target.value), { record: false })} data-testid={`prop-${pd.key}`} /><em>{Number(part.props[pd.key])}{pd.unit ?? ''}</em></div>
          ) : (
            <NumberField value={Number(part.props[pd.key])} unit={pd.unit} min={pd.min} max={pd.max} onCommit={(v) => A.setPartProp(part.id, pd.key, v)} />
          )}
        </label>
      ))}
      {readings.length > 0 && (
        <div className="insp-live">
          {readings.map(([k, v]) => <div key={k}><span>{k}</span><b>{fmtNum(k, v as number)}</b></div>)}
        </div>
      )}
      <div className="insp-actions">
        {part.type !== 'uno' && part.type !== 'breadboard' && <button className="btn sm" onClick={A.rotateSelected}><Icon name="rotate" size={14} /> {t('rotate')}</button>}
        {part.type !== 'uno' && part.type !== 'breadboard' && <button className="btn sm" onClick={A.duplicateSelected}><Icon name="copy" size={14} /></button>}
        <button className="btn sm danger" onClick={A.deleteSelected}><Icon name="trash" size={14} /> {t('delete')}</button>
      </div>
      {valueText(part.type, part.props) && <div className="insp-foot">{valueText(part.type, part.props)}</div>}
    </div>
  );
}
function fmtNum(k: string, v: number) {
  if (/current|ic|ib|backlight/i.test(k)) return `${(v * 1000).toFixed(2)} mA`;
  if (/voltage|vce|vbe|vout|supply|contrast/i.test(k)) return `${v.toFixed(3)} V`;
  if (/power/i.test(k)) return `${(v * 1000).toFixed(1)} mW`;
  if (/resistance/i.test(k)) return `${v >= 1000 ? (v / 1000).toFixed(2) + ' kΩ' : v.toFixed(1) + ' Ω'}`;
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3);
}
function NumberField({ value, unit, min, max, onCommit }: { value: number; unit?: string; min?: number; max?: number; onCommit: (v: number) => void }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  const commit = () => {
    const m = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*([pnuµmkKM]?)/.exec(txt);
    if (!m) { setTxt(String(value)); return; }
    const mul: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, '': 1 };
    let v = Number(m[1]) * mul[m[2]];
    if (min !== undefined) v = Math.max(min, v); if (max !== undefined) v = Math.min(max, v);
    if (Number.isFinite(v)) onCommit(v); else setTxt(String(value));
  };
  return <div className="numf"><input value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /><em>{unit}</em></div>;
}

export const getStateForTests = getState;
