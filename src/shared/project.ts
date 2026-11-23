/** Project model (saved as .asproj JSON) and validation. */
import { PART_MAP, defaultProps } from './parts/catalog';

export const PROJECT_FORMAT = 'arduino-simulator-pro/project';
export const PROJECT_VERSION = 1;

export interface PartInstance {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation?: number;
  props: Record<string, number | string>;
}
export interface Wire {
  id: string;
  from: string; // "partId.pinId"
  to: string;
  color?: string;
  points?: { x: number; y: number }[];
}
export interface Project {
  format: typeof PROJECT_FORMAT;
  version: number;
  name: string;
  board: 'uno';
  code: string;
  parts: PartInstance[];
  wires: Wire[];
  probes?: string[]; // nets shown on oscilloscope
  createdAt?: string;
  updatedAt?: string;
}

export function emptyProject(name = 'مشروع جديد'): Project {
  return {
    format: PROJECT_FORMAT, version: PROJECT_VERSION, name, board: 'uno',
    code: 'void setup() {\n  \n}\n\nvoid loop() {\n  \n}\n',
    parts: [{ id: 'uno', type: 'uno', x: 40, y: 40, props: {} }],
    wires: [],
  };
}

export class ProjectError extends Error {}

const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/;

/** Strict validation of an untrusted project file. Throws ProjectError with a readable message. */
export function validateProject(input: unknown): Project {
  if (!input || typeof input !== 'object') throw new ProjectError('Project must be a JSON object');
  const o = input as Record<string, unknown>;
  if (o.format !== PROJECT_FORMAT) throw new ProjectError('Not an Arduino Simulator Pro project (format field)');
  if (typeof o.version !== 'number' || o.version > PROJECT_VERSION) throw new ProjectError('Unsupported project version');
  if (typeof o.code !== 'string' || o.code.length > 200000) throw new ProjectError('Invalid code field');
  if (!Array.isArray(o.parts) || o.parts.length > 500) throw new ProjectError('Invalid parts list');
  if (!Array.isArray(o.wires) || o.wires.length > 2000) throw new ProjectError('Invalid wires list');
  const ids = new Set<string>();
  const parts: PartInstance[] = o.parts.map((p: any, i: number) => {
    if (!p || typeof p !== 'object') throw new ProjectError(`Part #${i + 1} invalid`);
    if (typeof p.id !== 'string' || !ID_RE.test(p.id)) throw new ProjectError(`Part #${i + 1}: invalid id`);
    if (ids.has(p.id)) throw new ProjectError(`Duplicate part id ${p.id}`);
    ids.add(p.id);
    if (!PART_MAP[p.type]) throw new ProjectError(`Part ${p.id}: unknown type ${p.type}`);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new ProjectError(`Part ${p.id}: invalid position`);
    const rot = p.rotation ?? 0;
    if (![0, 90, 180, 270].includes(rot)) throw new ProjectError(`Part ${p.id}: rotation must be 0/90/180/270`);
    const props = { ...defaultProps(p.type) };
    if (p.props && typeof p.props === 'object') {
      for (const def of PART_MAP[p.type].props) {
        const v = p.props[def.key];
        if (v === undefined) continue;
        if (def.type === 'number') {
          if (typeof v !== 'number' || !Number.isFinite(v)) throw new ProjectError(`Part ${p.id}: ${def.key} must be a finite number`);
          if (def.min !== undefined && v < def.min) throw new ProjectError(`Part ${p.id}: ${def.key} below minimum ${def.min}`);
          if (def.max !== undefined && v > def.max) throw new ProjectError(`Part ${p.id}: ${def.key} above maximum ${def.max}`);
        } else if (def.type === 'select') {
          if (!def.options!.some((op) => op.value === v)) throw new ProjectError(`Part ${p.id}: invalid ${def.key}`);
        } else if (typeof v !== 'string') throw new ProjectError(`Part ${p.id}: invalid ${def.key}`);
        props[def.key] = v;
      }
    }
    return { id: p.id, type: p.type, x: p.x, y: p.y, rotation: rot, props };
  });
  if (!parts.some((p) => p.type === 'uno')) throw new ProjectError('Project needs an Arduino Uno board');
  const wids = new Set<string>();
  const wires: Wire[] = o.wires.map((w: any, i: number) => {
    if (!w || typeof w !== 'object') throw new ProjectError(`Wire #${i + 1} invalid`);
    const id = typeof w.id === 'string' ? w.id : `w${i + 1}`;
    if (wids.has(id)) throw new ProjectError(`Duplicate wire id ${id}`);
    wids.add(id);
    for (const end of [w.from, w.to]) {
      if (typeof end !== 'string') throw new ProjectError(`Wire ${id}: endpoints must be "part.pin"`);
      const [pid, pin] = splitEndpoint(end);
      const part = parts.find((p) => p.id === pid);
      if (!part) throw new ProjectError(`Wire ${id}: unknown part ${pid}`);
      if (!PART_MAP[part.type].pins.some((pp) => pp.id === pin)) throw new ProjectError(`Wire ${id}: ${part.type} has no pin ${pin}`);
    }
    const points = Array.isArray(w.points) ? w.points.filter((pt: any) => Number.isFinite(pt?.x) && Number.isFinite(pt?.y)).slice(0, 50) : undefined;
    return { id, from: w.from, to: w.to, color: typeof w.color === 'string' ? w.color.slice(0, 20) : undefined, points };
  });
  return {
    format: PROJECT_FORMAT, version: PROJECT_VERSION,
    name: typeof o.name === 'string' ? o.name.slice(0, 120) : 'Project', board: 'uno', code: o.code,
    parts, wires,
    probes: Array.isArray(o.probes) ? o.probes.filter((x) => typeof x === 'string').slice(0, 8) as string[] : undefined,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : undefined,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : undefined,
  };
}

export function splitEndpoint(ep: string): [string, string] {
  const i = ep.indexOf('.');
  if (i <= 0) return [ep, ''];
  return [ep.slice(0, i), ep.slice(i + 1)];
}
