/**
 * Modified Nodal Analysis (MNA) circuit solver.
 *
 * Real electrical engine used for DC operating point and transient analysis:
 *  - linear R, C, L, independent V/I sources, Norton sources (MCU pins)
 *  - nonlinear diodes/LEDs (Shockley) and NPN BJTs (Ebers–Moll) solved by
 *    damped Newton–Raphson with SPICE-style junction voltage limiting
 *  - backward-Euler companion models for C and L in transient
 * Node 0 is ground. All units SI (V, A, Ω, F, H, s).
 */

export type ElementKind = 'R' | 'C' | 'L' | 'V' | 'I' | 'N' | 'D' | 'Q';

export interface ElR { kind: 'R'; name: string; a: number; b: number; r: number }
export interface ElC { kind: 'C'; name: string; a: number; b: number; c: number; v0?: number }
export interface ElL { kind: 'L'; name: string; a: number; b: number; l: number; i0?: number }
export interface ElV { kind: 'V'; name: string; p: number; n: number; v: number }
export interface ElI { kind: 'I'; name: string; p: number; n: number; i: number } // current flows p -> n through the source (into n externally)
/** Norton source: conductance g between a and b, with current i injected into a. */
export interface ElN { kind: 'N'; name: string; a: number; b: number; g: number; i: number }
export interface ElD { kind: 'D'; name: string; a: number; k: number; is: number; n: number }
export interface ElQ { kind: 'Q'; name: string; c: number; b: number; e: number; is: number; bf: number; br: number }
export type Element = ElR | ElC | ElL | ElV | ElI | ElN | ElD | ElQ;

export const VT = 0.025852; // thermal voltage at 300K
export const GMIN = 1e-12;

export interface SolveResult {
  ok: boolean;
  converged: boolean;
  iterations: number;
  v: Float64Array; // node voltages (index = node)
  branch: Map<string, number>; // current through V and L elements (p->n inside element)
  current: Map<string, number>; // current for every element (a->b / anode->cathode / collector)
  error?: string;
}

let limitedFlag = false;
function pnjlim(vnew: number, vold: number, vt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    limitedFlag = true;
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      vnew = arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    } else {
      vnew = vt * Math.log(vnew / vt);
    }
  }
  return vnew;
}

export class Circuit {
  nodeCount: number;
  elements: Element[] = [];
  /** state for transient */
  private capV = new Map<string, number>();
  private indI = new Map<string, number>();
  private lastV: Float64Array;
  private junction = new Map<string, number[]>();

  constructor(nodeCount: number) {
    this.nodeCount = nodeCount;
    this.lastV = new Float64Array(nodeCount);
  }

  private cache: { branch: (ElV | ElL)[]; reactive: boolean; nonlinear: boolean } | null = null;
  add(e: Element) { this.elements.push(e); this.cache = null; return e; }
  private meta() {
    if (!this.cache) this.cache = { branch: this.elements.filter((e) => e.kind === 'V' || e.kind === 'L') as (ElV | ElL)[], reactive: this.elements.some((e) => e.kind === 'C' || e.kind === 'L'), nonlinear: this.elements.some((e) => e.kind === 'D' || e.kind === 'Q') };
    return this.cache;
  }

  /** allocate a new internal node */
  newNode(): number {
    const id = this.nodeCount++;
    const nv = new Float64Array(this.nodeCount); nv.set(this.lastV); this.lastV = nv;
    return id;
  }

  /** diode with optional series resistance (adds internal node). Returns element name of junction. */
  addDiode(name: string, a: number, k: number, model: { is: number; n: number; rs?: number }) {
    if (model.rs && model.rs > 0) {
      const mid = this.newNode();
      this.add({ kind: 'R', name: name + ':rs', a, b: mid, r: model.rs });
      this.add({ kind: 'D', name, a: mid, k, is: model.is, n: model.n });
    } else this.add({ kind: 'D', name, a, k, is: model.is, n: model.n });
  }

  resetState() {
    this.capV.clear(); this.indI.clear(); this.junction.clear();
    this.lastV = new Float64Array(this.nodeCount);
    for (const e of this.elements) {
      if (e.kind === 'C' && e.v0 !== undefined) this.capV.set(e.name, e.v0);
      if (e.kind === 'L' && e.i0 !== undefined) this.indI.set(e.name, e.i0);
    }
  }

