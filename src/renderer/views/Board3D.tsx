/**
 * 3D view of the same project (three.js): board, breadboard, parts and jumper
 * wires built from the project geometry; LEDs, servo horn, motor rotor, LCD
 * text and buzzer react to the live simulation snapshot.
 */
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getState, subscribe, useStore } from '../store';
import { pinWorld } from '../../shared/parts/catalog';
import type { Project } from '../../shared/project';
import { resistorBands } from '../components/PartGraphics';

const S = 0.1; // px -> world units
const LED_HEX: Record<string, number> = { red: 0xff2a2a, yellow: 0xffd21f, green: 0x22e05a, blue: 0x3c7bff, white: 0xf4f7ff };

interface Dyn { update(snap: any): void }

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, canvas: c };
}

function buildScene(project: Project, scene: THREE.Group, dyn: Dyn[]) {
  const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
  const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (r: number, h: number, m: THREE.Material, seg = 24) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  const at = (o: THREE.Object3D, x: number, y: number, z: number) => { o.position.set(x * S, y, z * S); return o; };

  for (const part of project.parts) {
    const g = new THREE.Group();
    g.position.set(part.x * S, 0, part.y * S);
    g.rotation.y = -((part.rotation ?? 0) * Math.PI) / 180;
    const p = part.props;
    switch (part.type) {
      case 'uno': {
        const { tex } = canvasTexture(600, 420, (c) => {
          const gr = c.createLinearGradient(0, 0, 600, 420); gr.addColorStop(0, '#1474b8'); gr.addColorStop(1, '#0a4f86');
          c.fillStyle = gr; c.fillRect(0, 0, 600, 420);
          c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 2;
          for (let i = 0; i < 14; i++) { c.beginPath(); c.moveTo(120 + i * 25, 60); c.lineTo(80 + i * 22, 380); c.stroke(); }
          c.fillStyle = '#e9f3fb'; c.font = 'bold 44px Segoe UI, Arial'; c.textAlign = 'center'; c.fillText('UNO R3', 300, 175);
          c.font = '18px Segoe UI, Arial'; c.fillText('ATmega328P · 16 MHz', 300, 215);
          c.font = '12px Segoe UI'; c.fillText('DIGITAL (PWM ~)', 260, 64); c.fillText('POWER        ANALOG IN', 340, 362);
        });
        const pcb = box(300 * S, 0.16, 210 * S, [mat(0x0a4f86), mat(0x0a4f86), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), mat(0x0a4f86), mat(0x0a4f86), mat(0x0a4f86)] as any);
        g.add(at(pcb, 150, 0.08, 105));
        const usb = box(46 * S, 1.1, 40 * S, mat(0xc9d1db, { metalness: 0.8, roughness: 0.3 })); g.add(at(usb, 11, 0.7, 54));
        const jack = box(40 * S, 1.1, 34 * S, mat(0x15181e)); g.add(at(jack, 14, 0.7, 167));
        const chip = box(140 * S, 0.35, 34 * S, mat(0x1b1e24, { roughness: 0.4 })); g.add(at(chip, 200, 0.34, 145));
        for (const [x0, len, z] of [[90, 82, 10], [180, 82, 10], [120, 72, 200], [200, 62, 200]] as const) { const h = box(len * S, 0.85, 12 * S, mat(0x14171c)); g.add(at(h, x0 + len / 2, 0.58, z)); }
        const xtal = box(24 * S, 0.4, 9 * S, mat(0xd9dee5, { metalness: 0.9, roughness: 0.25 })); g.add(at(xtal, 82, 0.35, 116));
        for (const x of [60, 80]) { const c = cyl(8 * S, 1, mat(0xc2c9d3, { metalness: 0.7 })); g.add(at(c, x, 0.66, 168)); }
        const rst = cyl(5 * S, 0.5, mat(0xe23b3b)); g.add(at(rst, 39, 0.4, 17));
        const ledL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.4), mat(0x5c4a26, { emissive: 0xffa020, emissiveIntensity: 0 })); g.add(at(ledL, 103, 0.24, 42));
        const ledOn = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.4), mat(0x245030, { emissive: 0x36f070, emissiveIntensity: 1.5 })); g.add(at(ledOn, 243, 0.24, 62));
        dyn.push({ update: (snap) => { (ledL.material as THREE.MeshStandardMaterial).emissiveIntensity = snap && (snap.pins?.D13?.voltage ?? 0) > 2.5 ? 2.5 : 0; } });
        break;
      }
      case 'breadboard': {
        const { tex } = canvasTexture(1320, 760, (c) => {
          c.fillStyle = '#eef0ec'; c.fillRect(0, 0, 1320, 760);
          c.fillStyle = '#d6dad3'; c.fillRect(16, 368, 1288, 24);
          c.strokeStyle = '#2a62d6'; c.lineWidth = 4; c.beginPath(); c.moveTo(56, 16); c.lineTo(1264, 16); c.moveTo(56, 744); c.lineTo(1264, 744); c.stroke();
          c.strokeStyle = '#e0393e'; c.beginPath(); c.moveTo(56, 104); c.lineTo(1264, 104); c.moveTo(56, 656); c.lineTo(1264, 656); c.stroke();
          c.fillStyle = '#34383d';
          for (let col = 0; col < 30; col++) {
            const x = (20 + col * 10) * 4;
            for (let r = 0; r < 5; r++) { c.fillRect(x - 8, (40 + r * 10) * 4 - 8, 16, 16); c.fillRect(x - 8, (110 + r * 10) * 4 - 8, 16, 16); }
            if (col % 6 !== 5) for (const y of [10, 20, 170, 180]) c.fillRect(x - 8, y * 4 - 8, 16, 16);
          }
        });
        const bb = box(330 * S, 0.9, 190 * S, [mat(0xe4e7e2), mat(0xe4e7e2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), mat(0xe4e7e2), mat(0xe4e7e2), mat(0xe4e7e2)] as any);
        g.add(at(bb, 165, 0.45, 95));
        break;
      }
      case 'resistor': {
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.4, 6, 16), mat(0xe3c79a)); body.rotation.z = Math.PI / 2; g.add(at(body, 20, 1.6, 0));
        const lead = cyl(0.06, 4, mat(0xb9c2cf, { metalness: 0.9 })); lead.rotation.z = Math.PI / 2; g.add(at(lead, 20, 1.6, 0));
        for (const x of [0, 40]) { const l = cyl(0.06, 1.6, mat(0xb9c2cf, { metalness: 0.9 })); g.add(at(l, x, 0.8, 0)); }
        const bands = resistorBands(Number(p.ohms)).map((c) => new THREE.Color(c).getHex());
        bands.forEach((c, i) => { const b = cyl(0.45, 0.14, mat(c)); b.rotation.z = Math.PI / 2; g.add(at(b, 14 + i * 4, 1.6, 0)); });
        break;
      }
      case 'led': case 'rgb_led': {
        const rgb = part.type === 'rgb_led';
        const color = rgb ? 0xffffff : LED_HEX[String(p.color)] ?? 0xff2a2a;
        const m = new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.82, roughness: 0.15, transmission: 0.2, emissive: color, emissiveIntensity: 0 });
        const cx = rgb ? 15 : 5;
        const r = rgb ? 0.8 : 0.55;
        const dome = new THREE.Mesh(new THREE.CapsuleGeometry(r, r * 1.6, 8, 20), m); g.add(at(dome, cx, 2.5, 0));
        const rim = cyl(r + 0.1, 0.18, m); g.add(at(rim, cx, 1.45, 0));
        const light = new THREE.PointLight(color, 0, 6, 2); g.add(at(light, cx, 3, 0));
        for (const x of rgb ? [0, 10, 20, 30] : [0, 10]) { const l = cyl(0.05, 1.4, mat(0xb9c2cf, { metalness: 0.9 })); g.add(at(l, x, 0.7, 0)); }
        dyn.push({
          update: (snap) => {
            const o = snap?.parts?.[part.id];
            if (rgb) {
              const k = (s: string) => Math.min(1, Number(o?.avg?.['current_' + s] ?? 0) / 0.015);
              const c = new THREE.Color(k('R'), k('G'), k('B'));
              m.emissive = c; m.emissiveIntensity = 2.2 * Math.max(k('R'), k('G'), k('B')); light.color = c; light.intensity = 6 * Math.max(k('R'), k('G'), k('B'));
            } else {
              const b = Math.min(1, Number(o?.avg?.current_anode ?? 0) / 0.015);
              m.emissiveIntensity = 2.6 * b; light.intensity = 7 * b;
            }
          },
        });
        break;
      }
      case 'button': {
        const base = box(38 * S, 0.9, 38 * S, mat(0x2a2e35)); g.add(at(base, 15, 1.35, 15));
        const cap = cyl(0.75, 0.6, mat(0x495260)); g.add(at(cap, 15, 2.0, 15));
        dyn.push({ update: () => { const pr = Number(getState().project.parts.find((x) => x.id === part.id)?.props.pressed) > 0.5; cap.position.y = pr ? 1.75 : 2.0; (cap.material as THREE.MeshStandardMaterial).color.set(pr ? 0x3a7bd5 : 0x495260); } });
        break;
      }
      case 'potentiometer': {
        const base = box(32 * S, 1.2, 26 * S, mat(0x1f5fbf)); g.add(at(base, 10, 1.5, -19));
        const knob = cyl(0.85, 1.6, mat(0xe8ebef), 18); g.add(at(knob, 10, 2.8, -19));
        const mark = box(0.15, 0.1, 0.7, mat(0x1a1d22)); knob.add(mark); mark.position.set(0, 0.82, -0.4);
        dyn.push({ update: () => { const pos = Number(getState().project.parts.find((x) => x.id === part.id)?.props.position ?? 0.5); knob.rotation.y = -((-135 + 270 * pos) * Math.PI) / 180; } });
        break;
      }
      case 'buzzer': {
        const b = cyl(1.3, 1.1, mat(0x121417)); g.add(at(b, 5, 1.5, -16));
        const hole = cyl(0.3, 0.05, mat(0x000000)); g.add(at(hole, 5, 2.07, -16));
        dyn.push({ update: (snap) => { const f = Number(snap?.parts?.[part.id]?.frequency ?? 0); const s = f > 0 ? 1 + 0.04 * Math.sin(performance.now() / 25) : 1; b.scale.set(s, 1, s); } });
        break;
      }
      case 'servo': {
        const body = box(60 * S, 2.6, 30 * S, mat(0x2f6fd0)); g.add(at(body, 10, 1.9, -30));
        const ear = box(72 * S, 0.3, 8 * S, mat(0x2a63bb)); g.add(at(ear, 10, 2.4, -30));
        const hub = cyl(0.8, 0.5, mat(0xe6e9ee)); g.add(at(hub, 10, 3.45, -38));
        const horn = box(0.7, 0.18, 2.8, mat(0xf4f6f8)); const hg = new THREE.Group(); hg.add(horn); horn.position.z = -1.2; g.add(at(hg, 10, 3.75, -38));
        dyn.push({ update: (snap) => { const a = Number(snap?.parts?.[part.id]?.angle ?? 90); hg.rotation.y = -((a - 90) * Math.PI) / 180; } });
        break;
      }
      case 'stepper': {
        const pcb = box(64 * S, 0.2, 24 * S, mat(0x1f6b3a)); g.add(at(pcb, 26, 1.0, -18));
        const body = cyl(2.6, 1.9, mat(0xc7ccd4, { metalness: 0.6, roughness: 0.35 })); g.add(at(body, 26, 2.0, -64));
        const shaft = cyl(0.35, 0.8, mat(0xffb000)); const sg = new THREE.Group(); sg.add(shaft);
        const flag = box(0.5, 0.15, 2.2, mat(0xffb000)); flag.position.z = -1.0; flag.position.y = 0.3; sg.add(flag);
        g.add(at(sg, 26, 3.3, -64));
        dyn.push({ update: (snap) => { const a = Number(snap?.parts?.[part.id]?.angle ?? 0); sg.rotation.y = -(a * Math.PI) / 180; } });
        break;
      }
      case 'dc_motor': {
        const body = cyl(1.5, 3, mat(0xc7ccd4, { metalness: 0.7, roughness: 0.3 })); body.rotation.x = Math.PI / 2; g.add(at(body, 5, 1.8, -20));
        const shaft = cyl(0.12, 1.2, mat(0x888888)); shaft.rotation.x = Math.PI / 2; g.add(at(shaft, 5, 1.8, -36));
        const fan = box(2.4, 0.08, 0.35, mat(0xff7a00)); const fg = new THREE.Group(); fg.add(fan); g.add(at(fg, 5, 1.8, -42)); fg.rotation.x = Math.PI / 2;
        let ang = 0, lt = performance.now();
        dyn.push({ update: (snap) => { const now = performance.now(); const rpm = Number(snap?.parts?.[part.id]?.rpm ?? 0); ang += (rpm / 60) * 2 * Math.PI * ((now - lt) / 1000) * 0.15; lt = now; fg.rotation.y = ang; } });
        break;
      }
      case 'lcd1602': case 'lcd1602_i2c': {
        const pcb = box(174 * S, 0.2, 84 * S, mat(0x126c3a)); g.add(at(pcb, 75, 2.2, -44));
        const frame = box(154 * S, 0.5, 56 * S, mat(0x1a1d22)); g.add(at(frame, 75, 2.5, -46));
        const { tex, canvas } = canvasTexture(512, 160, () => undefined);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(142 * S, 44 * S), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6 }));
        scr.rotation.x = -Math.PI / 2; g.add(at(scr, 75, 2.77, -46));
        let lastTxt = '';
        const draw = (lines: string[], on: boolean) => {
          const c = canvas.getContext('2d')!;
          c.fillStyle = on ? '#7fd04a' : '#4a6a2a'; c.fillRect(0, 0, 512, 160);
          c.fillStyle = '#13230f'; c.font = 'bold 50px Courier New, monospace';
          for (let r = 0; r < 2; r++) for (let i = 0; i < 16; i++) { c.fillStyle = 'rgba(0,0,0,0.07)'; c.fillRect(8 + i * 31.2, 10 + r * 74, 28, 66); c.fillStyle = '#13230f'; c.fillText((lines[r] ?? '')[i] ?? ' ', 10 + i * 31.2, 62 + r * 74); }
          tex.needsUpdate = true;
        };
        draw(['', ''], false);
        dyn.push({ update: (snap) => { const o = snap?.parts?.[part.id]; const lines = o?.displayOn ? o.lines : ['', '']; const key = JSON.stringify(lines) + !!o?.displayOn; if (key !== lastTxt) { lastTxt = key; draw(lines, !!o?.powered); } } });
        break;
      }
      default: {
        // generic component block (sensors, ICs, supplies)
        const colors: Record<string, number> = { dht11: 0x2f7fd6, hcsr04: 0x1a4f9c, tmp36: 0x1c1e22, npn: 0x1c1e22, ntc: 0x2b6fd8, ldr: 0xd9902f, capacitor: 0x2747a6, diode: 0x1c1e22, inductor: 0x3f8f4d, switch: 0x1f2a3a, dc_supply: 0x1e2530, seven_segment: 0x202328, hc595: 0x1c1e22, fsr: 0x1f2226 };
        const sizes: Record<string, [number, number, number, number, number]> = { // w,h,d, cx, cz (px)
          dht11: [32, 2, 38, 10, -25], hcsr04: [82, 0.4, 38, 15, -25], tmp36: [20, 1.6, 6, 10, -6], npn: [20, 1.6, 6, 10, -6], ntc: [12, 1, 12, 5, -12], ldr: [14, 0.6, 14, 5, -14],
          capacitor: [14, 2.2, 14, 5, -18], diode: [16, 0.8, 9, 15, 0], inductor: [20, 1.1, 11, 15, 0], switch: [32, 1, 12, 10, -10], dc_supply: [40, 2.5, 36, 10, -24], seven_segment: [52, 1.2, 28, 20, 15], hc595: [78, 1.4, 22, 35, 15], fsr: [20, 0.3, 24, 5, -26],
        };
        const sz = sizes[part.type] ?? [20, 1, 10, 10, 0];
        const b = box(sz[0] * S, sz[1], sz[2] * S, mat(colors[part.type] ?? 0x445566)); g.add(at(b, sz[3], 0.9 + sz[1] / 2, sz[4]));
        if (part.type === 'hcsr04') for (const x of [-8, 38]) { const t = cyl(1.4, 1.4, mat(0xc9ced6, { metalness: 0.7 })); t.rotation.x = Math.PI / 2; g.add(at(t, x, 2.1, -25)); }
        if (part.type === 'seven_segment') {
          const m = mat(0x330000, { emissive: 0xff2020, emissiveIntensity: 0 });
          const seg = box(1.6, 0.1, 2.0, m); g.add(at(seg, 20, 1.56, 15));
          dyn.push({ update: (snap) => { const o = snap?.parts?.[part.id]?.avg ?? {}; const n = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].reduce((s, k) => s + Math.min(1, Number(o['current_' + k] ?? 0) / 0.015), 0); m.emissiveIntensity = n / 3; } });
        }
      }
    }
    scene.add(g);
  }
  // jumper wires as tubes arching between endpoints
  const pos = (ep: string) => { const i = ep.indexOf('.'); const part = project.parts.find((q) => q.id === ep.slice(0, i)); const w = part && pinWorld(part, ep.slice(i + 1)); if (!w || !part) return null; const y = part.type === 'uno' ? 1.0 : part.type === 'breadboard' ? 0.9 : 1.2; return new THREE.Vector3(w.x * S, y, w.y * S); };
  for (const w of project.wires) {
    const a = pos(w.from), b = pos(w.to);
    if (!a || !b) continue;
    const d = a.distanceTo(b);
    const lift = Math.min(6, 0.8 + d * 0.35);
    const curve = new THREE.CubicBezierCurve3(a, a.clone().add(new THREE.Vector3(0, lift, 0)), b.clone().add(new THREE.Vector3(0, lift, 0)), b);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.17, 10, false), new THREE.MeshStandardMaterial({ color: new THREE.Color(w.color ?? '#2f9bff'), roughness: 0.4 }));
    scene.add(tube);
    for (const e of [a, b]) { const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8 })); tip.position.copy(e).add(new THREE.Vector3(0, 0.2, 0)); scene.add(tip); }
  }
}

