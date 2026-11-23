/**
 * Interactive breadboard editor: drag parts from the palette, move/rotate/delete,
 * click pin → pin to wire, zoom/pan, undo/redo. While simulating, parts react to
 * live results and inputs (buttons, pots, switches, sensors) can be operated.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, getState, setState } from '../store';
import { PART_MAP, pinWorld } from '../../shared/parts/catalog';
import { buildNetlist } from '../../shared/circuit/netlist';
import { PartSvg, bodyBox } from '../components/PartGraphics';
import * as A from '../actions';
import { tr } from '../i18n';
import { Icon } from '../components/Icons';

interface View { x: number; y: number; k: number }
const WIRE_COLORS = ['#2f9bff', '#ff3b3b', '#222a36', '#2fd36b', '#ffb000', '#a46bff', '#ff7a00', '#e8e8e8'];

export function wirePath(a: { x: number; y: number }, b: { x: number; y: number }, pts?: { x: number; y: number }[]) {
  if (pts?.length) return `M${a.x} ${a.y} ` + pts.map((p) => `L${p.x} ${p.y}`).join(' ') + ` L${b.x} ${b.y}`;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const lift = Math.min(70, 12 + d * 0.28);
  return `M${a.x} ${a.y} C${a.x} ${a.y - lift} ${b.x} ${b.y - lift} ${b.x} ${b.y}`;
}

export function fmtV(v: number) { return Number.isFinite(v) ? (Math.abs(v) < 0.001 ? '0.00 V' : `${v.toFixed(Math.abs(v) < 10 ? 2 : 1)} V`) : '—'; }

export default function CircuitCanvas({ compact = false }: { compact?: boolean }) {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const snap = useStore((s) => s.snap);
  const simState = useStore((s) => s.simState);
  const lang = useStore((s) => s.lang);
  const wireColor = useStore((s) => s.wireColor);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1.6 });
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [pending, setPending] = useState<string | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [hoverPin, setHoverPin] = useState<{ ep: string; x: number; y: number } | null>(null);
  const interactive = simState === 'running' || simState === 'paused';

  const netlist = useMemo(() => buildNetlist(project), [project.parts, project.wires]);
  const netOf = (ep: string) => { const id = netlist.pinToNet.get(ep); return id === undefined ? null : netlist.nets[id]; };

  // ------- view helpers
  const toWorld = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };
  const fit = () => {
    const el = svgRef.current; if (!el || !project.parts.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of project.parts) {
      const b = bodyBox(p.type);
      const r = p.rotation ?? 0;
      const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => r === 90 ? [-y, x] : r === 180 ? [-x, -y] : r === 270 ? [y, -x] : [x, y]);
      for (const [x, y] of corners) { x0 = Math.min(x0, p.x + x); y0 = Math.min(y0, p.y + y); x1 = Math.max(x1, p.x + x); y1 = Math.max(y1, p.y + y); }
    }
    const R = el.getBoundingClientRect();
    const k = Math.min(4, Math.max(0.3, Math.min((R.width - 40) / (x1 - x0 + 40), (R.height - 40) / (y1 - y0 + 80))));
    setView({ k, x: (R.width - (x1 - x0) * k) / 2 - x0 * k, y: (R.height - (y1 - y0) * k) / 2 - y0 * k });
  };
  const firstFit = useRef(false);
  const projKey = project.name + project.parts.length;
  useEffect(() => { firstFit.current = false; }, [projKey]);
  useEffect(() => {
    if (firstFit.current) return;
    const el = svgRef.current; if (!el) return;
    const ro = new ResizeObserver(() => { if (!firstFit.current && el.clientWidth > 50) { firstFit.current = true; fit(); } });
    ro.observe(el);
    return () => ro.disconnect();
  });
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const el = svgRef.current!; const R = el.getBoundingClientRect();
    const px = cx ?? R.left + R.width / 2, py = cy ?? R.top + R.height / 2;
    setView((v) => { const k = Math.max(0.25, Math.min(6, v.k * factor)); const wx = (px - R.left - v.x) / v.k, wy = (py - R.top - v.y) / v.k; return { k, x: px - R.left - wx * k, y: py - R.top - wy * k }; });
  };

  // ------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.closest('.monaco-editor'))) return;
      if (e.key === 'Escape') { setPending(null); A.select(null); }
      else if (e.key === 'Delete' || e.key === 'Backspace') A.deleteSelected();
      else if (e.key.toLowerCase() === 'r' && !e.ctrlKey) A.rotateSelected();
      else if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? A.redo() : A.undo(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); A.redo(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); A.duplicateSelected(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ------- pointer interactions
  const drag = useRef<null | { kind: 'part'; id: string; ox: number; oy: number; px: number; py: number; moved: boolean } | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }>(null);
  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    if (tool === 'select' && e.button === 0) A.select(null);
  };
  const onPartDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (tool === 'pan') { onBgDown(e); return; }
    A.select({ kind: 'part', id });
    const part = getState().project.parts.find((p) => p.id === id)!;
    const w = toWorld(e.clientX, e.clientY);
    (svgRef.current as Element).setPointerCapture(e.pointerId);
    A.beginDrag();
    drag.current = { kind: 'part', id, ox: part.x, oy: part.y, px: w.x, py: w.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    if (pending) setMouse(w);
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    else {
      const nx = d.ox + (w.x - d.px), ny = d.oy + (w.y - d.py);
      if (Math.abs(w.x - d.px) + Math.abs(w.y - d.py) > 2) d.moved = true;
      if (d.moved) A.movePart(d.id, nx, ny, false);
    }
  };
  const onUp = () => {
    const d = drag.current;
    if (d?.kind === 'part') A.endDrag(d.moved);
    drag.current = null;
  };
  const onPinDown = (e: React.PointerEvent, ep: string) => {
    e.stopPropagation();
    if (!pending) { setPending(ep); setMouse(toWorld(e.clientX, e.clientY)); }
    else { if (pending !== ep) A.addWire(pending, ep); setPending(null); }
  };
  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData('application/x-asp-part');
    if (!type) return;
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    const b = bodyBox(type);
    A.addPart(type, w.x - b.x - b.w / 2, w.y - b.y - b.h / 2);
  };

  // ------- live data per part
  const liveFor = (id: string, type: string) => {
    if (!snap) return undefined;
    if (type === 'uno') return { d13: (snap.pins.D13?.voltage ?? 0) > 2.5 && snap.pins.D13?.mode === 'high', tx: !!snap.serial, powered: true };
    return snap.parts[id] as any;
  };
  const onPress = (partId: string) => (key: string, value: number) => A.setPartProp(partId, key, value, { record: false });

  // ------- render
  const pinEls: React.ReactElement[] = [];
  for (const part of project.parts) {
    const def = PART_MAP[part.type];
    if (!def) continue;
    const isBB = part.type === 'breadboard';
    for (const pin of def.pins) {
      const pw = pinWorld(part, pin.id)!;
      const ep = `${part.id}.${pin.id}`;
      const hot = hoverPin?.ep === ep || pending === ep;
      pinEls.push(
        <rect key={ep} x={pw.x - (isBB ? 2.5 : 2.8)} y={pw.y - (isBB ? 2.5 : 2.8)} width={isBB ? 5 : 5.6} height={isBB ? 5 : 5.6} rx={1}
          className={'pin' + (isBB ? ' bb' : '') + (hot ? ' hot' : '')}
          onPointerDown={(e) => onPinDown(e, ep)}
          onPointerEnter={() => setHoverPin({ ep, x: pw.x, y: pw.y })}
          onPointerLeave={() => setHoverPin((h) => (h?.ep === ep ? null : h))} />,
      );
    }
  }
  const hoverNet = hoverPin ? netOf(hoverPin.ep) : null;
  const hoverV = hoverNet && snap ? snap.nets[hoverNet.name] : undefined;
  const pinLabel = (ep: string) => { const [pid, ...rest] = ep.split('.'); const pin = rest.join('.'); const part = project.parts.find((p) => p.id === pid); const pd = part && PART_MAP[part.type]?.pins.find((x) => x.id === pin); return `${pid}.${pd?.label ?? pin}`; };
  const highlightNet = hoverNet ? new Set(hoverNet.pins) : null;
  const selPart = selection?.kind === 'part' ? project.parts.find((p) => p.id === selection.id) : null;
  const selWire = selection?.kind === 'wire' ? project.wires.find((w) => w.id === selection.id) : null;
  const order = [...project.parts].sort((a, b) => (a.type === 'breadboard' ? -1 : 0) - (b.type === 'breadboard' ? -1 : 0) || (a.type === 'uno' ? -1 : 0) - (b.type === 'uno' ? -1 : 0));

  return (
    <div className="canvas-wrap">
      {!compact && (
        <div className="canvas-toolbar">
          <button className={'tbtn' + (tool === 'select' ? ' on' : '')} title={tr(lang, 'select')} onClick={() => setTool('select')}><Icon name="cursor" /></button>
          <button className={'tbtn' + (tool === 'pan' ? ' on' : '')} title={tr(lang, 'pan')} onClick={() => setTool('pan')}><Icon name="move" /></button>
          <button className="tbtn" title={tr(lang, 'rotate') + ' (R)'} onClick={A.rotateSelected} disabled={!selPart}><Icon name="rotate" /></button>
          <button className="tbtn" title={tr(lang, 'zoomOut')} onClick={() => zoomAt(1 / 1.25)}><Icon name="zoomOut" /></button>
          <button className="tbtn" title={tr(lang, 'zoomIn')} onClick={() => zoomAt(1.25)}><Icon name="zoomIn" /></button>
          <button className="tbtn" title={tr(lang, 'fit')} onClick={fit}><Icon name="fit" /></button>
          <span className="tsep" />
          <button className="tbtn" title={tr(lang, 'undo') + ' (Ctrl+Z)'} onClick={A.undo}><Icon name="undo" /></button>
          <button className="tbtn" title={tr(lang, 'redo') + ' (Ctrl+Y)'} onClick={A.redo}><Icon name="redo" /></button>
          <button className="tbtn" title={tr(lang, 'delete') + ' (Del)'} onClick={A.deleteSelected} disabled={!selection}><Icon name="trash" /></button>
          <span className="tsep" />
          <div className="wire-colors" title={tr(lang, 'wireColor')}>
            {WIRE_COLORS.map((c) => (
              <button key={c} className={'swatch' + (wireColor === c ? ' on' : '')} style={{ background: c }}
                onClick={() => { setState({ wireColor: c }); if (selWire) A.setWireColor(selWire.id, c); }} />
            ))}
          </div>
        </div>
      )}
      <svg ref={svgRef} className={'circuit-svg' + (tool === 'pan' ? ' panning' : '') + (pending ? ' wiring' : '')}
        onPointerDown={onBgDown} onPointerMove={onMove} onPointerUp={onUp}
        onWheel={(e) => zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY)}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-asp-part')) e.preventDefault(); }}
        onDrop={onDrop} data-testid="circuit-canvas">
        <defs>
          <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" /></filter>
          <pattern id="grid" width={10} height={10} patternUnits="userSpaceOnUse"><circle cx={0.5} cy={0.5} r={0.6} className="grid-dot" /></pattern>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <rect x={-2000} y={-2000} width={5000} height={5000} fill="url(#grid)" pointerEvents="none" />
          {order.map((part) => {
            const bb = bodyBox(part.type);
            const sel = selection?.kind === 'part' && selection.id === part.id;
            return (
              <g key={part.id} transform={`translate(${part.x} ${part.y}) rotate(${part.rotation ?? 0})`} className="part" data-part={part.id}
                onPointerDown={(e) => onPartDown(e, part.id)}>
                <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h} fill="transparent" />
                <PartSvg part={part} live={liveFor(part.id, part.type)} h={{ interactive, onPress: onPress(part.id) }} onReset={interactive ? () => A.runSimulation() : undefined} />
                {sel && <rect x={bb.x - 3} y={bb.y - 3} width={bb.w + 6} height={bb.h + 6} rx={4} className="sel-outline" />}
                {part.type !== 'breadboard' && part.type !== 'uno' && (
                  <text x={bb.x + bb.w / 2} y={bb.y + bb.h + 9} transform={part.rotation ? `rotate(${-(part.rotation ?? 0)} ${bb.x + bb.w / 2} ${bb.y + bb.h + 9})` : undefined} className="part-label" textAnchor="middle">{part.id}</text>
                )}
              </g>
            );
          })}
          {project.wires.map((w) => {
            const a = A_pos(project, w.from), b = A_pos(project, w.to);
            if (!a || !b) return null;
            const sel = selection?.kind === 'wire' && selection.id === w.id;
            const hl = highlightNet && (highlightNet.has(w.from) || highlightNet.has(w.to));
            const d = wirePath(a, b, w.points);
            return (
              <g key={w.id} className={'wire' + (sel ? ' sel' : '') + (hl ? ' hl' : '')} onPointerDown={(e) => { e.stopPropagation(); A.select({ kind: 'wire', id: w.id }); }}>
                <path d={d} className="wire-hit" />
                <path d={d} className="wire-shadow" />
                <path d={d} stroke={w.color ?? '#2f9bff'} className="wire-core" />
                <path d={d} className="wire-shine" />
                <circle cx={a.x} cy={a.y} r={2.4} fill={w.color ?? '#2f9bff'} className="wire-end" />
                <circle cx={b.x} cy={b.y} r={2.4} fill={w.color ?? '#2f9bff'} className="wire-end" />
              </g>
            );
          })}
          <g className="pins">{pinEls}</g>
          {highlightNet && project.parts.flatMap((part) => PART_MAP[part.type]?.pins.filter((p) => highlightNet.has(`${part.id}.${p.id}`)).map((p) => { const pw = pinWorld(part, p.id)!; return <circle key={part.id + p.id} cx={pw.x} cy={pw.y} r={3.6} className="net-hl" />; }) ?? [])}
          {pending && mouse && (() => { const a = A_pos(project, pending); return a ? <path d={wirePath(a, mouse)} stroke={wireColor} className="wire-core pending" /> : null; })()}
          {hoverPin && (
            <g transform={`translate(${hoverPin.x + 6} ${hoverPin.y - 8})`} className="pin-tip" pointerEvents="none">
              <rect x={0} y={-11} width={Math.max(64, pinLabel(hoverPin.ep).length * 4.6 + 10)} height={hoverV !== undefined ? 24 : 14} rx={3} />
              <text x={5} y={-1}>{pinLabel(hoverPin.ep)}{hoverNet ? ` · ${hoverNet.name}` : ''}</text>
              {hoverV !== undefined && <text x={5} y={10} className="v">{fmtV(hoverV)}</text>}
            </g>
          )}
        </g>
      </svg>
      {pending && <div className="canvas-hint">{tr(lang, 'hintWire')}</div>}
      {project.parts.length <= 2 && !compact && <div className="canvas-empty">{tr(lang, 'emptyHint')}</div>}
      <div className="zoom-badge">{Math.round(view.k * 100)}%</div>
    </div>
  );
}

function A_pos(project: ReturnType<typeof getState>['project'], ep: string) {
  const i = ep.indexOf('.');
  const part = project.parts.find((p) => p.id === ep.slice(0, i));
  return part ? pinWorld(part, ep.slice(i + 1)) : null;
}