  get hasReactive() { return this.meta().reactive; }
  get hasNonlinear() { return this.meta().nonlinear; }

  /**
   * Solve the circuit. dt=0 -> DC operating point (C open, L short).
   * dt>0 -> one backward-Euler transient step from stored state; commit=true updates state.
   */
  solve(dt = 0, commit = true, maxIter = 150): SolveResult {
    const n = this.nodeCount - 1; // unknown node voltages (ground excluded)
    const branchEls = this.meta().branch;
    const nonlinear = this.meta().nonlinear;
    const m = branchEls.length;
    const size = n + m;
    const branchIndex = new Map<string, number>();
    branchEls.forEach((e, i) => branchIndex.set(e.name, n + i));
    // Diodes with series resistance get an internal node handled by extending v vector virtually: approximate rs as part of diode by iterative solve (rs folded below)
    let v = new Float64Array(this.nodeCount);
    v.set(this.lastV.subarray(0, this.nodeCount));
    const A = new Float64Array(size * size);
    const z = new Float64Array(size);
    let converged = false;
    let iter = 0;
    let x: Float64Array = new Float64Array(size);
    const jstate = new Map<string, number[]>();
    for (const [k, val] of this.junction) jstate.set(k, [...val]);

    for (iter = 0; iter < maxIter; iter++) {
      A.fill(0); z.fill(0);
      limitedFlag = false;
      const wasLimited = () => limitedFlag;
      const idx = (r: number, c: number) => r * size + c;
      const stampG = (a: number, b: number, g: number) => {
        if (a > 0) A[idx(a - 1, a - 1)] += g;
        if (b > 0) A[idx(b - 1, b - 1)] += g;
        if (a > 0 && b > 0) { A[idx(a - 1, b - 1)] -= g; A[idx(b - 1, a - 1)] -= g; }
      };
      const stampI = (a: number, b: number, i: number) => { // current i flowing from a to b through element => leaves a, enters b
        if (a > 0) z[a - 1] -= i;
        if (b > 0) z[b - 1] += i;
      };
      for (let k = 1; k <= n; k++) A[idx(k - 1, k - 1)] += GMIN;
      for (const e of this.elements) {
        switch (e.kind) {
          case 'R': stampG(e.a, e.b, 1 / Math.max(e.r, 1e-6)); break;
          case 'N': stampG(e.a, e.b, e.g); stampI(e.b, e.a, e.i); break;
          case 'I': stampI(e.p, e.n, e.i); break;
          case 'C': {
            if (dt > 0) {
              const g = e.c / dt;
              const vp = this.capV.get(e.name) ?? 0;
              stampG(e.a, e.b, g); stampI(e.b, e.a, g * vp);
            } else stampG(e.a, e.b, 1e-12);
            break;
          }
          case 'V': {
            const br = branchIndex.get(e.name)!;
            if (e.p > 0) { A[idx(e.p - 1, br)] += 1; A[idx(br, e.p - 1)] += 1; }
            if (e.n > 0) { A[idx(e.n - 1, br)] -= 1; A[idx(br, e.n - 1)] -= 1; }
            z[br] += e.v;
            break;
          }
          case 'L': {
            const br = branchIndex.get(e.name)!;
            if (e.a > 0) { A[idx(e.a - 1, br)] += 1; A[idx(br, e.a - 1)] += 1; }
            if (e.b > 0) { A[idx(e.b - 1, br)] -= 1; A[idx(br, e.b - 1)] -= 1; }
            if (dt > 0) {
              const req = e.l / dt;
              A[idx(br, br)] -= req;
              z[br] -= req * (this.indI.get(e.name) ?? 0);
            } // DC: short (v_a - v_b = 0)
            break;
          }
          case 'D': {
            const nvt = e.n * VT;
            const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * e.is));
            const st = jstate.get(e.name) ?? [0];
            let vd = v[e.a] - v[e.k];
            vd = pnjlim(vd, st[0], nvt, vcrit);
            st[0] = vd; jstate.set(e.name, st);
            const ex = Math.exp(Math.min(vd / nvt, 80));
            const id = e.is * (ex - 1);
            const gd = (e.is / nvt) * ex + GMIN;
            stampG(e.a, e.k, gd); stampI(e.a, e.k, id - gd * vd);
            break;
          }
          case 'Q': {
            const st = jstate.get(e.name) ?? [0, 0];
            const vcrit = VT * Math.log(VT / (Math.SQRT2 * e.is));
            let vbe = pnjlim(v[e.b] - v[e.e], st[0], VT, vcrit);
            let vbc = pnjlim(v[e.b] - v[e.c], st[1], VT, vcrit);
            st[0] = vbe; st[1] = vbc; jstate.set(e.name, st);
            const ef = Math.exp(Math.min(vbe / VT, 80)), er = Math.exp(Math.min(vbc / VT, 80));
            const iF = e.is * (ef - 1), iR = e.is * (er - 1);
            const gF = (e.is / VT) * ef + GMIN, gR = (e.is / VT) * er + GMIN;
            // Transport model: Ic = iF - iR - iR/br ; Ib = iF/bf + iR/br ; Ie = -(Ic+Ib)
            const ic = iF - iR - iR / e.br;
            const ib = iF / e.bf + iR / e.br;
            // partial derivatives
            const dIc_dVbe = gF, dIc_dVbc = -gR - gR / e.br;
            const dIb_dVbe = gF / e.bf, dIb_dVbc = gR / e.br;
            // Linearise: Ic = ic0 + dIc_dVbe*(Vbe-vbe) + dIc_dVbc*(Vbc-vbc)
            const icEq = ic - dIc_dVbe * vbe - dIc_dVbc * vbc;
            const ibEq = ib - dIb_dVbe * vbe - dIb_dVbc * vbc;
            const nodes = [e.c, e.b, e.e];
            // current INTO collector (from external node into device) = Ic; into base = Ib; into emitter = -(Ic+Ib)
            // KCL row for node X: sum of currents leaving node into devices = ... ; we stamp as conductance entries
            // Vbe = Vb - Ve ; Vbc = Vb - Vc
            const addJ = (row: number, coefB: number, coefE: number, coefC: number, eq: number) => {
              if (row <= 0) return;
              const r = row - 1;
              if (e.b > 0) A[idx(r, e.b - 1)] += coefB;
              if (e.e > 0) A[idx(r, e.e - 1)] += coefE;
              if (e.c > 0) A[idx(r, e.c - 1)] += coefC;
              z[r] -= eq;
            };
            // Ic(V) = icEq + a*(Vb-Ve) + b*(Vb-Vc)
            const a1 = dIc_dVbe, b1 = dIc_dVbc;
            const a2 = dIb_dVbe, b2 = dIb_dVbc;
            addJ(e.c, a1 + b1, -a1, -b1, icEq);
            addJ(e.b, a2 + b2, -a2, -b2, ibEq);
            addJ(e.e, -(a1 + b1 + a2 + b2), a1 + a2, b1 + b2, -(icEq + ibEq));
            void nodes;
            break;
          }
        }
      }
      try {
        x = gaussSolve(A, z, size);
      } catch (err) {
        return { ok: false, converged: false, iterations: iter, v, branch: new Map(), current: new Map(), error: 'Singular circuit matrix (check floating parts or voltage-source loops)' };
      }
      const vNew = new Float64Array(this.nodeCount);
      for (let k = 1; k <= n; k++) vNew[k] = x[k - 1];
      let maxDelta = 0;
      for (let k = 1; k <= n; k++) maxDelta = Math.max(maxDelta, Math.abs(vNew[k] - v[k]));
      v = vNew;
      if (!nonlinear) { converged = true; break; }
      if (iter > 0 && maxDelta < 1e-7 && !wasLimited()) { converged = true; break; }
    }
    if (!converged && !this.hasNonlinear) converged = true;
    const branch = new Map<string, number>();
    for (const e of branchEls) branch.set(e.name, x[branchIndex.get(e.name)!]);
    const current = new Map<string, number>();
    for (const e of this.elements) {
      switch (e.kind) {
        case 'R': current.set(e.name, (v[e.a] - v[e.b]) / Math.max(e.r, 1e-6)); break;
        case 'N': current.set(e.name, e.g * (v[e.a] - v[e.b]) - e.i); break; // current a->b through element
        case 'I': current.set(e.name, e.i); break;
        case 'V': current.set(e.name, branch.get(e.name)!); break;
        case 'L': current.set(e.name, branch.get(e.name)!); break;
        case 'C': current.set(e.name, dt > 0 ? (e.c / dt) * ((v[e.a] - v[e.b]) - (this.capV.get(e.name) ?? 0)) : 0); break;
        case 'D': {
          current.set(e.name, diodeCurrent(e, v[e.a] - v[e.k]));
          break;
        }
        case 'Q': {
          const vbe = v[e.b] - v[e.e], vbc = v[e.b] - v[e.c];
          const iF = e.is * (Math.exp(Math.min(vbe / VT, 80)) - 1), iR = e.is * (Math.exp(Math.min(vbc / VT, 80)) - 1);
          current.set(e.name, iF - iR - iR / e.br);
          current.set(e.name + ':b', iF / e.bf + iR / e.br);
          break;
        }
      }
    }
    if (commit) {
      this.lastV = v;
      this.junction = jstate;
      if (dt > 0) {
        for (const e of this.elements) {
          if (e.kind === 'C') this.capV.set(e.name, v[e.a] - v[e.b]);
          if (e.kind === 'L') this.indI.set(e.name, branch.get(e.name)!);
        }
      } else {
        // after DC op, initialise reactive state consistently
        for (const e of this.elements) {
          if (e.kind === 'C') this.capV.set(e.name, e.v0 ?? (v[e.a] - v[e.b]));
          if (e.kind === 'L') this.indI.set(e.name, e.i0 ?? branch.get(e.name)!);
        }
      }
    }
    return { ok: converged, converged, iterations: iter + 1, v, branch, current, error: converged ? undefined : 'Newton iteration did not converge' };
  }

  /** set capacitor voltages directly (transient initial condition) */
  setCapacitorVoltage(name: string, v: number) { this.capV.set(name, v); }
}

