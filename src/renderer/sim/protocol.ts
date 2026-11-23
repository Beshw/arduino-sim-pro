import type { Project } from '../../shared/project';
import type { Snapshot, GpioEvent, ProbeSample } from '../../shared/cosim';
export type ToWorker =
  | { type: 'load'; project: Project; hex: string | null; probes: string[]; autorun: boolean }
  | { type: 'run' } | { type: 'pause' } | { type: 'stop' }
  | { type: 'step'; seconds: number }
  | { type: 'setProp'; part: string; key: string; value: number | string }
  | { type: 'serial'; text: string }
  | { type: 'speed'; value: number }
  | { type: 'probes'; probes: string[] };
export type FromWorker =
  | { type: 'loaded'; ok: true; nodes: number; elements: number }
  | { type: 'frame'; snap: Snapshot; gpio: GpioEvent[]; probes: Record<string, ProbeSample[]>; rt: number; running: boolean }
  | { type: 'state'; running: boolean }
  | { type: 'error'; message: string };
