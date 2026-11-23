import React, { Suspense, lazy, useEffect } from 'react';
import { useStore, setState } from './store';
import { TopBar, NavRail, Sidebar, EditorPanel, MetricCards, SerialMonitor, ResultsPanel, ExportPanel, StatusBar, Inspector, PaletteItem, useT } from './components/Panels';
import CircuitCanvas from './views/CircuitCanvas';
import Schematic from './views/Schematic';
import Timeline from './views/Timeline';
import { PartsPage, LibraryPage, LessonsPage, ProjectsPage, InstrumentsPage, ToolsPage, SettingsPage, HelpModal, UploadModal } from './pages/Pages';
import { Icon } from './components/Icons';
import { PARTS } from '../shared/parts/catalog';
import * as A from './actions';

const Board3D = lazy(() => import('./views/Board3D'));

function CenterPanel() {
  const t = useT();
  const tab = useStore((s) => s.centerTab);
  const view = useStore((s) => s.simView);
  const tabs: [typeof tab, Parameters<typeof t>[0]][] = [['sim', 'tab_sim'], ['wiring', 'tab_wiring'], ['schematic', 'tab_schematic'], ['timeline', 'tab_timeline']];
  return (
    <section className="center">
      <div className="tabs">
        {tabs.map(([k, l]) => <button key={k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setState({ centerTab: k })} data-testid={'tab-' + k}>{t(l)}</button>)}
      </div>
      <div className="center-body card flush">
        {tab === 'sim' && (view === '3d' ? <Suspense fallback={<div className="loading">…</div>}><Board3D /></Suspense> : view === 'sch' ? <Schematic /> : <CircuitCanvas />)}
        {tab === 'wiring' && <CircuitCanvas />}
        {tab === 'schematic' && <Schematic />}
        {tab === 'timeline' && <Timeline />}
        {(tab === 'wiring' || (tab === 'sim' && view === 'bb')) && <Inspector />}
      </div>
      {tab === 'sim' && <MetricCards />}
      {tab === 'sim' && (
        <div className="view-switch">
          <button className={view === '3d' ? 'on' : ''} onClick={() => setState({ simView: '3d' })} data-testid="view-3d-btn"><Icon name="cube" /> {t('view3d')}</button>
          <button className={view === 'bb' ? 'on' : ''} onClick={() => setState({ simView: 'bb' })} data-testid="view-bb-btn"><Icon name="grid" /> {t('viewBB')}</button>
          <button className={view === 'sch' ? 'on' : ''} onClick={() => setState({ simView: 'sch' })} data-testid="view-sch-btn"><Icon name="schematic" /> {t('viewSch')}</button>
        </div>
      )}
    </section>
  );
}

function Home() {
  return (
    <div className="ws home">
      <Sidebar />
      <EditorPanel />
      <CenterPanel />
      <div className="right"><SerialMonitor /><ResultsPanel /><ExportPanel /></div>
    </div>
  );
}
function EditorPage() {
  return <div className="ws editor-page"><EditorPanel wide /><div className="right"><SerialMonitor tall /><ResultsPanel /></div></div>;
}
function CircuitPage() {
  const lang = useStore((s) => s.lang);
  return (
    <div className="ws circuit-page">
      <aside className="sidebar card palette-full">
        <h3>{lang === 'ar' ? 'المكونات' : 'Components'}</h3>
        <div className="pal-grid">{PARTS.filter((p) => p.type !== 'uno').map((p) => <PaletteItem key={p.type} type={p.type} />)}</div>
      </aside>
      <section className="center"><div className="center-body card flush"><CircuitCanvas /><Inspector /></div><MetricCards /></section>
    </div>
  );
}

export default function App() {
  const page = useStore((s) => s.page);
  const lang = useStore((s) => s.lang);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const modal = useStore((s) => s.modal);
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.dataset.theme = theme; }, [lang, theme]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); A.saveProject(e.shiftKey); }
      if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); A.openProject(); }
      if (e.key === 'F5') { e.preventDefault(); A.runSimulation(); }
    };
    window.addEventListener('keydown', onKey);
    const beforeUnload = () => { try { localStorage.setItem('asp-autosave', JSON.stringify((window as any).__aspState?.().project)); } catch { /* ignore */ } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);
  return (
    <div className={'app ' + lang}>
      <TopBar />
      <div className="main">
        <NavRail />
        <div className="content">
          {page === 'home' && <Home />}
          {page === 'editor' && <EditorPage />}
          {page === 'circuit' && <CircuitPage />}
          {page === 'parts' && <PartsPage />}
          {page === 'library' && <LibraryPage />}
          {page === 'lessons' && <LessonsPage />}
          {page === 'projects' && <ProjectsPage />}
          {page === 'instruments' && <InstrumentsPage />}
          {page === 'tools' && <ToolsPage />}
          {page === 'settings' && <SettingsPage />}
        </div>
      </div>
      <StatusBar />
      {toast && <div className={'toast ' + toast.kind} data-testid="toast">{toast.text}</div>}
      {modal === 'help' && <HelpModal />}
      {modal === 'upload' && <UploadModal />}
    </div>
  );
}