export function diodeCurrent(e: ElD, vd: number): number {
  return e.is * (Math.exp(Math.min(vd / (e.n * VT), 80)) - 1);
}

export function gaussSolve(Ain: Float64Array, bin: Float64Array, n: number): Float64Array {
  const A = Float64Array.from(Ain);
  const b = Float64Array.from(bin);
  for (let col = 0; col < n; col++) {
    let piv = col, best = Math.abs(A[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(A[r * n + col]);
      if (val > best) { best = val; piv = r; }
    }
    if (best < 1e-18) throw new Error('singular');
    if (piv !== col) {
      for (let c = 0; c < n; c++) { const t = A[col * n + c]; A[col * n + c] = A[piv * n + c]; A[piv * n + c] = t; }
      const t = b[col]; b[col] = b[piv]; b[piv] = t;
    }
    const d = A[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r * n + col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r * n + c] -= f * A[col * n + c];
      b[r] -= f * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r * n + c] * x[c];
    x[r] = s / A[r * n + r];
  }
  return x;
}

/** LED/diode model presets. Saturation current derived so that Vf(20 mA) matches typical datasheet values. */
function led(vf20: number, n: number, rs: number, label: string, color: string) {
  const is = 0.02 / Math.exp((vf20 - 0.02 * rs) / (n * VT));
  return { is, n, rs, vf20, label, color };
}
export const DIODE_MODELS: Record<string, { is: number; n: number; rs: number; vf20: number; label: string; color: string }> = {
  red: led(2.0, 1.9, 5, 'Red LED', '#ff2a2a'),
  yellow: led(2.1, 1.9, 5, 'Yellow LED', '#ffd21f'),
  green: led(2.2, 1.9, 5, 'Green LED', '#2bff5a'),
  blue: led(3.1, 2.0, 8, 'Blue LED', '#3a7bff'),
  white: led(3.1, 2.0, 8, 'White LED', '#ffffff'),
  '1n4148': { is: 2.52e-9, n: 1.752, rs: 0.568, vf20: 0.85, label: '1N4148', color: '#999' },
  '1n4007': { is: 7.0e-9, n: 1.8, rs: 0.042, vf20: 0.75, label: '1N4007', color: '#333' },
};
