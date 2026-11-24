/** Minimal global store (useSyncExternalStore) – no external state library needed. */
import { useSyncExternalStore } from 'react';
import type { Project } from '../shared/project';
import type { Snapshot } from '../shared/cosim';
import type { Lang } from './i18n';
import { EXAMPLES } from '../shared/examples';

export type Page = 'home' | 'editor' | 'circuit' | 'parts' | 'library' | 'lessons' | 'projects' | 'instruments' | 'tools' | 'settings';
export type CenterTab = 'sim' | 'wiring' | 'schematic' | 'timeline';
export type SimView = '3d' | 'bb' | 'sch';
export type SimState = 'idle' | 'compiling' | 'running' | 'paused' | 'error';
export interface Diagnostic { line: number; column: number; severity: 'error' | 'warning' | 'note'; message: string; file?: string }
export interface CompileInfo {
  ok: boolean; message?: string; hex?: string; code: string; diagnostics: Diagnostic[];
  size?: { flash: number; ram: number; flashMax: number; ramMax: number }; log?: string; ms?: number; sha256?: Record<string, string>;
}
export interface SerialLine { t: string; text: string; dir: 'rx' | 'tx' }
export type Selection = { kind: 'part' | 'wire'; id: string } | null;

export interface AppState {
  lang: Lang; theme: 'dark' | 'light';
  page: Page; centerTab: CenterTab; simView: SimView;
  project: Project; filePath: string | null; dirty: boolean; savedAt: number | null;
  past: string[]; future: string[];
  selection: Selection;
  simState: SimState; simError: string | null; rt: number; speed: number;
  compile: CompileInfo | null;
  snap: Snapshot | null;
  serial: SerialLine[]; serialPartial: string;
  wireColor: string;
  toast: { text: string; kind: 'info' | 'error' | 'ok' } | null;
  circuitStale: boolean;
  modal: null | 'help' | 'upload';
  showTimestamps: boolean;
  /** 'sim' = virtual board, otherwise the real serial port path (COM3, /dev/ttyACM0) */
  serialSource: string;
  baud: number;
  /** lesson whose example is currently open (course progress) */
  lessonActive: string | null;
  lessonProgress: Record<string, { quiz?: boolean; ran?: boolean }>;
}

const initialProject = (() => {
  try { const s = localStorage.getItem('asp-autosave'); if (s) { const p = JSON.parse(s); if (p?.format) return p; } } catch { /* ignore */ }
  return EXAMPLES[0].project();
})();

let state: AppState = {
  lang: (localStorage.getItem('asp-lang') as Lang) || 'ar',
  theme: (localStorage.getItem('asp-theme') as 'dark' | 'light') || 'dark',
  page: 'home', centerTab: 'sim', simView: 'bb',
  project: initialProject, filePath: null, dirty: false, savedAt: null,
  past: [], future: [], selection: null,
  simState: 'idle', simError: null, rt: 0, speed: 1,
  compile: null, snap: null, serial: [], serialPartial: '',
  wireColor: '#2f9bff', toast: null, circuitStale: false, modal: null, showTimestamps: true, serialSource: 'sim', baud: 9600,
  lessonActive: null,
  lessonProgress: (() => { try { return JSON.parse(localStorage.getItem('asp-lessons') || '{}'); } catch { return {}; } })(),
};
const listeners = new Set<() => void>();

export const getState = () => state;
export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
export function useStore<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}