export default function Board3D() {
  const host = useRef<HTMLDivElement>(null);
  const project = useStore((s) => s.project);
  const theme = useStore((s) => s.theme);
  const ctx = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; root: THREE.Group; camera: THREE.PerspectiveCamera; controls: OrbitControls; dyn: Dyn[] } | null>(null);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); }
    catch { el.innerHTML = '<div class="webgl-fail">WebGL غير متاح على هذا الجهاز / WebGL not available</div>'; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    camera.position.set(30, 55, 75);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 10; controls.maxDistance = 220;
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x1a2233, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(30, 80, 40); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x0f1726, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; scene.add(ground);
    const grid = new THREE.GridHelper(400, 80, 0x22324d, 0x172338); grid.position.y = 0; scene.add(grid);
    const root = new THREE.Group(); scene.add(root);
    ctx.current = { renderer, scene, root, camera, controls, dyn: [] };
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0;
    // keyboard navigation (focus the view first): WASD pan, Q/E rotate, R/F or +/- zoom
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if ('wasdqerf+-='.includes(k) || k.startsWith('arrow')) { keys.add(k); e.preventDefault(); } };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const blur = () => keys.clear();
    el.tabIndex = 0;
    el.addEventListener('keydown', kd); el.addEventListener('keyup', ku); el.addEventListener('blur', blur);
    el.addEventListener('pointerdown', () => el.focus());
    let last = performance.now();
    const fwd = new THREE.Vector3(), right = new THREE.Vector3(), off = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const steer = () => {
      const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!keys.size) return;
      const dist = camera.position.distanceTo(controls.target);
      camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd, up).normalize();
      const sp = dist * 0.9 * dt; const move = new THREE.Vector3();
      if (keys.has('w') || keys.has('arrowup')) move.addScaledVector(fwd, sp);
      if (keys.has('s') || keys.has('arrowdown')) move.addScaledVector(fwd, -sp);
      if (keys.has('d') || keys.has('arrowright')) move.addScaledVector(right, sp);
      if (keys.has('a') || keys.has('arrowleft')) move.addScaledVector(right, -sp);
      camera.position.add(move); controls.target.add(move);
      const rot = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
      if (rot) { off.subVectors(camera.position, controls.target).applyAxisAngle(up, rot * 1.6 * dt); camera.position.copy(controls.target).add(off); }
      const zoom = (keys.has('f') || keys.has('-') ? 1 : 0) - (keys.has('r') || keys.has('+') || keys.has('=') ? 1 : 0);
      if (zoom) { off.subVectors(camera.position, controls.target); const L = THREE.MathUtils.clamp(off.length() * (1 + zoom * 1.2 * dt), controls.minDistance, controls.maxDistance); off.setLength(L); camera.position.copy(controls.target).add(off); }
    };
    const loop = () => { raf = requestAnimationFrame(loop); steer(); controls.update(); for (const d of ctx.current!.dyn) d.update(getState().snap); renderer.render(scene, camera); };
    loop();
    return () => { cancelAnimationFrame(raf); el.removeEventListener('keydown', kd); el.removeEventListener('keyup', ku); el.removeEventListener('blur', blur); ro.disconnect(); controls.dispose(); renderer.dispose(); el.innerHTML = ''; ctx.current = null; };
  }, []);

  useEffect(() => {
    const c = ctx.current; if (!c) return;
    c.root.traverse((o: any) => { o.geometry?.dispose?.(); if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose()); else o.material?.dispose?.(); });
    c.root.clear(); c.dyn = [];
    buildScene(project, c.root, c.dyn);
    // frame the content
    const bb = new THREE.Box3().setFromObject(c.root);
    if (!bb.isEmpty()) {
      const center = bb.getCenter(new THREE.Vector3()); const size = bb.getSize(new THREE.Vector3());
      c.controls.target.copy(center);
      // fit the whole bench in view: distance from the horizontal FOV, viewed from ~50° elevation
      const aspect = c.camera.aspect || 1.6;
      const hfov = 2 * Math.atan(Math.tan((c.camera.fov * Math.PI) / 360) * aspect);
      const dist = Math.max((size.x / 2) / Math.tan(hfov / 2), (size.z / 2) / Math.tan((c.camera.fov * Math.PI) / 360)) * 1.02;
      c.camera.position.set(center.x, center.y + dist * 0.77, center.z + dist * 0.64);
      c.camera.lookAt(center);
    }
  }, [project.parts, project.wires]);

  useEffect(() => { const c = ctx.current; if (c) c.scene.background = new THREE.Color(theme === 'light' ? 0xe9eef6 : 0x0b1220); }, [theme]);
  const lang = useStore((s) => s.lang);
  return (
    <div className="three-wrap">
      <div ref={host} className="three-host" data-testid="view-3d" />
      <div className="three-keys">{lang === 'ar' ? 'انقر ثم: ' : 'Click, then: '}<bdi dir="ltr"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></bdi> {lang === 'ar' ? 'تحريك' : 'pan'} · <bdi dir="ltr"><kbd>Q</kbd><kbd>E</kbd></bdi> {lang === 'ar' ? 'تدوير' : 'rotate'} · <bdi dir="ltr"><kbd>R</kbd><kbd>F</kbd></bdi> {lang === 'ar' ? 'تقريب' : 'zoom'}</div>
    </div>
  );
}
// keep three.js out of tests that import this file indirectly
export const __unused = subscribe;
