/**
 * Timeline: logic analyzer (GPIO edges recorded by the co-simulation at CPU
 * cycle resolution) and oscilloscope (net voltages sampled every 100 µs from
 * the circuit solver), with cursor read-out, frequency/duty/period
 * measurements and VCD/CSV export and import.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { traces, levelsInWindow, measure } from '../lib/traces';
import * as A from '../actions';
import { tr } from '../i18n';
import { Icon } from '../components/Icons';

const WINDOWS = [0.005, 0.02, 0.1, 0.5, 1, 2, 5, 10];
const fmtT = (s: number) => (Math.abs(s) >= 1 ? `${s.toFixed(3)} s` : Math.abs(s) >= 1e-3 ? `${(s * 1e3).toFixed(3)} ms` : `${(s * 1e6).toFixed(1)} µs`);
const fmtF = (f: number) => (f >= 1e3 ? `${(f / 1e3).toFixed(3)} kHz` : `${f.toFixed(f < 10 ? 3 : 1)} Hz`);
const PIN_COLORS = ['#2fd36b', '#2f9bff', '#ffb000', '#a46bff', '#ff7a00', '#17c3d6', '#ff5a8a', '#c3e85a'];

export default function Timeline() {
  const lang = useStore((s) => s.lang);
  const snap = useStore((s) => s.snap);
  const simState = useStore((s) => s.simState);
  const [win, setWin] = useState(2);
  const [frozen, setFrozen] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [showImported, setShowImported] = useState(true);
  const la = useRef<HTMLCanvasElement>(null);
  const sc = useRef<HTMLCanvasElement>(null);
  const [pins, setPins] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // discover pins that toggled
  useEffect(() => {
    const id = setInterval(() => {
      const set = new Set<string>();
      for (const e of traces.edges) set.add(e.pin);
      if (showImported) for (const e of traces.imported?.edges ?? []) set.add('vcd:' + e.pin);
      const order = (p: string) => { const m = /(\D+):?(\D*)(\d+)/.exec(p); return (p.startsWith('vcd:') ? 1000 : 0) + (p.includes('A') ? 100 : 0) + Number(/\d+/.exec(p)?.[0] ?? 0); };
      const next = [...set].sort((a, b) => order(a) - order(b));
      setPins((old) => (old.join() === next.join() ? old : next));
    }, 400);
    return () => clearInterval(id);
  }, [showImported]);

  const end = frozen ?? traces.now;
  const t0 = Math.max(0, end - win), t1 = Math.max(win, end);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const endT = frozen ?? traces.now;
      const a = Math.max(0, endT - win), b = Math.max(win, endT);
      drawLogic(la.current, pins.filter((p) => !hidden.has(p)), a, b, cursor);
      drawScope(sc.current, a, b, cursor, hidden);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [pins, win, frozen, cursor, hidden]);

  const meas = useMemo(() => pins.filter((p) => !p.startsWith('vcd:')).map((p) => ({ pin: p, ...measure(traces.edges, p, t0, t1) })), [pins, t0, t1, snap]);
  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left - 56) / (r.width - 64); setCursor(x >= 0 && x <= 1 ? t0 + x * (t1 - t0) : null); };

  return (
    <div className="timeline" data-testid="timeline">
      <div className="tl-toolbar">
        <span className="tl-title"><Icon name="activity" /> {tr(lang, 'logic')} + {tr(lang, 'scope')}</span>
        <label>{tr(lang, 'window')}
          <select value={win} onChange={(e) => setWin(Number(e.target.value))}>{WINDOWS.map((w) => <option key={w} value={w}>{fmtT(w)}</option>)}</select>
        </label>
        <button className={'btn sm' + (frozen !== null ? ' on' : '')} onClick={() => setFrozen(frozen === null ? traces.now : null)}><Icon name={frozen !== null ? 'play' : 'pause'} size={14} /> {tr(lang, 'freeze')}</button>
        <span className="grow" />
        <button className="btn sm" onClick={A.importVcdFile}><Icon name="upload" size={14} /> {tr(lang, 'importVcd')}</button>
        {traces.imported && <label className="chk"><input type="checkbox" checked={showImported} onChange={(e) => setShowImported(e.target.checked)} /> {traces.imported.name}</label>}
        <button className="btn sm" onClick={A.exportVcdFile}><Icon name="download" size={14} /> VCD</button>
        <button className="btn sm" onClick={A.exportCsvFile}><Icon name="download" size={14} /> CSV</button>
      </div>
      <div className="tl-body">
        <div className="tl-canvases">
          <canvas ref={la} className="la" onMouseMove={onCanvasMove} onMouseLeave={() => setCursor(null)} />
          <canvas ref={sc} className="sc" onMouseMove={onCanvasMove} onMouseLeave={() => setCursor(null)} />
          {simState === 'idle' && !traces.edges.length && !traces.imported && <div className="tl-empty">{lang === 'ar' ? 'شغّل المحاكاة لتسجيل الإشارات' : 'Run the simulation to record signals'}</div>}
        </div>
        <div className="tl-side">
          <div className="tl-side-h">{tr(lang, 'measurements')}</div>
          {cursor !== null && <div className="tl-cursor">t = {fmtT(cursor)}</div>}
          <table className="meas">
            <thead><tr><th /><th>{tr(lang, 'frequency')}</th><th>{tr(lang, 'duty')}</th></tr></thead>
            <tbody>
              {meas.map((m, i) => (
                <tr key={m.pin} className={hidden.has(m.pin) ? 'off' : ''} onClick={() => setHidden((h) => { const n = new Set(h); n.has(m.pin) ? n.delete(m.pin) : n.add(m.pin); return n; })}>
                  <td><span className="dot" style={{ background: PIN_COLORS[i % PIN_COLORS.length] }} />{m.pin}</td>
                  <td>{m.freq ? fmtF(m.freq) : '—'}</td>
                  <td>{m.duty === null ? '—' : `${m.duty.toFixed(1)}%`}</td>
                </tr>
              ))}
              {!meas.length && <tr><td colSpan={3} className="muted">—</td></tr>}
            </tbody>
          </table>
          <div className="tl-side-h">{tr(lang, 'probes')}</div>
          {[...traces.samples.keys()].map((k, i) => {
            const arr = traces.samples.get(k)!; const v = arr.length ? arr[arr.length - 1].v : NaN;
            return <div key={k} className="probe-row"><span className="dot" style={{ background: SCOPE_COLORS[i % SCOPE_COLORS.length] }} />{k}<b>{Number.isFinite(v) ? v.toFixed(3) + ' V' : '—'}</b></div>;
          })}
        </div>
      </div>
    </div>
  );
}

const SCOPE_COLORS = ['#ffd21f', '#17c3d6', '#ff5a8a', '#2fd36b'];
function prep(c: HTMLCanvasElement | null) {
  if (!c) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return null;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';

function axis(g: CanvasRenderingContext2D, w: number, h: number, t0: number, t1: number, cursor: number | null) {
  const X0 = 56, X1 = w - 8;
  g.strokeStyle = css('--grid'); g.lineWidth = 1; g.fillStyle = css('--muted'); g.font = '10px Segoe UI, sans-serif';
  for (let i = 0; i <= 10; i++) { const x = X0 + ((X1 - X0) * i) / 10; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h - 14); g.stroke(); if (i % 2 === 0) g.fillText(fmtT(t0 + ((t1 - t0) * i) / 10), x - 18, h - 3); }
  if (cursor !== null) { const x = X0 + ((cursor - t0) / (t1 - t0)) * (X1 - X0); g.strokeStyle = '#ff5a8a'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h - 14); g.stroke(); g.setLineDash([]); }
  return { X0, X1 };
}

function drawLogic(c: HTMLCanvasElement | null, pins: string[], t0: number, t1: number, cursor: number | null) {
  const p = prep(c); if (!p) return;
  const { g, w, h } = p;
  const { X0, X1 } = axis(g, w, h, t0, t1, cursor);
  const rowH = Math.max(16, Math.min(34, (h - 18) / Math.max(1, pins.length)));
  pins.forEach((pin, i) => {
    const src = pin.startsWith('vcd:') ? traces.imported?.edges ?? [] : traces.edges;
    const name = pin.replace('vcd:', '');
    const y = 4 + i * rowH, hi = y + 3, lo = y + rowH - 5;
    g.fillStyle = css('--muted'); g.font = '11px Segoe UI'; g.fillText(pin.startsWith('vcd:') ? '⇪' + name : name, 6, y + rowH / 2 + 4);
    const { initial, edges } = levelsInWindow(src, name, t0, t1);
    g.strokeStyle = pin.startsWith('vcd:') ? '#ff7a00' : PIN_COLORS[i % PIN_COLORS.length]; g.lineWidth = 1.6;
    g.beginPath();
    const tx = (t: number) => X0 + ((t - t0) / (t1 - t0)) * (X1 - X0);
    let lvl = initial;
    let x = X0;
    const yOf = (l: 0 | 1 | null) => (l === 1 ? hi : lo);
    g.moveTo(x, yOf(lvl));
    // decimate: at most ~2 transitions per pixel
    let lastPx = -1;
    for (const e of edges) {
      const ex = tx(e.t);
      if (Math.floor(ex) === lastPx && edges.length > (X1 - X0) * 2) { g.lineTo(ex, hi); g.lineTo(ex, lo); lvl = e.v; continue; }
      lastPx = Math.floor(ex);
      g.lineTo(ex, yOf(lvl)); g.lineTo(ex, yOf(e.v)); lvl = e.v; x = ex;
    }
    const endX = pin.startsWith('vcd:') ? Math.min(X1, tx(src.length ? src[src.length - 1].t : t0)) : Math.min(X1, tx(traces.now));
    g.lineTo(Math.max(x, endX), yOf(lvl));
    g.stroke();
    if (lvl === 1) { g.fillStyle = (pin.startsWith('vcd:') ? '#ff7a00' : PIN_COLORS[i % PIN_COLORS.length]) + '22'; }
    g.strokeStyle = css('--grid'); g.beginPath(); g.moveTo(X0, y + rowH - 1); g.lineTo(X1, y + rowH - 1); g.stroke();
  });
}

function drawScope(c: HTMLCanvasElement | null, t0: number, t1: number, cursor: number | null, hidden: Set<string>) {
  const p = prep(c); if (!p) return;
  const { g, w, h } = p;
  const { X0, X1 } = axis(g, w, h, t0, t1, cursor);
  const vmax = 5.5, vmin = -0.25;
  const yv = (v: number) => (h - 18) - ((v - vmin) / (vmax - vmin)) * (h - 26);
  g.fillStyle = css('--muted'); g.font = '10px Segoe UI';
  for (const v of [0, 1, 2, 3, 4, 5]) { g.fillText(`${v}V`, 22, yv(v) + 3); g.strokeStyle = css('--grid'); g.beginPath(); g.moveTo(X0, yv(v)); g.lineTo(X1, yv(v)); g.stroke(); }
  let i = 0;
  for (const [k, arr] of traces.samples) {
    const col = SCOPE_COLORS[i++ % SCOPE_COLORS.length];
    if (hidden.has('~' + k) || !arr.length) continue;
    // binary search start
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].t < t0) lo = m + 1; else hi = m; }
    g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath();
    const px = X1 - X0;
    const step = Math.max(1, Math.floor((arr.length - lo) / (px * 3)));
    let first = true;
    for (let j = Math.max(0, lo - 1); j < arr.length; j += step) {
      const s = arr[j]; if (s.t > t1) break;
      if (step > 1) { // min/max per bucket for fidelity
        let mn = s.v, mx = s.v; for (let q = j; q < Math.min(arr.length, j + step); q++) { mn = Math.min(mn, arr[q].v); mx = Math.max(mx, arr[q].v); }
        const x = X0 + ((s.t - t0) / (t1 - t0)) * px;
        if (first) { g.moveTo(x, yv(mn)); first = false; } g.lineTo(x, yv(mn)); g.lineTo(x, yv(mx));
      } else {
        const x = X0 + ((s.t - t0) / (t1 - t0)) * px;
        if (first) { g.moveTo(x, yv(s.v)); first = false; } else g.lineTo(x, yv(s.v));
      }
    }
    g.stroke();
    g.fillStyle = col; g.fillText(k, X1 - 40 - (i - 1) * 46, 12);
  }
}
